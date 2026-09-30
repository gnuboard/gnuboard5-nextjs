"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { exchangeSocialTicket } from "@/services/socialAuth";

type Status = "processing" | "success" | "error";

function safeRedirectPath(value: string | null): string {
  if (!value) return "/";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/**
 * 소셜 로그인 callback.
 *
 * gnuboard PHP 의 /api/social/finish.php 가 ticket 을 query 로 붙여서 이 페이지로 302.
 * 흐름:
 *   1) ticket 파라미터 확인
 *   2) /api/v1/auth/social/exchange 로 ticket → JWT 교환
 *   3) JWT 저장 + 사용자 정보 fetch
 *   4) 팝업 모드면 opener 에 메시지 보내고 닫음, 아니면 redirect
 */
export default function SocialCallbackPage() {
  const router = useRouter();
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [status, setStatus] = useState<Status>("processing");
  const [message, setMessage] = useState("로그인 처리 중입니다...");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("ticket");
    const oauthError = params.get("error");
    const redirect = params.get("redirect");

    const isInPopup = !!window.opener && !window.opener.closed && window.opener !== window;

    const notifyOpener = (payload: Record<string, unknown>) => {
      if (!isInPopup) return;
      try {
        window.opener.postMessage(
          { type: "social-login-result", ...payload },
          window.location.origin
        );
      } catch {
        /* opener detach 가능 — 무시 */
      }
    };

    const fail = (msg: string) => {
      setStatus("error");
      setMessage(msg);
      notifyOpener({ status: "error", message: msg });
      if (isInPopup) {
        setTimeout(() => window.close(), 2000);
      }
    };

    if (oauthError) {
      fail(oauthError === "not_authenticated"
        ? "소셜 로그인이 취소되었거나 인증되지 않았습니다."
        : `소셜 로그인 실패: ${oauthError}`);
      return;
    }

    if (!ticket) {
      fail("인증 ticket 이 누락되었습니다.");
      return;
    }

    void (async () => {
      try {
        const result = await exchangeSocialTicket(ticket);

        api.setToken(result.token);
        if (result.refresh_token) {
          api.setRefreshToken(result.refresh_token);
        }
        await fetchUser();

        setStatus("success");
        setMessage("로그인 성공! 잠시 후 이동합니다...");
        notifyOpener({
          status: "success",
          redirect,
        });

        if (isInPopup) {
          // 팝업 모드 — opener 가 새 토큰을 받아 reload 한다고 가정하고 즉시 닫음.
          setTimeout(() => window.close(), 500);
        } else {
          // 일반 모드 — 자체 redirect.
          const target = safeRedirectPath(redirect);
          setTimeout(() => runtimeRouterPush(router, target), 500);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "소셜 로그인 처리에 실패했습니다.";
        fail(msg);
      }
    })();
  }, [fetchUser, router]);

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-4 text-center">
      {status === "processing" && (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">{message}</p>
        </>
      )}
      {status === "success" && (
        <p className="text-sm text-emerald-600">{message}</p>
      )}
      {status === "error" && (
        <>
          <p className="text-sm font-medium text-destructive">{message}</p>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              if (window.opener && !window.opener.closed && window.opener !== window) {
                window.close();
              } else {
                runtimeRouterPush(router, "/login");
              }
            }}
          >
            로그인 페이지로 돌아가기
          </button>
        </>
      )}
    </div>
  );
}
