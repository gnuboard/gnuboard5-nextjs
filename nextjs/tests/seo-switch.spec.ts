import { expect, test, type Page } from "@playwright/test";

/*
 * 검색엔진 노출 스위치(G5_NEXTJS_SEO*)가 설치본에서 실제로 지켜지는지 — 크롤러가 받는 HTML·헤더와
 * JS 가 돈 뒤의 <head> 가 같은 값인지 본다. 설치본의 api/.env 상태를 LOCAL_SMOKE_SEO 로 알려 준다.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost LOCAL_SMOKE_SEO=off npx playwright test tests/seo-switch.spec.ts
 *   PLAYWRIGHT_BASE_URL=http://localhost LOCAL_SMOKE_SEO=on LOCAL_SMOKE_SEO_EXCLUDED_BOARD=qa \
 *     LOCAL_SMOKE_POST_PATH=/free/4161 LOCAL_SMOKE_SHOP_PRODUCT_ID=1446772772 npx playwright test tests/seo-switch.spec.ts
 */

const mode = process.env.LOCAL_SMOKE_SEO || "";
const excludedBoard = process.env.LOCAL_SMOKE_SEO_EXCLUDED_BOARD || "";
const postPath = process.env.LOCAL_SMOKE_POST_PATH || "";
const productId = process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || "";

test.skip(mode !== "on" && mode !== "off", "Set LOCAL_SMOKE_SEO=on|off to match the install's api/.env.");

const INDEX = "index, follow";
const NOINDEX = "noindex, nofollow";

async function robotsAfterHydration(page: Page, path: string): Promise<string[]> {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  return page.evaluate(() =>
    [...new Set([...document.head.querySelectorAll('meta[name="robots"]')].map((meta) => meta.getAttribute("content") || ""))]
  );
}

test("robots.txt follows the switch", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  if (mode === "off") {
    expect(body).toContain("Disallow: /\n");
    expect(body).not.toContain("Sitemap:");
  } else {
    expect(body).toContain("Sitemap:");
    expect(body).toContain("Disallow: /login");
    expect(body).not.toMatch(/^Host:/m);
  }
});

test("public pages carry one robots value in the HTML, the header and after JavaScript", async ({ page, request }) => {
  const paths = ["/", "/shop", ...(postPath ? [postPath] : []), ...(productId ? [`/shop/${productId}`] : [])];
  const expected = mode === "on" ? INDEX : NOINDEX;

  for (const path of paths) {
    const response = await request.get(path);
    const html = await response.text();
    expect(html, path).toContain(`<meta name="robots" content="${expected}"`);
    expect(response.headers()["x-robots-tag"] ?? "", path).toBe(mode === "on" ? "" : NOINDEX);
    expect(await robotsAfterHydration(page, path), path).toEqual([expected]);
  }
});

test("private and thin pages are never indexed", async ({ page }) => {
  for (const path of ["/login", "/search"]) {
    expect(await robotsAfterHydration(page, path), path).toEqual([NOINDEX]);
  }
});

test("an excluded board and its posts stay out of the index", async ({ page, request }) => {
  test.skip(mode !== "on" || !excludedBoard, "Set LOCAL_SMOKE_SEO_EXCLUDED_BOARD with LOCAL_SMOKE_SEO=on.");

  expect(await robotsAfterHydration(page, `/${excludedBoard}`)).toEqual([NOINDEX]);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain(`/${excludedBoard}</loc>`);
  const posts = await (await request.get("/sitemap-posts.xml")).text();
  expect(posts).not.toContain(`/${excludedBoard}/`);
});
