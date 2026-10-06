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
import { emailVerifyNoticeFor, type EmailVerifyNotice } from "@/lib/email-verify-notice";
import { safeRedirectPath } from "@/lib/safe-redirect";


export default function LoginPageClient() {
  const [redirectAfterLogin, setRedirectAfterLogin] = useState<string | null>(null);
  // 메일 인증 링크를 열고 돌아온 결과(?email_verify=). 로그인한 채로 열었다면 레이아웃이 따로 보여 준다.
  const [emailVerifyNotice, setEmailVerifyNotice] = useState<EmailVerifyNotice | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectAfterLogin(safeRedirectPath(params.get("redirect")));
    setEmailVerifyNotice(emailVerifyNoticeFor(params.get("email_verify")));
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
