import { expect, request as playwrightRequest, test } from "@playwright/test";

/*
 * 장바구니 모으기 · 주문서가 보여 준 줄만 주문 — 실제 사이트의 /api/v1/shop 에 대고 돈다. 시험 회원의 장바구니에
 * 상품 줄을 담고 끝에 지운다. 주문은 만들지 않는다(멈춰야 하는 요청만 보낸다).
 *
 *   CART_SMOKE_MEMBER_ID / CART_SMOKE_MEMBER_PASSWORD   시험 전용 회원 — 다른 사람 · 세션이 쓰지 않는 회원. 장바구니
 *                                                       목록을 열면 그 회원의 다른 장바구니 상품이 시험 장바구니로
 *                                                       모인다(그 사람이 장바구니를 다시 열면 돌아가지만, 주문서를
 *                                                       띄워 둔 중이면 그 주문이 409 로 멈춘다).
 *   CART_SMOKE_ITEM_ID                                  옵션 없이 담을 수 있는 판매 중 상품
 *   CART_SMOKE_API_URL(선택)                            API 주소. 없으면 PLAYWRIGHT_BASE_URL 의 api/v1/
 *   예: PLAYWRIGHT_BASE_URL=http://localhost CART_SMOKE_MEMBER_ID=… CART_SMOKE_ITEM_ID=… npm run test:cart-api
 *
 * 지키는 것: 다른 장바구니 번호에 담긴 회원 상품은 장바구니 목록(gather=1)에서 지금 장바구니로 모이고, 바로구매 줄과 줄
 * 지정 · 바로구매 목록, gather 없이 부르는 목록(머리의 미니 장바구니)은 모으지 않는다. 주문서가 보낸 줄이 하나라도 없으면 주문 · 결제 준비는 409(CART_CHANGED)로 멈춘다.
 */

const env = process.env;
const member = { id: env.CART_SMOKE_MEMBER_ID, password: env.CART_SMOKE_MEMBER_PASSWORD };
const itemId = env.CART_SMOKE_ITEM_ID || "";
const configured = Boolean(member.id && member.password && itemId);

function apiUrl(path: string): string {
  const site = (env.PLAYWRIGHT_BASE_URL || env.LOCAL_APP_URL || "").replace(/\/?$/, "/");
  const base = (env.CART_SMOKE_API_URL || new URL("api/v1/", site).href).replace(/\/?$/, "/");
  return new URL(path, base).href;
}

type Row = { ct_id?: string | number };
type Json = {
  success?: boolean;
  message?: string;
  data?: { token?: string; ct_id?: string | number; items?: Row[] };
  errors?: { code?: string };
};

/**
 * 앱처럼 토큰과 장바구니 번호(X-Cart-Id)만 보내는 요청. 요청마다 쿠키 없는 새 문맥을 쓴다 — 쿠키가 남으면 장바구니 번호가
 * 쿠키에서도 정해지고, 쓰기 요청은 쿠키 로그인으로 보여 Origin 을 요구한다.
 */
async function call(method: string, path: string, token: string, cartId: string, data?: unknown) {
  const context = await playwrightRequest.newContext();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cartId) headers["X-Cart-Id"] = cartId;
    const response = await context.fetch(apiUrl(path), {
      method,
      headers,
      data: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = (await response.json().catch(() => ({}))) as Json;
    return { status: response.status(), body };
  } finally {
    await context.dispose();
  }
}

const ids = (body: Json) => (body.data?.items ?? []).map((row) => String(row.ct_id));

/** 시험마다 새 장바구니 번호(16자리 숫자) — 실제 장바구니 · 주문 번호와 겹치지 않게 9로 시작한다. */
function newCartId(slot: number): string {
  return `9${Date.now()}${slot}${Math.floor(Math.random() * 10)}`;
}

const orderer = { od_name: "장바구니 시험", od_hp: "010-0000-0000", od_zip: "12345", od_addr1: "서울", od_settle_case: "무통장" };

test.describe("cart api: gather member rows, order only shown rows", () => {
  test.skip(!configured, "CART_SMOKE_MEMBER_* · CART_SMOKE_ITEM_ID 를 주면 돈다");

  test("rows from another cart gather on the cart list, orders stop when shown rows are gone", async () => {
    const login = await call("POST", "auth/login", "", "", { mb_id: member.id, mb_password: member.password });
    const token = login.body.data?.token || "";
    expect(token, "login").not.toBe("");

    const elsewhere = newCartId(1); // 그누보드 화면 · 다른 기기의 장바구니
    const here = newCartId(2); // 이 브라우저의 장바구니
    const other = newCartId(3); // 줄 지정 · 바로구매 목록만 연 장바구니
    const created: Array<{ ctId: string; cartId: string }> = [];

    try {
      const normal = await call("POST", "shop/cart", token, elsewhere, { it_id: itemId, ct_qty: 1 });
      expect(normal.body.success, normal.body.message).toBe(true);
      const normalId = String(normal.body.data?.ct_id);
      created.push({ ctId: normalId, cartId: elsewhere });

      const direct = await call("POST", "shop/cart", token, elsewhere, { it_id: itemId, ct_qty: 1, direct: 1 });
      expect(direct.body.success, direct.body.message).toBe(true);
      const directId = String(direct.body.data?.ct_id);
      created.push({ ctId: directId, cartId: elsewhere });

      // 줄 지정 · 바로구매 목록, gather 없이 부르는 목록(머리의 미니 장바구니)은 모으지 않는다
      await call("GET", "shop/cart?ct_ids=999999999&gather=1", token, other);
      await call("GET", "shop/cart?direct=1&gather=1", token, other);
      expect(ids((await call("GET", "shop/cart", token, other)).body)).toEqual([]);
      expect(ids((await call("GET", `shop/cart?ct_ids=${normalId}`, token, other)).body)).toEqual([]);

      // 장바구니 화면 · 주문서의 목록(gather=1)은 모은다 — 바로구매 줄은 두고
      const gathered = await call("GET", "shop/cart?gather=1", token, here);
      // 다른 줄까지 모였다면 이 회원을 누가 쓰고 있다 — 시험 전용 회원으로 다시 돌린다.
      expect(ids(gathered.body), "the test member must not be in use elsewhere").toEqual([normalId]);
      created[0].cartId = here;
      expect(ids((await call("GET", "shop/cart?direct=1", token, elsewhere)).body)).toContain(directId);

      // 주문서가 보여 준 줄 중 하나가 없으면(다른 탭 · 기기에서 지웠거나 옮겨 감) 주문 · 결제 준비는 멈춘다
      const shownCtIds = `${normalId},999999999`;
      const order = await call("POST", "shop/orders", token, here, { ...orderer, ct_ids: shownCtIds, client_uid: `cart-smoke-${here}` });
      expect(order.status, order.body.message).toBe(409);
      expect(order.body.errors?.code).toBe("CART_CHANGED");

      const prepare = await call("POST", "shop/payment/prepare", token, here, { ...orderer, ct_ids: shownCtIds });
      expect(prepare.status, prepare.body.message).toBe(409);
      expect(prepare.body.errors?.code).toBe("CART_CHANGED");

      // 받는 줄 번호는 100개까지 — 넘으면 앞의 줄만 잘라 주문하지 않고 거절한다
      const tooMany = Array.from({ length: 101 }, (_, index) => String(index + 1)).join(",");
      const big = await call("POST", "shop/orders", token, here, { ...orderer, ct_ids: tooMany, client_uid: `cart-smoke-many-${here}` });
      expect(big.status, big.body.message).toBe(422);
      expect(big.body.errors?.code).toBe("TOO_MANY_CART_ROWS");

      // 멈춘 주문은 줄을 건드리지 않는다
      expect(ids((await call("GET", `shop/cart?ct_ids=${normalId}`, token, here)).body)).toEqual([normalId]);
    } finally {
      for (const row of created) {
        await call("DELETE", `shop/cart/${row.ctId}`, token, row.cartId);
      }
    }
  });
});
