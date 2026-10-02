"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";

function safeRedirectPath(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

// 메일 인증 링크(GET /api/v1/auth/verify-email)를 브라우저로 열면 API 가 ?email_verify=<결과> 로 이리 보낸다.
const EMAIL_VERIFY_NOTICES: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "이메일 인증이 완료되었습니다. 로그인해주세요.", ok: true },
  already: { text: "이미 인증된 이메일입니다. 로그인해주세요.", ok: true },
  expired: {
    text: "인증 링크의 유효시간이 지났습니다. 아이디와 비밀번호로 로그인을 시도하면 인증 메일을 다시 받을 수 있습니다.",
    ok: false,
  },
  invalid: { text: "인증 링크가 올바르지 않거나 이미 사용되었습니다.", ok: false },
};

export default function LoginPageClient() {
  const [redirectAfterLogin, setRedirectAfterLogin] = useState<string | null>(null);
  const [emailVerifyNotice, setEmailVerifyNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectAfterLogin(safeRedirectPath(params.get("redirect")));
    const verifyStatus = params.get("email_verify") ?? "";
    // hasOwnProperty 로 거른다 — ?email_verify=constructor 같은 값이 Object 의 기본 속성을 집어 오지 않게.
    setEmailVerifyNotice(
      Object.prototype.hasOwnProperty.call(EMAIL_VERIFY_NOTICES, verifyStatus) ? EMAIL_VERIFY_NOTICES[verifyStatus] : null
    );
  }, []);

  return (
    <Card className="auth-card auth-card--login">
      <CardHeader className="auth-card-head text-center">
        <h1 className="sr-only">로그인</h1>
        <CardTitle className="auth-card-title text-2xl">로그인</CardTitle>
        <CardDescription className="auth-card-desc">계정에 로그인하세요</CardDescription>
      </CardHeader>
      <CardContent className="auth-card-body">
        {emailVerifyNotice ? (
          <p
            role="status"
            className={`login-email-verify-notice mb-4 rounded-[4px] border p-3 text-sm leading-6 ${
              emailVerifyNotice.ok ? "border-border bg-muted/50" : "border-destructive/40 bg-destructive/5 text-destructive"
            }`}
          >
            {emailVerifyNotice.text}
          </p>
        ) : null}
        <LoginForm redirectAfterLogin={redirectAfterLogin} />
      </CardContent>
    </Card>
  );
}
