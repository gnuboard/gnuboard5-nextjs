import { storageSet } from "@/lib/safe-storage";

/*
 * 쇼핑 홈 배치 기억 — 지난번에 배너 · 분류 줄이 있었는지.
 *
 * 쇼핑 홈은 배너 · 분류 응답이 오기 전 그 자리를 스켈레톤으로 잡아 둔다(늦게 끼어들면 아래 진열이 밀린다).
 * 그런데 배너가 없는 사이트에서는 잡아 둔 자리가 응답 뒤 접히며 진열이 올라간다(측정 CLS 0.34).
 * 정적 HTML 은 JS 보다 먼저 그려지므로 React 에서 고르면 늦다 — 첫 페인트 전에 도는 이 스크립트가
 * <html data-shop-banner="0"> 를 달면 CSS 가 자리 잡기를 처음부터 감춘다(theme.shop.home.css).
 * 기억이 없는 첫 방문만 한 번 접힐 수 있다.
 */

const SHOP_LAYOUT_HINT_KEY = "solune-shop-layout";

export const soluneShopLayoutHintScript = `(function(){try{var v=window.localStorage.getItem('${SHOP_LAYOUT_HINT_KEY}');if(!v)return;var h=JSON.parse(v),d=document.documentElement;d.setAttribute('data-shop-banner',h&&h.b?'1':'0');d.setAttribute('data-shop-cats',h&&h.c?'1':'0');}catch(e){}})();`;

/** 이번에 본 배치를 다음 방문의 첫 페인트를 위해 남긴다. 저장이 막힌 브라우저에서는 조용히 건너뛴다. */
export function rememberShopLayout(hasBanner: boolean, hasCategories: boolean): void {
  try {
    storageSet(SHOP_LAYOUT_HINT_KEY, JSON.stringify({ b: hasBanner ? 1 : 0, c: hasCategories ? 1 : 0 }));
    document.documentElement.setAttribute("data-shop-banner", hasBanner ? "1" : "0");
    document.documentElement.setAttribute("data-shop-cats", hasCategories ? "1" : "0");
  } catch {
    /* 저장이 막혀도 이번 화면은 그대로 동작한다. */
  }
}
