import { expect, test } from "@playwright/test";

/*
 * 상품 상세의 사용후기 탭 — 레퍼런스 solune itemuse.skin.php 처럼 한 쪽 5건, 포토 후기 줄은 최근 후기 30건에서 모아
 * 8칸 + [더 보기 8 / N](16칸씩 펼침 · 다 펼치면 접기), 쪽을 넘겨도 사진 줄은 그대로, 아래 줄에 "이 상품의 후기 전체 보기".
 * 실제 사이트에 대고 브라우저로 읽기만 한다.
 *
 *   REVIEW_SMOKE_ITEM_ID   승인된 후기가 6건 이상이고, 최근 30건 중 사진 후기가 9건 이상인 상품
 *   예: PLAYWRIGHT_BASE_URL=http://localhost REVIEW_SMOKE_ITEM_ID=1446772772 npx playwright test tests/product-reviews-tab.spec.ts
 */

const itemId = process.env.REVIEW_SMOKE_ITEM_ID || "";

test.describe("상품 사용후기 탭", () => {
  test.skip(!itemId, "REVIEW_SMOKE_ITEM_ID 가 없다");

  test("한 쪽 5건, 사진 줄 더 보기 · 접기, 쪽을 넘겨도 사진 줄은 그대로", async ({ page }) => {
    await page.goto(`/shop/products/${encodeURIComponent(itemId)}?tab=reviews`);
    const items = page.locator(".product-review-item");
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeLessThanOrEqual(5);

    const cells = page.locator(".product-review-photo-grid li");
    const more = page.locator(".product-review-photo-more");
    await expect(more).toContainText(/더 보기\s*8 \/ \d+/);
    await expect(cells).toHaveCount(8);
    const firstStrip = await page.locator(".product-review-photo img").first().getAttribute("src");

    // 다 펼칠 때까지 누른다 — 16칸씩 늘고, 끝나면 접기가 된다.
    for (let guard = 0; guard < 5 && (await more.getAttribute("aria-expanded")) !== "true"; guard++) {
      const before = await cells.count();
      await more.click();
      await expect.poll(() => cells.count()).toBeGreaterThan(before);
    }
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(more).toContainText("접기");
    await more.click();
    await expect(cells).toHaveCount(8);

    const firstSubject = await page.locator(".product-review-subject").first().innerText();
    await page.locator(".product-review-pager").getByRole("button", { name: "2", exact: true }).click();
    await expect(page.locator(".product-review-subject").first()).not.toHaveText(firstSubject);
    expect(await items.count()).toBeLessThanOrEqual(5);
    await expect(page.locator(".product-review-photo img").first()).toHaveAttribute("src", firstStrip ?? "");

    const all = page.locator(".product-review-all");
    await expect(all).toHaveText("이 상품의 후기 전체 보기");
    await expect(all).toHaveAttribute("href", new RegExp(`/shop/reviews\\?it_id=${itemId}$`));

    // 전체 보기는 이 상품 후기만(상품코드 정확히 일치) — 머리 줄에 상품 이름, 건수는 탭의 "최신순 · N개"와 같다.
    const tabTotal = Number((await page.locator(".product-review-sort").innerText()).replace(/\D/g, ""));
    await all.click();
    await expect(page).toHaveURL(new RegExp(`/shop/reviews\\?it_id=${itemId}$`));
    await expect(page.locator(".shop-reviews-item")).toBeVisible();
    await expect(page.locator(".shop-reviews-count")).toContainText(`후기 ${tabTotal.toLocaleString()}건`);
  });

  test("포토 후기 창 — 사진은 사진 칸 가운데, 오른쪽에 글과 사진, 바닥의 이전 · 다음 후기가 창 안에", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`/shop/products/${encodeURIComponent(itemId)}?tab=reviews`);
    await page.locator(".product-review-photo").first().click();
    const dialog = page.locator(".review-photo-dialog");
    await expect(dialog).toBeVisible();
    const box = async (selector: string) => (await dialog.locator(selector).first().boundingBox())!;

    // 세로로 긴 사진 · 긴 본문이 있어도 칸이 창 높이를 넘지 않는다.
    const frame = (await dialog.boundingBox())!;
    const stage = await box(".review-photo-stage");
    expect(Math.round(stage.height)).toBe(Math.round(frame.height));
    await expect(dialog.locator(".swiper-slide-active img")).toBeVisible();
    const photo = await box(".swiper-slide-active img");
    expect(Math.abs(photo.y + photo.height / 2 - (stage.y + stage.height / 2))).toBeLessThanOrEqual(2);

    const foot = await box(".review-photo-foot");
    expect(foot.y + foot.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    await expect(dialog.getByRole("button", { name: "다음 후기" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "이전 후기" })).toBeInViewport();

    // 오른쪽 본문은 글과 사진을 함께 — 사진은 칸 폭 안에서 보인다.
    const textPhoto = dialog.locator(".review-photo-text img").first();
    await expect(textPhoto).toBeVisible();
    const text = await box(".review-photo-text");
    expect((await textPhoto.boundingBox())!.width).toBeLessThanOrEqual(text.width + 1);

    await dialog.getByRole("button", { name: "다음 후기" }).click();
    await expect(dialog.locator(".review-photo-pos")).toContainText(/^2 \//);
  });
});
