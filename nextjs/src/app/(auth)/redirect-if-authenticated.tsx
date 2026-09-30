"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { runtimeRouterReplace } from "@/lib/runtime-router";
import { useAuthStore } from "@/store/auth";

function safeRedirectPath(value: string | null): string | null {
  if (!value || typeof window === "undefined") return null;

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  useEffect(() => {
    if (isInitialized && user) {
      const params = new URLSearchParams(window.location.search);
      runtimeRouterReplace(router, safeRedirectPath(params.get("redirect")) ?? "/");
    }
  }, [isInitialized, user, router]);

  // Static exports must include the form markup in the initial HTML. Hide the
  // form only once we know the visitor is authenticated and a redirect is due.
  if (isInitialized && user) return null;

  return <>{children}</>;
}
