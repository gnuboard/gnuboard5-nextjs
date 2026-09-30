"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type { ShopProduct } from "@/lib/api";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast";
import { useAuthStore } from "@/store/auth";
import { useRestockAlertStore } from "@/store/restock-alerts";

export function useProductMemberActions(product: ShopProduct | null) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const isAuthInitialized = useAuthStore((s) => s.isInitialized);
  const { isAlerted, addAlert, removeAlert } = useRestockAlertStore();
  const [restockDialogOpen, setRestockDialogOpen] = useState(false);
  const [restockHp, setRestockHp] = useState("");
  const [restockAgree, setRestockAgree] = useState(false);
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const [recommendDialogOpen, setRecommendDialogOpen] = useState(false);
  const [recommendToEmail, setRecommendToEmail] = useState("");
  const [recommendSubject, setRecommendSubject] = useState("");
  const [recommendContent, setRecommendContent] = useState("");
  const [recommendSubmitting, setRecommendSubmitting] = useState(false);

  const redirectToLogin = useCallback(() => {
    toastInfo("로그인 후 이용해주세요.");
    runtimeRouterPush(router, `/shop/login?redirect=${encodeURIComponent(pathname)}`);
  }, [pathname, router]);

  const requireLogin = useCallback(() => {
    if (!isAuthInitialized) {
      toastInfo("로그인 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    if (!user) {
      redirectToLogin();
      return false;
    }

    return true;
  }, [isAuthInitialized, redirectToLogin, user]);

  const handleMemberActionError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin();
        return;
      }

      const message = err instanceof Error ? err.message : fallbackMessage;
      toastError(message);
    },
    [redirectToLogin]
  );

  const openRestockDialog = useCallback(() => {
    if (!requireLogin()) return;

    const userHp = (user as { mb_hp?: string } | null)?.mb_hp ?? "";
    setRestockHp(userHp);
    setRestockAgree(false);
    setRestockDialogOpen(true);
  }, [requireLogin, user]);

  const submitRestockAlert = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!product) return;

      const hp = restockHp.trim();
      if (!hp) {
        toastError("휴대폰 번호를 입력해주세요.");
        return;
      }

      if (!restockAgree) {
        toastError("개인정보처리방침 안내에 동의해 주세요.");
        return;
      }

      setRestockSubmitting(true);
      try {
        await api.post(`/shop/products/${encodeURIComponent(product.it_id)}/stock-notify`, {
          hp,
          agree: true,
        });
        addAlert(product.it_id, product.it_name);
        setRestockDialogOpen(false);
        setRestockAgree(false);
        toastSuccess("재입고 시 SMS로 알려드리겠습니다.");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "요청에 실패했습니다.";
        toastError(message);
      } finally {
        setRestockSubmitting(false);
      }
    },
    [addAlert, product, restockAgree, restockHp]
  );

  const openRecommendDialog = useCallback(() => {
    if (!product || !requireLogin()) return;

    setRecommendToEmail("");
    setRecommendSubject(`${product.it_name} 추천`);
    setRecommendContent("");
    setRecommendDialogOpen(true);
  }, [product, requireLogin]);

  const submitRecommendation = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!product || !requireLogin()) return;

      const toEmail = recommendToEmail.trim();
      const subject = recommendSubject.trim();
      const content = recommendContent.trim();
      if (!toEmail || !subject || !content) {
        toastError("받는 사람 이메일, 제목, 내용을 입력해주세요.");
        return;
      }

      setRecommendSubmitting(true);
      try {
        const fromName = (user as { mb_nick?: string; mb_name?: string } | null)?.mb_nick
          || (user as { mb_name?: string } | null)?.mb_name
          || "";
        await api.post(`/shop/products/${encodeURIComponent(product.it_id)}/recommend`, {
          to_email: toEmail,
          from_name: fromName,
          subject,
          content,
        });
        setRecommendDialogOpen(false);
        toastSuccess("추천 메일을 발송했습니다.");
      } catch (err: unknown) {
        handleMemberActionError(err, "발송에 실패했습니다.");
      } finally {
        setRecommendSubmitting(false);
      }
    },
    [
      handleMemberActionError,
      product,
      recommendContent,
      recommendSubject,
      recommendToEmail,
      requireLogin,
      user,
    ]
  );

  const handleRemoveRestockAlert = useCallback(() => {
    if (!product) return;
    removeAlert(product.it_id);
    toastInfo("재입고 알림이 해제되었습니다.");
  }, [product, removeAlert]);

  useEffect(() => {
    if (!product || product.it_soldout === "1" || !isAlerted(product.it_id)) return;

    toastInfo(`${product.it_name} 재입고되었습니다!`);
    removeAlert(product.it_id);
  }, [product, isAlerted, removeAlert]);

  return {
    user,
    isAuthInitialized,
    requireLogin,
    handleMemberActionError,
    restockAlerted: product ? isAlerted(product.it_id) : false,
    handleRemoveRestockAlert,
    restockDialogOpen,
    setRestockDialogOpen,
    restockHp,
    setRestockHp,
    restockAgree,
    setRestockAgree,
    restockSubmitting,
    openRestockDialog,
    submitRestockAlert,
    recommendDialogOpen,
    setRecommendDialogOpen,
    recommendToEmail,
    setRecommendToEmail,
    recommendSubject,
    setRecommendSubject,
    recommendContent,
    setRecommendContent,
    recommendSubmitting,
    openRecommendDialog,
    submitRecommendation,
  };
}
