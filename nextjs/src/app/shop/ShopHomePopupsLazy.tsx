"use client";

import dynamic from "next/dynamic";

/*
 * 쇼핑 홈 팝업을 띄울 때만 받는다. 팝업 본문은 HTML 정화기(sanitize-html, 약 180KB)를 거치는데,
 * 페이지가 ShopHomeMarketing 을 바로 가져오면 팝업이 없는 날에도 첫 번들로 정화기를 받는다.
 * 팝업은 첫 화면이 그려진 뒤 떠도 되므로 서버에서 그리지 않는다(ssr: false — 제 Suspense 경계를 갖는다).
 */
export const ShopHomePopupsLazy = dynamic(
  () => import("./ShopHomeMarketing").then((m) => m.ShopHomePopups),
  { ssr: false }
);
