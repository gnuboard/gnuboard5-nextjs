import { expect, test, type Page } from "@playwright/test";

/*
 * 정적 셸(대표 껍데기 __g5_static__)로 뜨는 상세 화면을 오갈 때의 회귀 검사.
 *
 * 1) 상세에서 고정 주소(/shop)로 클라이언트 이동하면 화면이 실제로 바뀌어야 한다.
 *    client-metadata.ts 가 React 의 <head> 태그를 지우면 removeChild(null) 오류로 멈추고
 *    주소만 /shop 이 된 채 상세가 남았다.
 * 2) 상세가 깨어나는 동안 "찾을 수 없습니다" 가 한 프레임도 그려지면 안 된다.
 *    하이드레이션 첫 렌더에서 id 가 비어 "없음" 으로 판정하던 번쩍임.
 *
 * 3) 테마가 features.clientNavigation 을 켰으면 상품 카드·게시판 목록 줄을 눌러도 문서를 새로 받지
 *    않고(document 요청 0건) Next 라우터로 옮겨 간다. 뒤로 가기도 목록으로 돌아온다.
 *    LOCAL_SMOKE_CLIENT_NAV=1 일 때만 돈다(그 기능을 켠 테마에 대고).
 *
 * 정적 배포본에 대고 돈다:
 *   PLAYWRIGHT_BASE_URL=http://localhost LOCAL_SMOKE_SHOP_PRODUCT_ID=1446772772 \
 *   LOCAL_SMOKE_CLIENT_NAV=1 LOCAL_SMOKE_BOARD_PATH=/free \
 *     npx playwright test tests/static-shell-navigation.spec.ts
 */

const productId = process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || "";
const productPath = process.env.LOCAL_SMOKE_PRODUCT_PATH || (productId ? `/shop/${productId}` : "");
const expectClientNavigation = process.env.LOCAL_SMOKE_CLIENT_NAV === "1";
const boardPath = process.env.LOCAL_SMOKE_BOARD_PATH || "/free";

test.skip(!productPath, "Set LOCAL_SMOKE_SHOP_PRODUCT_ID or LOCAL_SMOKE_PRODUCT_PATH to run static shell navigation checks.");

const NOT_FOUND_TEXT = "찾을 수 없";

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function recordNotFoundFlashes(page: Page) {
  await page.addInitScript((needle) => {
    const seen: string[] = [];
    (window as unknown as { __notFoundSeen: string[] }).__notFoundSeen = seen;
    new MutationObserver(() => {
      if (document.body?.innerText.includes(needle) && !seen.includes(location.pathname)) {
        seen.push(location.pathname);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, NOT_FOUND_TEXT);
}

async function waitForProductDetail(page: Page) {
  await expect(page.locator(".product-title").first()).toBeVisible({ timeout: 15000 });
}

/** 지금부터 main frame 의 문서(document) 요청 수를 센다. 클라이언트 이동이면 0 이어야 한다. */
function countDocumentRequests(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (request.resourceType() === "document" && request.frame() === page.mainFrame()) count += 1;
  });
  return () => count;
}

test("leaving a static-shell product page for /shop replaces the screen", async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto(productPath, { waitUntil: "networkidle" });
  await waitForProductDetail(page);

  await page.locator('header a[href="/shop"]:visible').first().click();

  await expect(page).toHaveURL(/\/shop\/?$/);
  await expect(page.locator(".product-title")).toHaveCount(0, { timeout: 10000 });
  expect(errors.filter((message) => message.includes("removeChild"))).toEqual([]);
});

test("a static-shell product page never paints the not-found state while it wakes up", async ({ page }) => {
  await recordNotFoundFlashes(page);

  await page.goto("/shop", { waitUntil: "networkidle" });
  // 상점 홈의 상품 카드를 눌러 들어간다 — 번쩍임은 주소창 입력이 아니라 이 경로에서 났다.
  const productLink = page.locator(`main a[href="${productPath}"]:visible`).first();
  test.skip(!(await productLink.count()), `No visible link to ${productPath} on /shop.`);
  await productLink.click();
  await waitForProductDetail(page);

  const seen = await page.evaluate(() => (window as unknown as { __notFoundSeen: string[] }).__notFoundSeen);
  expect(seen).toEqual([]);
});

test.describe("client navigation into static-shell detail pages", () => {
  test.skip(!expectClientNavigation, "Set LOCAL_SMOKE_CLIENT_NAV=1 against a theme with features.clientNavigation.");

  test("a product card opens the product without reloading the document", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/shop", { waitUntil: "networkidle" });
    const productLink = page.locator(`main a[href="${productPath}"]:visible`).first();
    test.skip(!(await productLink.count()), `No visible link to ${productPath} on /shop.`);

    const documentRequests = countDocumentRequests(page);
    await productLink.click();
    await waitForProductDetail(page);

    await expect(page).toHaveURL(new RegExp(`${productPath}$`));
    expect(documentRequests()).toBe(0);
    // 브리지가 아니라 client-metadata 가 제목을 바꾼다 — 상품 이름이 들어가야 한다.
    const productName = (await page.locator(".product-title").first().innerText()).trim();
    await expect.poll(() => page.title()).toContain(productName.slice(0, 10));
    expect(errors).toEqual([]);
  });

  test("a board row opens the post without reloading, and back returns to the list", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto(boardPath, { waitUntil: "networkidle" });
    // 글쓰기·분류 링크가 아니라 숫자 글 주소(/free/4161)를 고른다.
    const postHref = await page.evaluate((prefix) => {
      const pattern = new RegExp(`^${prefix}/\\d+$`);
      const link = [...document.querySelectorAll<HTMLAnchorElement>("main a[href]")].find(
        (anchor) => pattern.test(anchor.getAttribute("href") || "") && anchor.offsetParent !== null
      );
      return link?.getAttribute("href") ?? null;
    }, boardPath);
    test.skip(!postHref, `No numeric post link on ${boardPath}.`);
    const postLink = page.locator(`main a[href="${postHref}"]:visible`).first();

    const documentRequests = countDocumentRequests(page);
    await postLink.click();
    await expect(page).toHaveURL(new RegExp(`${boardPath}/\\d+`));
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 15000 });
    expect(documentRequests()).toBe(0);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${boardPath}/?$`));
    await expect(page.locator(`main a[href^="${boardPath}/"]:visible`).first()).toBeVisible({ timeout: 10000 });
    expect(documentRequests()).toBe(0);
    expect(errors).toEqual([]);
  });

  test("hovering a product card fetches the product before the click, and the page reuses it", async ({ page }) => {
    await page.goto("/shop", { waitUntil: "networkidle" });
    const productLink = page.locator(`main a[href="${productPath}"]:visible`).first();
    test.skip(!(await productLink.count()), `No visible link to ${productPath} on /shop.`);

    const productApi = `/api/v1/shop/products/${productPath.split("/").pop()}`;
    let productRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith(productApi)) productRequests += 1;
    });

    await productLink.hover();
    await expect.poll(() => productRequests, { timeout: 5000 }).toBe(1);

    await productLink.click();
    await waitForProductDetail(page);
    expect(productRequests).toBe(1);
  });

  test("hovering a post link never requests the post, which would count a view and charge read points", async ({ page }) => {
    await page.goto(boardPath, { waitUntil: "networkidle" });
    let postRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.includes("/api/v1/posts/")) postRequests += 1;
    });

    const postLinks = page.locator(`main a[href^="${boardPath}/"]:visible`);
    const count = Math.min(await postLinks.count(), 5);
    for (let index = 0; index < count; index += 1) {
      await postLinks.nth(index).hover();
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);

    expect(postRequests).toBe(0);
  });

  test("a post view asks for the board info once", async ({ page }) => {
    const boardApi = `/api/v1/boards${boardPath}`;
    let boardRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith(boardApi)) boardRequests += 1;
    });

    await page.goto(boardPath, { waitUntil: "networkidle" });
    boardRequests = 0;
    const postHref = await page.evaluate((prefix) => {
      const pattern = new RegExp(`^${prefix}/\\d+$`);
      return (
        [...document.querySelectorAll<HTMLAnchorElement>("main a[href]")]
          .map((anchor) => anchor.getAttribute("href") || "")
          .find((href) => pattern.test(href)) ?? null
      );
    }, boardPath);
    test.skip(!postHref, `No numeric post link on ${boardPath}.`);

    await page.goto(postHref as string, { waitUntil: "networkidle" });
    await expect(page.locator("main h1").first()).toBeVisible();

    expect(boardRequests).toBe(1);
  });
});
