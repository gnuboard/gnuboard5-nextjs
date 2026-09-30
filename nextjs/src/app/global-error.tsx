"use client";

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
      <html lang="ko">
        <body>
          <p role="status" style={{ padding: "48px 24px", textAlign: "center", color: "#4b5563" }}>
            화면을 다시 불러오는 중입니다…
          </p>
        </body>
      </html>
    );
  }

  const fallbackMessage = "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  const message =
    process.env.NODE_ENV === "production" ? fallbackMessage : error.message || fallbackMessage;

  return (
    <html lang="ko">
      <body>
        <main
          style={{
            alignItems: "center",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#9ca3af", fontSize: "64px", fontWeight: 800 }}>
            !
          </p>
          <h1 style={{ fontSize: "24px", margin: "16px 0 0" }}>
            페이지를 표시하지 못했습니다
          </h1>
          <p
            style={{
              color: "#4b5563",
              lineHeight: 1.6,
              margin: "12px 0 0",
              maxWidth: "420px",
            }}
          >
            {message}
          </p>
          {error.digest && (
            <p style={{ color: "#9ca3af", fontSize: "12px", marginTop: "8px" }}>
              오류 코드: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "28px" }}>
            <button
              onClick={reset}
              style={{
                background: "#0c8040",
                border: "1px solid #0c8040",
                borderRadius: "4px",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 700,
                padding: "10px 16px",
              }}
              type="button"
            >
              다시 시도
            </button>
            <a
              href="/"
              style={{
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                color: "#111827",
                fontWeight: 700,
                padding: "10px 16px",
                textDecoration: "none",
              }}
            >
              홈으로 이동
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
