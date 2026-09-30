"use client";

import { G5Link as Link } from "@/components/ui/g5-link";
import { Button } from "@/components/ui/button";
import { useReloadOnceOnError } from "@/lib/reload-once-on-error";

export default function GlobalError({
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
      <p role="status" className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 text-muted-foreground">
        화면을 다시 불러오는 중입니다…
      </p>
    );
  }

  const fallbackMessage = "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  const message =
    process.env.NODE_ENV === "production" ? fallbackMessage : error.message || fallbackMessage;

  return (
    <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-7xl font-bold text-destructive">!</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        오류가 발생했습니다
      </h1>
      <p className="mt-2 max-w-md text-muted-foreground">{message}</p>
      {error.digest && (
        <p className="mt-1 text-xs text-muted-foreground">
          오류 코드: {error.digest}
        </p>
      )}
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>다시 시도</Button>
        <Button variant="outline" asChild>
          <Link href="/">홈으로 돌아가기</Link>
        </Button>
      </div>
    </div>
  );
}
