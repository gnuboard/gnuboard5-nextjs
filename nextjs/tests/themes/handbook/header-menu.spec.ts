import { expect, test } from '@playwright/test';

/** 하위 폴더 설치(PLAYWRIGHT_BASE_URL=http://host/gnu)에서도 돌도록 설치 경로를 붙인다(manual-navigation.spec.ts 와 같다). */
const BASE_PATH = new URL(process.env.PLAYWRIGHT_BASE_URL || process.env.LOCAL_APP_URL || 'http://localhost').pathname.replace(
  /\/+$/,
  ''
);

// handbook 테마 전용 — 테마 전용 테스트는 tests/themes/<테마>/ 에 둔다(공개 배포판은 공개 테마 것만 싣는다).
test('mobile drawer exposes nested administrator menus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_PATH}/`, { waitUntil: 'networkidle' });

  const toggle = page.locator('.doc-hamburger').filter({ visible: true }).first();
  if ((await toggle.count()) === 0) {
    expect(process.env.HANDBOOK_E2E, 'HANDBOOK_E2E=1 but the active theme is not Handbook').not.toBe('1');
    test.skip(true, 'active theme does not render the Handbook mobile drawer');
  }

  await toggle.click();

  // 왼쪽 사이드바는 daisyUI Drawer — 여닫힘은 체크박스(.drawer-toggle) 상태다.
  const drawerToggle = page.locator('#doc-drawer-toggle');
  const sidebar = page.locator('.doc-sidebar');
  await expect(drawerToggle).toBeChecked();
  // 서랍은 모달 — 열린 동안 상단 바 · 본문 · 푸터는 inert 라 Tab 이 서랍 뒤로 빠지지 않는다.
  await expect(page.locator('.doc-topbar')).toHaveAttribute('inert', '');
  await expect(page.locator('.drawer-content')).toHaveAttribute('inert', '');
  // 서랍이 열린 동안 Ctrl+K 는 검색 창을 열지 않는다 — 상단 바가 inert 라 열려도 쓸 수 없다.
  await page.keyboard.press('Control+K');
  await expect(page.locator('.doc-search-dialog')).toBeHidden();
  // 서랍 맨 위의 메뉴는 상위 메뉴마다 접혀 있다 — 화살표로 하위 메뉴를 편다. 하위 메뉴가 있는 관리자 메뉴가 없는
  // 사이트(관리자 메뉴 0개 등)에서는 이 부분만 건너뛴다 — 검수(HANDBOOK_E2E=1)에서는 실패.
  const menuToggles = sidebar.locator('.doc-drawer-menu-toggle');
  if ((await menuToggles.count()) > 0) {
    await menuToggles.first().click();
    await expect(sidebar.locator('.doc-nav-children a[href]').first()).toBeVisible();
  } else {
    expect(process.env.HANDBOOK_E2E, 'HANDBOOK_E2E=1 needs an admin menu with sub-menus').not.toBe('1');
  }

  await page.keyboard.press('Escape');
  await expect(drawerToggle).not.toBeChecked();
  await expect(sidebar).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(page.locator('.doc-topbar')).not.toHaveAttribute('inert', /.*/);
  await expect(page.locator('.drawer-content')).not.toHaveAttribute('inert', /.*/);
});
