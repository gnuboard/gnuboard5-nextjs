import { test, expect, type Page } from '@playwright/test';

/**
 * 쇼핑 UI 플로우 — 상품 상세 → 장바구니 → 주문/결제 화면이 렌더되고 이어지는지.
 *
 * 이 스펙의 목적은 대형 화면 컴포넌트(ProductDetailClient ~3000줄,
 * shop/order ~1800줄)를 분할/리팩터할 때의 **렌더 회귀 안전망**이다.
 * 데이터 정합성은 shop-checkout.spec.ts(API 레벨)가 담당하고, 여기서는
 * "컴포넌트가 던지지 않고 핵심 조작 요소가 보이는가"를 본다.
 *
 * 로컬 테마 앱(기본 http://localhost) + 동일 출처 PHP API 가 떠 있어야 통과하므로
 * RUN_SHOP_E2E=1 일 때만 실행한다.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost RUN_SHOP_E2E=1 npx playwright test shop-ui-flow
 */

const PRODUCT_ID =
  process.env.SHOP_E2E_PRODUCT_ID ?? process.env.LOCAL_SMOKE_SHOP_PRODUCT_ID ?? '1446772772';

function collectFatalErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  return errors;
}

async function assertNoNextErrorOverlay(page: Page, label: string) {
  const overlay = await page.locator('#nextjs__container_errors_label').count();
  expect(overlay, `${label}: Next.js 에러 오버레이`).toBe(0);
}

test.describe('쇼핑 UI 플로우', () => {
  test.skip(!process.env.RUN_SHOP_E2E, 'shop ui e2e — RUN_SHOP_E2E=1 set 시만 실행');

  test('상품 상세가 핵심 조작 요소와 함께 렌더된다', async ({ page }) => {
    const errors = collectFatalErrors(page);

    await page.goto(`/shop/${PRODUCT_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // 짧은 상품 URL은 테마/PHP 브리지에서 정적 셸로 연결해줘야 렌더된다.
    // 그 리라이트가 없는 bare next start 환경에선 404 셸이 떠서 검증 불가 → 깔끔히 skip.
    const notFound = await page.getByRole('heading', { name: '페이지를 찾을 수 없습니다' }).count();
    test.skip(notFound > 0, '상품 셸 리라이트가 없는 환경 — 실제 배포에서만 검증됨');

    // 상품명 제목
    await expect(page.locator('h1').first()).toBeVisible();

    // 구매 액션 영역 — 상품 상세가 실제로 마운트됐는지의 핵심 신호.
    // (옵션 상품은 전역 수량 스테퍼 대신 옵션별 수량을 쓰고, 전화문의/품절은
    //  버튼 구성이 달라지므로 "구매 동선 요소 중 하나라도" 보이면 통과.)
    const cartBtn = page.getByRole('button', { name: '장바구니' });
    const buyBtn = page.getByRole('button', { name: '바로구매' });
    const qtyDown = page.getByRole('button', { name: '수량 감소' });
    const wishBtn = page.getByRole('button', { name: '위시리스트에 추가' });
    const hasAction =
      (await cartBtn.count()) > 0 ||
      (await buyBtn.count()) > 0 ||
      (await qtyDown.count()) > 0 ||
      (await wishBtn.count()) > 0;
    expect(hasAction, '구매 동선(장바구니/바로구매/수량/위시) 요소 노출').toBeTruthy();

    await assertNoNextErrorOverlay(page, '상품 상세');
    expect(errors, `치명적 에러: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('장바구니 화면이 렌더된다 (목록 또는 빈 상태)', async ({ page }) => {
    const errors = collectFatalErrors(page);

    await page.goto('/shop/cart', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 비어있든 차있든 "장바구니" 텍스트는 노출되어야 함 (제목 또는 빈 상태 문구)
    await expect(page.getByText(/장바구니/).first()).toBeVisible();

    await assertNoNextErrorOverlay(page, '장바구니');
    expect(errors, `치명적 에러: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('주문/결제 화면이 렌더되거나 빈 장바구니로 안전하게 이동한다', async ({ page }) => {
    const errors = collectFatalErrors(page);

    await page.goto('/shop/order', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // 주문 항목이 있으면 "주문/결제" 폼, 없으면 장바구니로 리다이렉트 — 둘 다 정상.
    const onOrder = (await page.getByRole('heading', { name: '주문/결제' }).count()) > 0;
    const onCart = page.url().includes('/shop/cart');
    const cartText = (await page.getByText(/장바구니/).count()) > 0;
    expect(onOrder || onCart || cartText, '주문 폼 또는 장바구니로 귀결').toBeTruthy();

    await assertNoNextErrorOverlay(page, '주문/결제');
    expect(errors, `치명적 에러: ${errors.join(' | ')}`).toHaveLength(0);
  });
});
