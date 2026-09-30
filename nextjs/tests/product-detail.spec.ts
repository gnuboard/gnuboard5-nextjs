import { expect, test } from "@playwright/test";

const productId = process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID || "";
const productPath =
  process.env.LOCAL_SMOKE_PRODUCT_PATH ||
  process.env.SERVER_RUNTIME_SMOKE_PRODUCT_PATH ||
  (productId ? `/shop/${productId}` : "");
const productName = process.env.LOCAL_SMOKE_PRODUCT_NAME || process.env.SERVER_RUNTIME_SMOKE_PRODUCT_TEXT || "";

function detailSmokeRequired(kind: "post" | "product") {
  return [
    process.env.UI_SMOKE_REQUIRE_DETAILS,
    process.env.SERVER_RUNTIME_SMOKE_REQUIRE_DETAILS,
    process.env.LIVE_SMOKE_REQUIRE_DETAILS,
  ]
    .join(",")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .some((item) => item === "all" || item === kind);
}

function isRecoverableReactHydrationError(message: string) {
  return /^Minified React error #419\b/.test(message);
}

test.skip(
  !productPath && !detailSmokeRequired("product"),
  "Set LOCAL_SMOKE_PRODUCT_PATH, SERVER_RUNTIME_SMOKE_PRODUCT_PATH, or LOCAL_SMOKE_SHOP_PRODUCT_ID to run product detail smoke."
);

test(`product detail page loads (${productPath})`, async ({ page }) => {
  expect(productPath, "product detail smoke is required but no product path is configured").toBeTruthy();

  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/^Failed to load resource:/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (!isRecoverableReactHydrationError(error.message)) {
      errors.push(error.message);
    }
  });

  const response = await page.goto(productPath, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

  const status = response?.status() ?? 0;
  expect(status).not.toBe(500);
  expect(status).not.toBe(404);

  const title = page.locator("h1").first();
  await expect(title).toBeVisible({ timeout: 15000 });
  if (productName) {
    await expect(title).toContainText(productName);
  } else {
    expect((await title.textContent())?.trim()).toBeTruthy();
  }
  expect(errors).toEqual([]);

  if (process.env.UI_SMOKE_WRITE_SCREENSHOTS === "1") {
    await page.screenshot({ path: "tests/product-detail.png", fullPage: true });
  }
});
