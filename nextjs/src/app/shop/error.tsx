"use client";

import { AlertTriangle } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { Button } from "@/components/ui/button";
import { useReloadOnceOnError } from "@/lib/reload-once-on-error";

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 대개 새 빌드 전에 열어 둔 탭이다 — 오류를 보이기 전에 한 번만 새로 불러온다.
  const reloading = useReloadOnceOnError();
  if (reloading) {
    return (
      <p role="status" className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center px-4 text-sm text-muted-foreground">
        화면을 다시 불러오는 중입니다…
      </p>
    );
  }

  const fallbackMessage = "상품 또는 주문 정보를 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  const message =
    process.env.NODE_ENV === "production" ? fallbackMessage : error.message || fallbackMessage;

  return (
    <section className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <span className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        쇼핑몰 화면을 불러오지 못했습니다
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {message}
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground/70">
          오류 코드: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} type="button">
          다시 시도
        </Button>
        <Button variant="outline" asChild>
          <Link href="/shop/cart">장바구니로 이동</Link>
        </Button>
      </div>
    </section>
  );
}
