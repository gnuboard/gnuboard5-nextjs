import { expect, test } from "@playwright/test";

const postPath =
  process.env.LOCAL_SMOKE_POST_PATH || process.env.SERVER_RUNTIME_SMOKE_POST_PATH || "";
const expectedTitle =
  process.env.LOCAL_SMOKE_POST_H1 ||
  process.env.LOCAL_SMOKE_POST_TITLE ||
  process.env.SERVER_RUNTIME_SMOKE_POST_TEXT ||
  "";

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

test.skip(
  !postPath && !detailSmokeRequired("post"),
  "Set LOCAL_SMOKE_POST_PATH or SERVER_RUNTIME_SMOKE_POST_PATH to run post detail smoke."
);

test(`post detail page loads (${postPath})`, async ({ page }) => {
  expect(postPath, "post detail smoke is required but no post path is configured").toBeTruthy();

  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/^Failed to load resource:/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto(postPath, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

  const status = response?.status() ?? 0;
  expect(status).not.toBe(500);
  expect(status).not.toBe(404);

  const title = page.locator("h1").first();
  await expect(title).toBeVisible({ timeout: 15000 });
  if (expectedTitle) {
    await expect(title).toContainText(expectedTitle);
  } else {
    expect((await title.textContent())?.trim()).toBeTruthy();
  }
  await expect(page.locator(".prose, article").first()).toBeVisible({ timeout: 10000 });
  expect(errors).toEqual([]);

  if (process.env.UI_SMOKE_WRITE_SCREENSHOTS === "1") {
    await page.screenshot({ path: "tests/post-detail.png", fullPage: true });
  }
});
