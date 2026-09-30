import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { a11ySmokePaths } from "./smoke-paths";

const pages = parseCsv(
  process.env.A11Y_SMOKE_PATHS || a11ySmokePaths.join(",")
);
const blockingImpacts = new Set(parseCsv(process.env.A11Y_BLOCKING_IMPACTS || "critical,serious"));
const allowedRules = new Set(parseCsv(process.env.A11Y_ALLOWED_RULES || ""));

function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

for (const path of pages) {
  test(`a11y smoke ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
    await expect(page.locator("#main-content, main").first()).toBeVisible({ timeout: 10000 });

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = result.violations.filter((violation) => {
      if (allowedRules.has(violation.id)) return false;
      return blockingImpacts.has(violation.impact || "");
    });

    const summary = blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    }));

    expect(summary).toEqual([]);
  });
}
