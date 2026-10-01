"use client";

/*
 * 쇼핑 홈의 Swiper 조각을 한 번에 받는 문. shop-home-client.tsx 가 이 파일 하나만 동적으로 불러온다.
 * 조각마다 따로 불러오면 번들러가 Swiper 본체(약 100KB)를 조각마다 한 벌씩 넣는다.
 */
export { SoluneShopBanner } from "./shop-banner";
export { SoluneShopRow } from "./shop-row";
export { SoluneCategorySwiper, SoluneReviewSection } from "./shop-home-swipers";
