import { expect, test } from "@playwright/test";

type SmokePath = {
  label: string;
  path: string;
  expectedText?: string;
};

const apiStatusPath = process.env.SERVER_RUNTIME_SMOKE_API_PATH || "/api/v1/status";
const smokePaths = buildSmokePaths();
const criticalResourceTypes = new Set(["document", "fetch", "script", "stylesheet", "xhr"]);

function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSmokePaths(): SmokePath[] {
  const paths = parseCsv(process.env.SERVER_RUNTIME_SMOKE_PATHS || "/,/boards,/shop");
  const postPath = process.env.SERVER_RUNTIME_SMOKE_POST_PATH || "";
  const productPath = process.env.SERVER_RUNTIME_SMOKE_PRODUCT_PATH || "";
  const postText = process.env.SERVER_RUNTIME_SMOKE_POST_TEXT || "";
  const productText = process.env.SERVER_RUNTIME_SMOKE_PRODUCT_TEXT || "";

  return paths.map((path) => {
    if (path === postPath && postText) {
      return { label: "post detail", path, expectedText: postText };
    }
    if (path === productPath && productText) {
      return { label: "product detail", path, expectedText: productText };
    }
    return { label: path === "/" ? "home" : path.replace(/^\/+/, ""), path };
  });
}

function isSameOrigin(url: string, origin: string) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function isIgnorableRequestFailure(url: string, resourceType: string, reason: string) {
  if (!/ERR_ABORTED/i.test(reason)) return false;

  try {
    const parsed = new URL(url);
    if (resourceType === "fetch") {
      return parsed.searchParams.has("_rsc") || parsed.pathname.startsWith("/api/v1");
    }
    if (resourceType === "script") {
      return parsed.pathname.startsWith("/_next/static/chunks/");
    }
    return false;
  } catch {
    return false;
  }
}

test("server runtime API proxy returns status JSON", async ({ request }) => {
  const response = await request.get(apiStatusPath);
  expect(response.ok(), `${apiStatusPath} status ${response.status()}`).toBeTruthy();

  const body = await response.json();
  expect(body.success).toBe(true);
});

for (const smokePath of smokePaths) {
  test(`server runtime page ${smokePath.label} (${smokePath.path})`, async ({ page }) => {
    const failures: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error" && !/^Failed to load resource:/i.test(message.text())) {
        failures.push(`[console.error] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      failures.push(`[pageerror] ${error.message}`);
    });
    page.on("requestfailed", (request) => {
      if (!criticalResourceTypes.has(request.resourceType())) return;

      const reason = request.failure()?.errorText || "unknown error";
      if (isIgnorableRequestFailure(request.url(), request.resourceType(), reason)) return;
      failures.push(`[requestfailed] ${request.resourceType()} ${request.url()} - ${reason}`);
    });
    page.on("response", (response) => {
      const pageUrl = page.url();
      if (pageUrl === "about:blank" || !isSameOrigin(response.url(), new URL(pageUrl).origin)) return;
      if (response.status() >= 500) {
        const url = new URL(response.url());
        failures.push(`[${response.status()}] ${url.pathname}${url.search}`);
      }
    });

    const response = await page.goto(smokePath.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#main-content, main").first()).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

    expect(response?.status() ?? 0, `${smokePath.path} response status`).toBeLessThan(500);
    if (smokePath.expectedText) {
      await expect(page.getByText(smokePath.expectedText).first()).toBeVisible({ timeout: 15000 });
    }
    expect(failures).toEqual([]);
  });
}
