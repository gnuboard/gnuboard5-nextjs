import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * 첫 화면이 나쁜 조건에서도 버티는지 — 2026-10-01 성능 작업과 Codex 검증에서 잡힌 회귀를 다시 막는다.
 * 실제 사이트에 대고 돈다(읽기만 한다). 예: PLAYWRIGHT_BASE_URL=http://localhost npm run test:resilience
 * 주소는 설치 폴더 기준 상대 경로라 하위 폴더 설치도 된다 — 끝에 / 를 붙인다: PLAYWRIGHT_BASE_URL=http://localhost/gnuboard/
 * 기본 테마(nextjs_default)의 화면 요소가 없는 테마에서는 그 항목만 건너뛴다.
 */

const ERROR_SCREEN = /페이지를 표시하지 못했습니다|오류가 발생했습니다/;
const SWIPER_CHUNK = "slideToLoop"; // Swiper 본체에만 있는 메서드 이름(축약돼도 남는다) — 이 조각을 늦추거나 막는다.

async function blockStorage(context: BrowserContext, which: Array<"localStorage" | "sessionStorage">) {
  await context.addInitScript((names: string[]) => {
    for (const name of names) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      });
    }
  }, which);
}

/** Swiper 조각을 막거나 늦춘다. 돌려준 hits 가 0 이면 이 페이지는 Swiper 를 받지 않은 것 — 시험이 헛돈다. */
async function routeSwiperChunk(page: Page, mode: "block" | number) {
  const state = { hits: 0 };
  await page.route("**/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    if (body.toString().includes(SWIPER_CHUNK)) {
      state.hits += 1;
      if (mode === "block") return route.abort();
      await new Promise((resolve) => setTimeout(resolve, mode));
    }
    await route.fulfill({ response, body });
  });
  return state;
}

/** 사용자 입력 없이 일어난 화면 밀림(CLS)을 문서가 생길 때부터 모은다. readLayoutShift 로 읽는다. */
async function observeLayoutShift(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function readLayoutShift(page: Page) {
  return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
}

async function isDefaultShopHome(page: Page) {
  return (await page.locator(".solune-shop-product-feed").count()) > 0;
}

test.describe("first screen resilience", () => {
  test("pages render when localStorage and sessionStorage are blocked", async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await blockStorage(context, ["localStorage", "sessionStorage"]);
    for (const path of ["./", "shop", "free"]) {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(path, { waitUntil: "networkidle" });
      const text = await page.locator("body").innerText();
      expect(text, `${path} shows an error screen`).not.toMatch(ERROR_SCREEN);
      expect(text.length, `${path} has content`).toBeGreaterThan(200);
      expect(errors, `${path} page errors`).toEqual([]);
      await page.close();
    }
    await context.close();
  });

  test("a stored dark theme is applied before the first paint", async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("solune-theme", "dark");
      } catch {
        /* 무시 */
      }
    });
    const page = await context.newPage();
    // 첫 페인트 전의 값 — 문서가 파싱되자마자(React 가 붙기 전) 읽는다.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { __firstTheme: string | null }).__firstTheme =
          document.documentElement.getAttribute("data-solune-theme");
      });
    });
    await page.goto("./", { waitUntil: "domcontentloaded" });
    const theme = await page.evaluate(() => (window as unknown as { __firstTheme: string | null }).__firstTheme);
    test.skip(theme === null, "기본 테마가 아니다(data-solune-theme 없음)");
    expect(theme).toBe("dark");
    await context.close();
  });

  test("the system dark preference is applied when nothing is stored", async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: "block", colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("./", { waitUntil: "domcontentloaded" });
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-solune-theme"));
    test.skip(theme === null, "기본 테마가 아니다(data-solune-theme 없음)");
    expect(theme).toBe("dark");
    await context.close();
  });

  test("the shop home still shows products when the Swiper chunk fails", async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const swiper = await routeSwiperChunk(page, "block");
    await page.goto("shop", { waitUntil: "networkidle" });
    test.skip(!(await isDefaultShopHome(page)), "기본 테마의 쇼핑 홈이 아니다");
    test.skip(swiper.hits === 0, "이 쇼핑 홈은 Swiper 를 받지 않는다(넘길 상품 · 후기가 없다)");
    expect(await page.locator("body").innerText()).not.toMatch(ERROR_SCREEN);
    await expect(page.locator(".solune-shop-product-feed a[href]").first()).toBeVisible();
    await context.close();
  });

  test("products appear before a slow Swiper chunk arrives", async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const swiper = await routeSwiperChunk(page, 8000);
    await page.goto("shop", { waitUntil: "domcontentloaded" });
    await page.locator(".solune-shop-product-feed").first().waitFor({ timeout: 5000 }).catch(() => undefined);
    test.skip(!(await isDefaultShopHome(page)), "기본 테마의 쇼핑 홈이 아니다");
    // Swiper 조각은 화면이 뜬 뒤에 받는다 — 그 요청이 들어와 늦어지고 있는 동안을 본다.
    await expect.poll(() => swiper.hits, { timeout: 5000 }).toBeGreaterThan(0).catch(() => undefined);
    test.skip(swiper.hits === 0, "이 쇼핑 홈은 Swiper 를 받지 않는다(넘길 상품 · 후기가 없다)");
    await expect(page.locator(".solune-shop-product-feed a[href]").first()).toBeVisible({ timeout: 3000 });
    expect(await page.locator(".swiper-initialized").count(), "Swiper should still be on its way").toBe(0);
    await context.close();
  });

  test("the shop home layout shift on a first visit stays under 0.1", async ({ browser }) => {
    // 브라우저 기억이 없는 첫 방문 — 그누보드 브리지가 <html> 에 적어 준 배치로 자리를 잡는다(shop-home-layout.php).
    // 배너가 없는 사이트에서 잡아 둔 자리가 접히던 것(CLS 0.34)을 막는다.
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ serviceWorkers: "block", viewport });
      await observeLayoutShift(context);
      const page = await context.newPage();
      await page.goto("shop", { waitUntil: "networkidle" });
      test.skip(!(await isDefaultShopHome(page)), "기본 테마의 쇼핑 홈이 아니다");
      await page.waitForTimeout(1500);
      expect(await readLayoutShift(page), `first visit at ${viewport.width}px`).toBeLessThan(0.1);
      await context.close();
    }
  });

  test("the server's shop layout wins over the stored memory", async ({ browser, request }) => {
    const html = await (await request.get("shop")).text();
    const server = /<html\b[^>]*\bdata-shop-banner="([01])"[^>]*\bdata-shop-cats="([01])"/i.exec(html);
    test.skip(!server, "그누보드 브리지가 배치를 적지 않는 곳이다(Vercel · Node 또는 예전 핵심 꾸러미)");

    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.addInitScript((stored: string) => {
      try {
        window.localStorage.setItem("solune-shop-layout", stored);
      } catch {
        /* 무시 */
      }
      document.addEventListener("DOMContentLoaded", () => {
        const d = document.documentElement;
        (window as unknown as { __layout: string }).__layout =
          `${d.getAttribute("data-shop-banner")}${d.getAttribute("data-shop-cats")}`;
      });
    }, JSON.stringify({ b: server![1] === "1" ? 0 : 1, c: server![2] === "1" ? 0 : 1 })); // 서버와 반대로 기억해 둔다
    const page = await context.newPage();
    await page.goto("shop", { waitUntil: "domcontentloaded" });
    const firstPaint = await page.evaluate(() => (window as unknown as { __layout: string }).__layout);
    expect(firstPaint).toBe(`${server![1]}${server![2]}`);
    await context.close();
  });

  test("the shop home layout shift on a repeat visit stays under 0.1", async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 1000 } });
    await observeLayoutShift(context);
    const first = await context.newPage();
    await first.goto("shop", { waitUntil: "networkidle" });
    test.skip(!(await isDefaultShopHome(first)), "기본 테마의 쇼핑 홈이 아니다");
    await first.waitForTimeout(1500);
    await first.close();

    const repeat = await context.newPage(); // 같은 저장소 — 지난 방문의 배치 기억(shop-layout-hint)을 쓴다
    await repeat.goto("shop", { waitUntil: "networkidle" });
    await repeat.waitForTimeout(1500);
    expect(await readLayoutShift(repeat)).toBeLessThan(0.1);
    await context.close();
  });
});
