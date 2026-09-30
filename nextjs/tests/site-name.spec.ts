import { expect, test, type Page } from "@playwright/test";

/*
 * 사이트 이름은 설치본의 사이트 제목(그누보드 cf_title)이어야 한다 — 테마에 적힌 기본값이 아니라.
 * 제목·공유 카드·구조화 데이터·PWA 이름, 그리고 JS 가 돈 뒤의 제목까지. 메타 태그는 한 벌만.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost LOCAL_SMOKE_SITE_NAME="그누보드5(영카트5)" LOCAL_SMOKE_POST_PATH=/free/4161 \
 *     npx playwright test tests/site-name.spec.ts
 */

const siteName = process.env.LOCAL_SMOKE_SITE_NAME || "";
const postPath = process.env.LOCAL_SMOKE_POST_PATH || "";

test.skip(!siteName, "Set LOCAL_SMOKE_SITE_NAME to the install's site title (cf_title).");

function htmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function headAfterHydration(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const values = (selector: string) =>
      [...document.head.querySelectorAll(selector)].map((node) => node.getAttribute("content") || "");
    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((script) => {
      try {
        const data = JSON.parse(script.textContent || "null");
        return Array.isArray(data) ? data : [data];
      } catch {
        return [];
      }
    });
    return {
      title: document.title,
      titleTags: document.head.querySelectorAll("title").length,
      applicationName: values('meta[name="application-name"]'),
      ogTitle: values('meta[property="og:title"]'),
      organization: jsonLd.find((item) => item?.["@type"] === "Organization")?.name,
      website: jsonLd.find((item) => item?.["@type"] === "WebSite")?.name,
    };
  });
}

test("the home page names the site with the install's title, in the HTML and after JavaScript", async ({ page, request }) => {
  const html = await (await request.get("/")).text();
  const head = html.split(/<\/head>/i)[0];
  expect(head).toContain(`<meta name="application-name" content="${htmlEscape(siteName)}"`);
  expect(head).toContain(` — ${htmlEscape(siteName)}</title>`);

  const after = await headAfterHydration(page, "/");
  expect(after.title.endsWith(` — ${siteName}`), after.title).toBe(true);
  expect(after.titleTags).toBe(1);
  expect(after.applicationName).toEqual([siteName]);
  expect(new Set(after.ogTitle).size, JSON.stringify(after.ogTitle)).toBe(1);
  expect(after.organization).toBe(siteName);
  expect(after.website).toBe(siteName);
});

test("a post title ends with the install's site name after JavaScript", async ({ page }) => {
  test.skip(!postPath, "Set LOCAL_SMOKE_POST_PATH.");
  const after = await headAfterHydration(page, postPath);
  expect(after.title.endsWith(` — ${siteName}`), after.title).toBe(true);
  expect(after.applicationName).toEqual([siteName]);
});

test("the PWA manifest uses the install's site name", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe(siteName);
});
