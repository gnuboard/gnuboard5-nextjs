"use client";

import Script from "next/script";

/**
 * GA4 + Enhanced Ecommerce 부트.
 *   NEXT_PUBLIC_GA_ID 가 비어있으면 자동 noop — 빌드 영향 0.
 *
 * 사용:
 *   <GoogleAnalytics id={process.env.NEXT_PUBLIC_GA_ID} />
 *
 * 이커머스 이벤트는 lib/analytics.ts 의 헬퍼 사용 — viewItem / addToCart /
 * beginCheckout / purchase 등.
 */
export function GoogleAnalytics({ id }: { id?: string }) {
  if (!id) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){ dataLayer.push(arguments); }
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${id}', { anonymize_ip: true, send_page_view: true });
        `}
      </Script>
    </>
  );
}
