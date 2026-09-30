import { expect, test } from "@playwright/test";
import { routeCodeShape } from "@/lib/route-code-preload";

/*
 * 이동할 화면의 코드를 미리 싣는지(src/lib/route-code-preload.ts).
 *
 * 처음 가는 화면은 코드를 받는 동안 대체 화면이 뜨고, React 가 그 뒤 300ms 동안 본 내용을 묶어 둔다.
 * 화면이 한가할 때(그리고 마우스가 링크에 머물 때) 그 화면의 JS 조각을 미리 실행해 두면, 누른 뒤에는
 * 조각을 더 받지 않고 바로 그린다. 여기서는 "누른 뒤 새 조각 요청 0건"과 "오류 없음"을 본다.
 *
 * 클라이언트 이동을 켠 테마 설치본(정적 내보내기)에 대고 돈다:
 *   PLAYWRIGHT_BASE_URL=http://localhost LOCAL_SMOKE_CLIENT_NAV=1 LOCAL_SMOKE_BOARD_PATH=/free \
 *     npx playwright test tests/route-code-preload.spec.ts
 */

const expectClientNavigation = process.env.LOCAL_SMOKE_CLIENT_NAV === "1";
const boardPath = process.env.LOCAL_SMOKE_BOARD_PATH || "/free";

// 같은 코드를 쓰는 화면은 한 종류로 묶어 한 번만 싣는다. 틀리면 다른 화면을 "이미 실음"으로 건너뛴다.
test("route code shapes group screens that share code, and keep app screens apart", () => {
  expect(routeCodeShape("/free")).toBe("board-list");
  expect(routeCodeShape("/notice?page=2")).toBe("board-list");
  expect(routeCodeShape("/free/4161")).toBe("post");
  expect(routeCodeShape("/notice/12#c_3")).toBe("post");
  expect(routeCodeShape("/shop/1446772772")).toBe("shop-product");
  expect(routeCodeShape("/shop/products/77777")).toBe("shop-product");
  expect(routeCodeShape("/shop/list-10")).toBe("shop-category");
  expect(routeCodeShape("/shop/categories/10")).toBe("shop-category");
  expect(routeCodeShape("/")).toBe("home");
  // 앱 화면은 게시판 목록으로 묶이면 안 된다.
  expect(routeCodeShape("/faq")).toBe("faq");
  expect(routeCodeShape("/search")).toBe("search");
  expect(routeCodeShape("/boards")).toBe("boards");
  expect(routeCodeShape("/shop")).toBe("shop");
  expect(routeCodeShape("/shop/cart")).toBe("shop/cart");
  expect(routeCodeShape("/mypage/orders/12")).toBe("mypage/orders/:n");
});

test("once the list page is idle, a post opens without downloading new chunks (no hover needed)", async ({ page }) => {
  test.skip(!expectClientNavigation, "Set LOCAL_SMOKE_CLIENT_NAV=1 against a theme install with client navigation.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(boardPath, { waitUntil: "networkidle" });
  // 목록 표의 글 제목 링크. 글쓰기(/free/write)는 문서 이동이라 미리 실을 것이 없다.
  const postLink = page.locator(`main table tbody a[href^="${boardPath}/"]`).filter({ hasText: /\S/ }).first();
  await expect(postLink).toBeVisible();

  // 화면이 한가해지면(requestIdleCallback) 글 화면의 코드를 싣는다 — 휴대폰처럼 마우스가 머물지 않아도.
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByType("resource").some((entry) => /\/[0-9]+\.txt$/.test(new URL(entry.name).pathname))), { timeout: 8000 })
    .toBe(true);
  await page.waitForLoadState("networkidle");

  const chunkRequests: string[] = [];
  const documentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/_next/static/chunks/")) chunkRequests.push(request.url());
    if (request.resourceType() === "document") documentRequests.push(request.url());
  });

  await postLink.click();
  await page.waitForURL((url) => url.pathname !== boardPath);
  await page.waitForLoadState("networkidle");

  expect(documentRequests, "moved with the client router, not a full page load").toEqual([]);
  expect(chunkRequests, "no chunk downloads after the click").toEqual([]);
  await expect(page.locator("main h1").first()).toBeVisible();
  expect(errors).toEqual([]);
});
