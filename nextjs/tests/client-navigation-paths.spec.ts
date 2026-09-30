import { expect, test } from "@playwright/test";
import { isG5ClientNavigablePath } from "@/lib/config";

// 테마가 features.clientNavigation 을 켰을 때 Next 라우터로 보내도 되는 주소인지 가르는 규칙.
// 앱이 주소창에서 id 를 읽는 화면만 true, 나머지는 예전처럼 문서 이동.

const navigable = [
  "/free",
  "/free/4161",
  "/boards/free",
  "/boards/free/4161",
  "/shop/1446772772",
  "/shop/clarityshop01",
  "/shop/products/1446772772",
  "/shop/list-d0",
  "/shop/type-1",
  "/shop/categories/d0",
  "/content/company",
  "/shop/content/provision",
  "/shop/events/1",
];

const documentOnly = [
  "/",
  "/free/write",
  "/free/my-post-title",
  "/free/4161/",
  "/rss/free",
  "/members/123",
  "/members/admin",
  "/community",
  "/organic/1",
  "/baby/2",
  "/mypage/memos/3",
  "/shop",
  "/shop/cart",
  "/shop/content",
  "/shop/orders/2024",
  "/shop/personalpay/5",
  "/shop/kcp",
  "/shop/toss",
  "/shop/item.php",
  "/bbs/board.php",
  "/login",
  "/faq",
];

for (const path of navigable) {
  test(`client-navigable: ${path}`, () => {
    expect(isG5ClientNavigablePath(path)).toBe(true);
  });
}

for (const path of documentOnly) {
  test(`document navigation: ${path}`, () => {
    expect(isG5ClientNavigablePath(path)).toBe(false);
  });
}
