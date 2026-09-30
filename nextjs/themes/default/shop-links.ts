import type { ShopCategory } from "@/lib/shop-types";

/* 쇼핑몰 링크 규칙. 서버 컴포넌트(shop-home)와 클라이언트 셸(shop-shell)이
   함께 쓰므로 "use client" 가 없는 이 모듈에 둔다 — 클라이언트 모듈의 함수는
   서버에서 부를 수 없다. 경로 모양은 앱의 shopTypeCanonicalPath / CategoryNav
   와 같다. */

export function shopTypeHref(type: number): string {
  return `/shop/type-${type}`;
}

export function shopCategoryHref(category: Pick<ShopCategory, "ca_id">): string {
  return `/shop/list-${encodeURIComponent(category.ca_id)}`;
}
