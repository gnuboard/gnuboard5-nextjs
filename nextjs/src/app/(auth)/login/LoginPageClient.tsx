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

export default function LoginPageClient() {
  const [redirectAfterLogin, setRedirectAfterLogin] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectAfterLogin(safeRedirectPath(params.get("redirect")));
  }, []);

  return (
    <Card className="auth-card auth-card--login">
      <CardHeader className="auth-card-head text-center">
        <h1 className="sr-only">로그인</h1>
        <CardTitle className="auth-card-title text-2xl">로그인</CardTitle>
        <CardDescription className="auth-card-desc">계정에 로그인하세요</CardDescription>
      </CardHeader>
      <CardContent className="auth-card-body">
        <LoginForm redirectAfterLogin={redirectAfterLogin} />
      </CardContent>
    </Card>
  );
}
