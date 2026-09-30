import { expect, test, type Page } from "@playwright/test";

/*
 * 구조화 데이터(JSON-LD)가 페이지마다 한 벌만 있는지. 테마 설치본에서는 브리지가 원본 HTML 에 넣고(JS 를
 * 안 돌리는 검색엔진용), 브라우저 JS 가 데이터를 받은 뒤 같은 태그(data-g5-json-ld)를 찾아 내용만 바꾼다.
 * 표시가 없으면 JS 가 한 벌을 더 넣어 Article·Product 가 둘이 된다.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost LOCAL_SMOKE_POST_PATH=/free/4161 LOCAL_SMOKE_SHOP_PRODUCT_ID=1446772772 \
 *     npx playwright test tests/structured-data.spec.ts
 */

const postPath = process.env.LOCAL_SMOKE_POST_PATH || "";
const productId = process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || "";

test.skip(!postPath || !productId, "Set LOCAL_SMOKE_POST_PATH and LOCAL_SMOKE_SHOP_PRODUCT_ID.");

async function jsonLdTypesAfterHydration(page: Page, path: string): Promise<string[]> {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  return page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((script) => {
      try {
        const data = JSON.parse(script.textContent || "null");
        return (Array.isArray(data) ? data : [data]).map((item) => String(item?.["@type"] ?? ""));
      } catch {
        return [];
      }
    })
  );
}

function count(types: string[], type: string): number {
  return types.filter((item) => item === type).length;
}

test("a post has one Article, one Organization and one WebSite after JavaScript", async ({ page }) => {
  const types = await jsonLdTypesAfterHydration(page, postPath);
  expect(count(types, "Article"), JSON.stringify(types)).toBe(1);
  expect(count(types, "Organization"), JSON.stringify(types)).toBe(1);
  expect(count(types, "WebSite"), JSON.stringify(types)).toBe(1);
  expect(count(types, "BreadcrumbList"), JSON.stringify(types)).toBeLessThanOrEqual(1);
});

test("a product has one Product after JavaScript", async ({ page }) => {
  const types = await jsonLdTypesAfterHydration(page, `/shop/${productId}`);
  expect(count(types, "Product"), JSON.stringify(types)).toBe(1);
  expect(count(types, "Article"), JSON.stringify(types)).toBe(0);
  expect(count(types, "BreadcrumbList"), JSON.stringify(types)).toBeLessThanOrEqual(1);
});

test("crawlers that do not run JavaScript still get the record's structured data", async ({ request }) => {
  expect(await (await request.get(postPath)).text()).toContain('"@type":"Article"');
  expect(await (await request.get(`/shop/${productId}`)).text()).toContain('"@type":"Product"');
});
