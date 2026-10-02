"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter } from "next/navigation";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { useAuthStore } from "@/store/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { api, ApiError } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast";

interface LoginFormProps {
  redirectAfterLogin?: string | null;
  onNavigate?: () => void;
  onSuccess?: () => void;
  /**
   * compact: 사이드바 카드용. 이름표 없이 자리표시자만 있는 칸 두 개, 단추,
   * 그 아래 한 줄에 자동로그인과 회원가입·찾기 링크, 세로로 쌓인 소셜 단추.
   */
  variant?: "default" | "compact";
}

const LOGIN_ERROR_TRANSLATIONS: Record<string, string> = {
  "Invalid member ID or password.": "아이디 또는 비밀번호가 올바르지 않습니다.",
  "This account has been withdrawn.": "탈퇴한 회원 계정입니다.",
  "This account has been banned.": "이용이 제한된 회원 계정입니다.",
  "Validation failed.": "입력한 로그인 정보를 확인해주세요.",
  "Failed to fetch": "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
  "API Error": "로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
};

function localizedLoginError(message: unknown, fallback: string): string {
  if (typeof message !== "string" || !message.trim()) return fallback;

  const normalized = message.trim();
  if (LOGIN_ERROR_TRANSLATIONS[normalized]) {
    return LOGIN_ERROR_TRANSLATIONS[normalized];
  }

  return /[가-힣]/.test(normalized) ? normalized : fallback;
}

export function LoginForm({
  redirectAfterLogin,
  onNavigate,
  onSuccess,
  variant = "default",
}: LoginFormProps) {
  const router = useRouter();
  const idPrefix = useId();
  const { login, fetchUser } = useAuthStore();
  const [formData, setFormData] = useState({
    mb_id: "",
    mb_password: "",
    auto_login: false,
  });
  const [loading, setLoading] = useState(false);
  // 아이디 · 비밀번호는 맞았지만 메일 인증 전(403 EMAIL_NOT_VERIFIED) — 인증 메일 다시 보내기 단추를 낸다.
  const [needsEmailVerify, setNeedsEmailVerify] = useState(false);
  const [resending, setResending] = useState(false);

  const finishLogin = useCallback(() => {
    if (onSuccess) {
      onSuccess();
      return;
    }

    runtimeRouterPush(router, redirectAfterLogin || "/");
  }, [onSuccess, redirectAfterLogin, router]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== "social-login-result") return;

      if (data.status === "success") {
        void fetchUser().then(finishLogin);
      } else if (data.status === "error") {
        toastError(
          localizedLoginError(data.message, "소셜 로그인에 실패했습니다. 다시 시도해주세요.")
        );
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [fetchUser, finishLogin]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked, name, type, value } = e.target;
    if (name === "mb_id") setNeedsEmailVerify(false);
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleResendVerification = async () => {
    if (!formData.mb_id || !formData.mb_password) {
      toastError("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setResending(true);
    try {
      const res = await api.post<{ message?: string; email?: string; already_verified?: boolean }>(
        "/auth/resend-verification",
        { mb_id: formData.mb_id, mb_password: formData.mb_password }
      );
      if (res.data?.already_verified) {
        setNeedsEmailVerify(false);
        toastSuccess("이미 인증된 이메일입니다. 다시 로그인해주세요.");
        return;
      }
      toastSuccess(
        res.data?.email
          ? `${res.data.email} 주소로 인증 메일을 다시 보냈습니다. 메일함을 확인해주세요.`
          : "인증 메일을 다시 보냈습니다. 메일함을 확인해주세요."
      );
    } catch (err: unknown) {
      toastError(
        localizedLoginError(
          err instanceof Error ? err.message : undefined,
          "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요."
        )
      );
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.mb_id || !formData.mb_password) {
      toastError("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      await login(formData.mb_id, formData.mb_password, formData.auto_login);
      finishLogin();
    } catch (err: unknown) {
      setNeedsEmailVerify(err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED");
      const message = localizedLoginError(
        err instanceof Error ? err.message : undefined,
        "로그인에 실패했습니다. 잠시 후 다시 시도해주세요."
      );
      toastError(message);
    } finally {
      setLoading(false);
    }
  };

  const emailVerifyNotice = needsEmailVerify ? (
    <div className="login-verify-notice space-y-2 rounded-[4px] border border-border bg-muted/50 p-3 text-sm" role="status">
      <p className={variant === "compact" ? "text-xs leading-5" : "leading-6"}>
        가입할 때 받은 인증 메일의 링크를 눌러야 로그인할 수 있습니다. 메일이 없거나 링크 유효시간이 지났다면 다시 받으세요.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleResendVerification}
        disabled={resending || loading}
      >
        {resending ? "보내는 중..." : "인증 메일 다시 보내기"}
      </Button>
    </div>
  ) : null;

  const usernameId = `${idPrefix}-mb-id`;
  const passwordId = `${idPrefix}-mb-password`;
  const autoLoginId = `${idPrefix}-auto-login`;

  if (variant === "compact") {
    return (
      <form method="post" onSubmit={handleSubmit} className="login-form login-form--compact">
        <div className="space-y-2">
          <Input
            id={usernameId}
            name="mb_id"
            type="text"
            placeholder="아이디"
            aria-label="아이디"
            value={formData.mb_id}
            onChange={handleChange}
            autoComplete="username"
            disabled={loading}
            required
          />
          <Input
            id={passwordId}
            name="mb_password"
            type="password"
            placeholder="비밀번호"
            aria-label="비밀번호"
            value={formData.mb_password}
            onChange={handleChange}
            autoComplete="current-password"
            disabled={loading}
            required
          />
          <Button type="submit" className="login-submit w-full" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </Button>
          {emailVerifyNotice}
          <div className="login-form-links flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <label htmlFor={autoLoginId} className="flex cursor-pointer items-center gap-1.5">
              <input
                id={autoLoginId}
                name="auto_login"
                type="checkbox"
                checked={formData.auto_login}
                onChange={handleChange}
                disabled={loading}
                className="size-3.5 rounded border-border"
              />
              자동로그인
            </label>
            <span className="flex items-center gap-2">
              <Link href="/register" className="hover:text-foreground hover:underline" onClick={onNavigate}>
                회원가입
              </Link>
              <Link href="/forgot-password" className="hover:text-foreground hover:underline" onClick={onNavigate}>
                아이디·비밀번호 찾기
              </Link>
            </span>
          </div>
        </div>
        <SocialLoginButtons redirectAfterLogin={redirectAfterLogin} layout="stacked" />
      </form>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="login-form login-form--page">
      <div className="space-y-4">
        <div className="login-field space-y-2">
          <Label htmlFor={usernameId}>아이디</Label>
          <Input
            id={usernameId}
            name="mb_id"
            type="text"
            placeholder="아이디를 입력하세요"
            value={formData.mb_id}
            onChange={handleChange}
            autoComplete="username"
            disabled={loading}
            required
          />
        </div>
        <div className="login-field space-y-2">
          <Label htmlFor={passwordId}>비밀번호</Label>
          <Input
            id={passwordId}
            name="mb_password"
            type="password"
            placeholder="비밀번호를 입력하세요"
            value={formData.mb_password}
            onChange={handleChange}
            autoComplete="current-password"
            disabled={loading}
            required
          />
        </div>

        <label
          htmlFor={autoLoginId}
          className="login-remember flex cursor-pointer items-start gap-2 rounded-[4px] border border-[#e3e8e5] bg-[#fbfcfb] p-3 text-sm"
        >
          <input
            id={autoLoginId}
            name="auto_login"
            type="checkbox"
            checked={formData.auto_login}
            onChange={handleChange}
            disabled={loading}
            className="mt-0.5 size-4 rounded border-[#cfd8d3] accent-[#03c75a]"
          />
          <span className="min-w-0">
            <span className="block font-bold text-[#202124]">자동로그인</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              브라우저를 닫아도 30일 동안 로그인 상태를 유지합니다.
            </span>
          </span>
        </label>

        <Button type="submit" className="login-submit w-full" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </Button>

        {emailVerifyNotice}

        <SocialLoginButtons redirectAfterLogin={redirectAfterLogin} />

        <div className="login-page-links space-y-2 text-center text-sm text-muted-foreground">
          <p>
            비밀번호를 잊으셨나요?{" "}
            <Link
              href="/forgot-password"
              className="font-medium text-primary hover:underline"
              onClick={onNavigate}
            >
              비밀번호 찾기
            </Link>
          </p>
          <p>
            계정이 없으신가요?{" "}
            <Link
              href="/register"
              className="font-medium text-primary hover:underline"
              onClick={onNavigate}
            >
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </form>
  );
}

export default LoginForm;
