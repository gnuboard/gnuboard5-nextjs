"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { koreanApiErrorMessage } from "@/lib/api-error-messages";
import { useRouter } from "next/navigation";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { toastError } from "@/lib/toast";
import {
  PAYMENT_NOTICE_AUTO_DISMISS_MS,
  type PaymentNotice,
} from "./orderPaymentHelpers";

type UseOrderPaymentNoticeOptions = {
  setSubmitting: Dispatch<SetStateAction<boolean>>;
};

export function useOrderPaymentNotice({
  setSubmitting,
}: UseOrderPaymentNoticeOptions) {
  const router = useRouter();
  const [paymentNotice, setPaymentNotice] = useState<PaymentNotice | null>(null);

  useEffect(() => {
    if (!paymentNotice || paymentNotice.tone === "info") return;

    const timer = window.setTimeout(() => {
      setPaymentNotice(null);
    }, PAYMENT_NOTICE_AUTO_DISMISS_MS);

    return () => window.clearTimeout(timer);
  }, [paymentNotice]);

  useEffect(() => {
    const handlePaymentResult = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as
        | {
            type?: string;
            status?: "success" | "error" | "cancelled";
            orderId?: string;
            uid?: string;
            message?: string;
          }
        | undefined;
      if (!data || data.type !== "shop-payment-result") return;

      if (data.status === "success" && data.orderId) {
        setPaymentNotice({
          tone: "success",
          title: "결제가 완료되었습니다.",
          message: "주문 내역으로 이동합니다.",
        });
        runtimeRouterPush(
          router,
          `/shop/orders/${data.orderId}${data.uid ? `?uid=${encodeURIComponent(data.uid)}` : ""}`
        );
        return;
      }

      setSubmitting(false);
      const message =
        (data.message && koreanApiErrorMessage(data.message, 0)) ||
        (data.status === "cancelled"
          ? "결제가 취소되었습니다."
          : "결제가 완료되지 않았습니다.");
      setPaymentNotice({
        tone: "error",
        title:
          data.status === "cancelled"
            ? "결제가 취소되었습니다."
            : "결제가 완료되지 않았습니다.",
        message,
      });
      toastError(message, { duration: PAYMENT_NOTICE_AUTO_DISMISS_MS });
    };

    window.addEventListener("message", handlePaymentResult);
    return () => window.removeEventListener("message", handlePaymentResult);
  }, [router, setSubmitting]);

  const noticeClassName =
    paymentNotice?.tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : paymentNotice?.tone === "success"
        ? "border-green-200 bg-green-50 text-green-900"
        : "border-blue-200 bg-blue-50 text-blue-900";

  return {
    paymentNotice,
    setPaymentNotice,
    noticeClassName,
  };
}
