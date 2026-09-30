"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Core Web Vitals 보고.
 *
 * - LCP / INP / CLS / FCP / TTFB 를 console + (옵션) Sentry / 자체 분석으로 송출.
 * - production 만 활성. dev 는 noise.
 * - rating(good/needs-improvement/poor) 도 같이 보내 임계치 분포 추적 쉽게.
 *
 * 백엔드 인제스션이 따로 없어도 Sentry browser-tracing 이 일부 자동 수집함.
 * 운영 중에 별도 분석 inbox 가 필요해지면 NEXT_PUBLIC_VITALS_URL 에 endpoint 추가.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") return;

    // Sentry 가 있으면 우선 그쪽으로 — 자체 dashboard 불필요.
    type Win = Window & { Sentry?: { addBreadcrumb?: (b: unknown) => void } };
    const w = window as Win;
    if (w.Sentry?.addBreadcrumb) {
      w.Sentry.addBreadcrumb({
        category: "web-vitals",
        message: metric.name,
        level: metric.rating === "poor" ? "warning" : "info",
        data: { value: metric.value, rating: metric.rating, id: metric.id },
      });
    }

    // 추가 inbox — beacon 으로 비동기 전송 (페이지 이동 중에도 도달).
    const endpoint = process.env.NEXT_PUBLIC_VITALS_URL;
    if (endpoint && typeof navigator.sendBeacon === "function") {
      const body = JSON.stringify({
        name: metric.name,
        value: Math.round(metric.value),
        rating: metric.rating,
        delta: metric.delta,
        id: metric.id,
        path: window.location.pathname,
        ua: navigator.userAgent,
      });
      try { navigator.sendBeacon(endpoint, body); } catch { /* silent */ }
    }
  });

  return null;
}
