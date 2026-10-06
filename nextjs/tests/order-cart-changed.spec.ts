import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";

/*
 * 장바구니가 바뀌면 주문서가 본 것만 주문한다 — 실제 사이트에 대고 브라우저로 돈다(로그인 · 장바구니 · 주문서).
 * 시험 회원의 장바구니에 상품 줄 둘을 담고 끝에 지운다. 주문은 만들지 않는다(카드 결제 준비가 멈춰야 한다).
 *
 *   CART_SMOKE_MEMBER_ID / CART_SMOKE_MEMBER_PASSWORD   시험 전용 회원(다른 사람 · 세션이 쓰지 않는 회원)
 *   CART_SMOKE_ITEM_IDS                                 옵션 없이 1개씩 담을 수 있는 판매 중 상품 둘, 쉼표로
 *   예: PLAYWRIGHT_BASE_URL=http://localhost CART_SMOKE_MEMBER_ID=… CART_SMOKE_ITEM_IDS=1417651530,1403059869 npm run test:cart-e2e
 *
 * 지키는 것: 다른 장바구니 번호(그누보드 화면 · 다른 기기)에 담긴 상품이 장바구니 화면에 모이고, 주문서는 보여 준
 * 줄로 배송비를 묻는다. 주문서를 띄운 뒤 줄 하나가 사라지면 결제는 409 CART_CHANGED 로 멈추고, 주문서는 입력한
 * 내용을 둔 채 남은 줄만 다시 보여 준다.
 */

const env = process.env;
const member = { id: env.CART_SMOKE_MEMBER_ID || "", password: env.CART_SMOKE_MEMBER_PASSWORD || "" };
const itemIds = (env.CART_SMOKE_ITEM_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
const configured = Boolean(member.id && member.password && itemIds.length >= 2);

type Json = {
  success?: boolean;
  message?: string;
  data?: { token?: string; ct_id?: string | number; it_name?: string; cart_id?: string; order_id?: string };
};

/** 앱처럼 토큰과 장바구니 번호만 보내는 API 요청 — 브라우저의 쿠키와 섞이지 않게 요청마다 새 문맥. */
async function api(baseURL: string, method: string, path: string, token: string, cartId: string, data?: unknown) {
  const context = await playwrightRequest.newContext();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cartId) headers["X-Cart-Id"] = cartId;
    const response = await context.fetch(new URL(`/api/v1/${path}`, baseURL).href, {
      method,
      headers,
      data: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: response.status(), body: (await response.json().catch(() => ({}))) as Json };
  } finally {
    await context.dispose();
  }
}

async function loginInBrowser(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  const form = page.locator("form").filter({ has: page.locator('input[name="mb_password"]') }).first();
  await form.locator('input[name="mb_id"]').fill(member.id);
  await form.locator('input[name="mb_password"]').fill(member.password);
  await form.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 10000 });
}

/** 이 브라우저의 장바구니 번호 — 쿠키로 정해진 것을 API 가 돌려준다(ct_ids=0 이라 모으지 않고 빈 목록). */
async function browserCartId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch("/api/v1/shop/cart?ct_ids=0", { credentials: "include" });
    const payload = (await response.json().catch(() => null)) as { data?: { cart_id?: string } } | null;
    return String(payload?.data?.cart_id ?? "");
  });
}

test.describe("order form when the cart changes", () => {
  test.skip(!configured, "CART_SMOKE_MEMBER_* · CART_SMOKE_ITEM_IDS(둘) 를 주면 돈다");

  test("gathers rows, quotes shown rows, and reloads instead of ordering a changed cart", async ({ page, baseURL }) => {
    const base = baseURL || "";
    const login = await api(base, "POST", "auth/login", "", "", { mb_id: member.id, mb_password: member.password });
    const token = login.body.data?.token || "";
    expect(token, "api login").not.toBe("");

    const elsewhere = `9${Date.now()}`.padEnd(16, "1");
    const rows: Array<{ ctId: string; name: string }> = [];
    let cartId = "";
    let draftOrderId = "";

    try {
      await loginInBrowser(page);
      await page.goto("/shop/cart", { waitUntil: "networkidle" });

      // 그누보드 화면 · 다른 기기의 장바구니에 담긴다
      for (const itemId of itemIds.slice(0, 2)) {
        const added = await api(base, "POST", "shop/cart", token, elsewhere, { it_id: itemId, ct_qty: 1 });
        expect(added.body.success, added.body.message).toBe(true);
        rows.push({ ctId: String(added.body.data?.ct_id), name: String(added.body.data?.it_name) });
      }

      await page.reload({ waitUntil: "networkidle" });
      for (const row of rows) await expect(page.locator("main")).toContainText(row.name);
      cartId = await browserCartId(page);
      expect(cartId, "browser cart id").not.toBe("");
      expect(cartId).not.toBe(elsewhere);

      const quote = page.waitForRequest((request) => request.url().includes("/shop/shipping"));
      await page.goto("/shop/order", { waitUntil: "networkidle" });
      const quoteUrl = decodeURIComponent((await quote).url());
      for (const row of rows) expect(quoteUrl, "shipping quote asks for the shown rows").toContain(row.ctId);

      // 주문서를 띄운 뒤 다른 탭 · 기기에서 줄 하나가 사라진다
      const removed = await api(base, "DELETE", `shop/cart/${rows[1].ctId}`, token, cartId);
      expect([200, 204]).toContain(removed.status);

      await page.fill("#order-orderer-name", "장바구니시험");
      await page.fill("#order-orderer-hp", "010-0000-0000");
      await page.fill("#order-orderer-zip", "12345");
      await page.fill("#order-orderer-addr1", "서울");
      const card = page.getByText("신용카드", { exact: true }).first();
      test.skip((await card.count()) === 0, "신용카드 결제가 꺼져 있다");
      await card.click();
      await page.getByLabel("전체 동의").check();

      const prepared = page.waitForResponse((response) => response.url().includes("/shop/payment/prepare"));
      await page.locator("button.shop-order-submit").first().click();
      const prepareResponse = await prepared;
      const prepareBody = (await prepareResponse.json().catch(() => ({}))) as Json & { errors?: { code?: string } };
      draftOrderId = String(prepareBody.data?.order_id ?? "");
      expect(prepareResponse.status(), "payment prepare stops").toBe(409);
      expect(prepareBody.errors?.code).toBe("CART_CHANGED");

      // 토스트 본문(화면 낭독기용 알림에도 같은 글이 있다)
      await expect(
        page.locator('[data-slot="toast-description"]', { hasText: "장바구니가 바뀌어 주문할 상품을 다시 불러왔습니다" })
      ).toBeVisible();
      await expect(page.locator("main")).toContainText(rows[0].name);
      await expect(page.locator("main")).not.toContainText(rows[1].name);
      await expect(page.locator("#order-orderer-addr1")).toHaveValue("서울");
    } finally {
      if (draftOrderId) {
        await api(base, "POST", "shop/payment/cancel", token, cartId, { order_id: draftOrderId, reason: "cart e2e cleanup" });
      }
      for (const row of rows) {
        for (const id of [cartId, elsewhere].filter(Boolean)) {
          await api(base, "DELETE", `shop/cart/${row.ctId}`, token, id);
        }
      }
    }
  });
});
