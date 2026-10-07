import { test, expect, request as pwRequest, type TestInfo } from '@playwright/test';
import {
  OPTION_PRODUCT_ID,
  PRIMARY_PRODUCT_ID,
  addFixtureProduct,
  apiBase,
  clearCart,
  fetchProduct,
  firstUsableBaseOption,
  login,
  loginId,
  loginPassword,
  smokeQuantity,
  type ShopSmokeCartItem,
} from './helpers/shop-e2e';

/**
 * 쇼핑몰 결제 종단 시나리오 — Playwright API 호출만으로 검증.
 * UI 클릭 없이도 prepare → confirm → 주문 상세까지 흐름 보장.
 *
 *   - env 기반 테스트 계정 로그인
 *   - 상품 카트 추가
 *   - PG prepare → confirm (KCP test 사이트코드)
 *   - 주문 상세 GET → od_status='주문', od_receipt_price 일치
 *
 * CI 환경에선 PHP API (/api/v1) 가 같이 떠 있어야 통과. dev 머신 외에선
 * skip 처리 권장 (test.skip).
 */

test.describe('쇼핑몰 결제 종단 흐름', () => {
  test.skip(!process.env.RUN_SHOP_E2E, 'shop e2e — RUN_SHOP_E2E=1 set 시만 실행');
  test.skip(!loginId || !loginPassword, 'Set LOCAL_SMOKE_LOGIN_ID and LOCAL_SMOKE_LOGIN_PASSWORD to run shop e2e.');

  test('KCP 신용카드 prepare → confirm → 주문 상세 일치', async () => {
    const api = apiBase(test.info());
    const req = await pwRequest.newContext();
    const token = await login(req, api);
    const headers = { Authorization: `Bearer ${token}` };

    await clearCart(req, api, headers);
    await addFixtureProduct(req, api, headers, PRIMARY_PRODUCT_ID);

    // prepare
    const prepRes = await req.post(`${api}/shop/payment/prepare`, {
      headers,
      data: {
        od_name: '최고관리자',
        od_hp: '010-2222-3332',
        od_zip1: '062',
        od_zip2: '53',
        od_addr1: '서울 강남구 도곡로1길 14',
        od_settle_case: '신용카드',
      },
    });
    expect(prepRes.ok(), 'prepare ok').toBeTruthy();
    const prep = await prepRes.json();
    const orderId = prep.data.order_id;
    const amount = prep.data.amount;

    // confirm — KCP T0000 시뮬레이션
    const confRes = await req.post(`${api}/shop/payment/confirm`, {
      headers,
      data: {
        pg_service: 'kcp',
        order_id: orderId,
        amount,
        res_cd: '0000',
        enc_info: 'X',
        enc_data: 'Y',
        tran_cd: '00100000',
        site_cd: 'T0000',
      },
    });
    expect(confRes.ok(), 'confirm ok').toBeTruthy();

    // 주문 상세
    const detRes = await req.get(`${api}/shop/orders/${orderId}`, { headers });
    expect(detRes.ok(), 'detail ok').toBeTruthy();
    const det = await detRes.json();
    expect(det.data.od_status).toBe('주문');
    expect(det.data.od_receipt_price).toBe(amount);
  });

  test('주문 취소 — 재고/포인트 복구', async () => {
    const api = apiBase(test.info());
    const req = await pwRequest.newContext();
    const token = await login(req, api);
    const headers = { Authorization: `Bearer ${token}` };

    await clearCart(req, api, headers);

    const before = await (await req.get(`${api}/shop/points/summary`, { headers })).json();
    const balBefore = before.data.balance as number;

    await addFixtureProduct(req, api, headers, PRIMARY_PRODUCT_ID);

    const prep = await (
      await req.post(`${api}/shop/payment/prepare`, {
        headers,
        data: {
          od_name: '최고관리자',
          od_hp: '010-2222-3332',
          od_zip1: '062',
          od_zip2: '53',
          od_addr1: '서울 강남구 도곡로1길 14',
          od_settle_case: '신용카드',
          point_use: 1000,
        },
      })
    ).json();

    await req.post(`${api}/shop/payment/confirm`, {
      headers,
      data: {
        pg_service: 'kcp',
        order_id: prep.data.order_id,
        amount: prep.data.amount,
        res_cd: '0000',
        enc_info: 'X',
        enc_data: 'Y',
        tran_cd: '00100000',
        site_cd: 'T0000',
      },
    });

    const paid = await (await req.get(`${api}/shop/points/summary`, { headers })).json();
    expect(paid.data.balance, 'point used').toBe(balBefore - 1000);

    // 취소
    const cancelRes = await req.patch(`${api}/shop/orders/${prep.data.order_id}`, {
      headers,
      data: { reason: 'e2e 취소 테스트' },
    });
    expect(cancelRes.ok(), 'cancel ok').toBeTruthy();

    const after = await (await req.get(`${api}/shop/points/summary`, { headers })).json();
    expect(after.data.balance, 'point refunded').toBe(balBefore);
  });

  test('옵션 상품 장바구니 추가 — 선택 옵션 행이 저장된다', async () => {
    test.skip(!OPTION_PRODUCT_ID, 'Set SHOP_E2E_OPTION_PRODUCT_ID to verify option product cart flow.');

    const api = apiBase(test.info() as TestInfo);
    const req = await pwRequest.newContext();
    const token = await login(req, api);
    const headers = { Authorization: `Bearer ${token}` };

    await clearCart(req, api, headers);

    const product = await fetchProduct(req, api, OPTION_PRODUCT_ID);
    const option = firstUsableBaseOption(product);
    expect(option, 'option fixture must expose an in-stock base option').not.toBeNull();

    const qty = smokeQuantity(product, 2);
    await addFixtureProduct(req, api, headers, OPTION_PRODUCT_ID, qty);

    const cartRes = await req.get(`${api}/shop/cart`, { headers });
    expect(cartRes.ok(), 'cart ok').toBeTruthy();
    const cart = await cartRes.json();
    const row = ((cart.data?.items || []) as ShopSmokeCartItem[]).find(
      (item) =>
        String(item.it_id) === String(OPTION_PRODUCT_ID) &&
        String(item.io_id) === String(option?.ioId)
    );
    expect(row, 'option cart row persisted').toBeTruthy();
    if (!row) throw new Error('option cart row persisted assertion did not narrow the row');
    // ct_option 은 영카트 io_value 와 같은 표시 글자("색상:실버 / 크기:L") — io_id 원문의 구분 문자가 들어가면 안 된다.
    expect(String(row.ct_option), 'ct_option is the YoungCart display text').not.toContain('\x1e');
    expect(Number(row.ct_qty), 'option cart quantity').toBe(qty);

    await clearCart(req, api, headers);
  });
});
