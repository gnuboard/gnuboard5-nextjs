import { expect, test } from "@playwright/test";

/*
 * 없는 글·상품 주소는 404, 있는 것은 200. 비회원이 못 보는 글(회원 전용 게시판·비밀글)은 실제로
 * 있으므로 404 가 아니다 — 로그인한 회원은 같은 주소로 봐야 한다.
 *
 * 테마 설치본(PHP 브리지, theme/nextjs_default/bridge/seo.php)과 Vercel(서버 실행) 모두에 대고 돌린다.
 * 서버 실행에서는 상세 페이지가 notFound() 로 404 를 낸다 — 그러려면 상세 페이지 위에 loading.tsx 가
 * 없어야 한다(있으면 응답이 먼저 200 으로 흘러 나간다). 그래서 홈·목록의 loading.tsx 는 (home)·(list)
 * 같은 라우트 그룹 안에 두어 그 페이지에만 걸리게 했다.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost LOCAL_SMOKE_POST_PATH=/free/4161 LOCAL_SMOKE_SHOP_PRODUCT_ID=1446772772 \
 *   LOCAL_SMOKE_PRIVATE_POST_PATHS=/spam/4269,/board/124 npx playwright test tests/missing-record-status.spec.ts
 */

const postPath = process.env.LOCAL_SMOKE_POST_PATH || "";
const productId = process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || "";
const privatePostPaths = (process.env.LOCAL_SMOKE_PRIVATE_POST_PATHS || "")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);

test.skip(!postPath || !productId, "Set LOCAL_SMOKE_POST_PATH and LOCAL_SMOKE_SHOP_PRODUCT_ID.");

const board = postPath.split("/").filter(Boolean)[0] ?? "";

test("a post or product that exists answers 200", async ({ request }) => {
  expect((await request.get(postPath)).status(), postPath).toBe(200);
  expect((await request.get(`/shop/${productId}`)).status()).toBe(200);
});

test("a post number or product id that does not exist answers 404", async ({ request }) => {
  for (const path of [`/${board}/999999999`, "/shop/g5-no-such-product-xyz"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("a post the visitor may not read still answers 200 — it exists", async ({ request }) => {
  test.skip(privatePostPaths.length === 0, "Set LOCAL_SMOKE_PRIVATE_POST_PATHS (member-only board post, secret post).");
  for (const path of privatePostPaths) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test("the 404 page is the app's not-found screen, not a bare server error", async ({ page }) => {
  const response = await page.goto(`/${board}/999999999`, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(404);
  await expect(page.locator("main")).toContainText("찾을 수 없");
});
