"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { ServerUser } from "@/lib/auth-server";

interface Props {
  children: React.ReactNode;
  /**
   * SSR 단계에서 cookies() 로 결정된 user. 첫 client 렌더 직후 store 시드에 사용.
   *
   * 주의: 시드는 useEffect 안에서만 일어남 (렌더 도중 setState 안 함).
   *   - 서버 측 Zustand global store 는 항상 user=null (요청 간 격리 위해 의도적).
   *   - 클라 첫 hydration: server 와 같은 user=null 상태에서 시작 → React 트리 모양
   *     서버/클라 동일 → useId() 카운터 일치 → Radix 등 hydration warning 0.
   *   - hydration 끝난 다음 useEffect 가 setState → 인증 상태로 즉시 전환.
   *
   * Trade-off: 헤더 "로그인" → "내 닉네임" 짧은 플래시 발생 (≤ 100ms).
   *   서버에서 직접 props drilling 하면 플래시도 없지만, 다수 client 컴포넌트
   *   리팩터 필요. 현재는 플래시 < hydration warning 우선순위로 선택.
   */
  initialUser?: ServerUser | null;
}

export function AuthProvider({ children, initialUser = null }: Props) {
  const hydrationAttempted = useRef(false);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const initialize = useAuthStore((s) => s.initialize);
  const expireSession = useAuthStore((s) => s.expireSession);

  useEffect(() => {
    if (hydrationAttempted.current) return;
    hydrationAttempted.current = true;

    if (initialUser) {
      // SSR 에서 cookies 로 확인된 user — /auth/me 재호출 불필요.
      useAuthStore.setState({
        user: initialUser,
        isInitialized: true,
        isLoading: false,
      });
      return;
    }
    // initialUser 없으면 client 토큰 검사 흐름.
    if (!isInitialized) {
      if (api.hasAuthHint()) {
        initialize();
      } else {
        useAuthStore.setState({
          user: null,
          isInitialized: true,
          isLoading: false,
        });
      }
    }
  }, [initialUser, isInitialized, initialize]);

  useEffect(() => {
    function handleAuthExpired() {
      expireSession();
    }
    window.addEventListener("auth:expired", handleAuthExpired);
    return () => window.removeEventListener("auth:expired", handleAuthExpired);
  }, [expireSession]);

  return <>{children}</>;
}
