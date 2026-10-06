"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { G5Link as Link } from "@/components/ui/g5-link";
import { emailVerifyNoticeFor, type EmailVerifyNotice } from "@/lib/email-verify-notice";
import { runtimeRouterReplace } from "@/lib/runtime-router";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { useAuthStore } from "@/store/auth";

/**
 * 로그인한 채로 메일 인증 링크를 연 경우(이메일을 바꾼 회원) — 곧바로 다른 화면으로 보내면 결과를 볼 수
 * 없으므로 그 자리에서 알린다. 알림 대신 카드로 보이는 까닭: PHP 테마에서는 이동이 페이지를 새로 읽어
 * 알림(토스트)이 사라진다.
 */
function SignedInEmailVerifyNotice({ notice }: { notice: EmailVerifyNotice }) {
  return (
    <Card className="auth-card auth-card--email-verify">
      <CardHeader className="auth-card-head text-center">
        <CardTitle className="auth-card-title text-2xl">이메일 인증</CardTitle>
      </CardHeader>
      <CardContent className="auth-card-body">
        <p
          role="status"
          className={`rounded-[4px] border p-3 text-sm leading-6 ${
            notice.ok ? "border-border bg-muted/50" : "border-destructive/40 bg-destructive/5 text-destructive"
          }`}
        >
          {notice.signedInText}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="w-full sm:flex-1">
            <Link href="/">홈으로</Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:flex-1">
            <Link href="/mypage">마이페이지</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const [verifyNotice, setVerifyNotice] = useState<EmailVerifyNotice | null>(null);

  useEffect(() => {
    if (isInitialized && user) {
      const params = new URLSearchParams(window.location.search);
      // 메일 인증 결과를 갖고 왔으면 옮기지 않고 결과를 보여 준다.
      const notice = emailVerifyNoticeFor(params.get("email_verify"));
      if (notice) {
        setVerifyNotice(notice);
        return;
      }
      runtimeRouterReplace(router, safeRedirectPath(params.get("redirect")) ?? "/");
    }
  }, [isInitialized, user, router]);

  // Static exports must include the form markup in the initial HTML. Hide the
  // form only once we know the visitor is authenticated and a redirect is due.
  if (isInitialized && user) {
    return verifyNotice ? <SignedInEmailVerifyNotice notice={verifyNotice} /> : null;
  }

  return <>{children}</>;
}
