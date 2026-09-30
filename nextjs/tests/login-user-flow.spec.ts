import { expect, test } from '@playwright/test';
import {
  hasSmokeLoginCredentials,
  loginThroughForm,
  readAuthMe,
  smokeLoginSkipReason,
} from './helpers/login';

const authenticatedPages = [
  { name: 'mypage', path: '/mypage' },
  { name: 'mypage orders', path: '/mypage/orders' },
  { name: 'shop wishlist', path: '/shop/wishlist' },
];

test('authenticated member pages keep the user signed in', async ({ page }) => {
  test.skip(!hasSmokeLoginCredentials, smokeLoginSkipReason);

  await loginThroughForm(page);

  for (const memberPage of authenticatedPages) {
    await page.goto(memberPage.path, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);

    const authStatus = await readAuthMe(page);
    const loginForms = page.locator('form').filter({ has: page.locator('input[name="mb_password"]') });

    await expect(page.locator('#main-content, main').first(), memberPage.name).toBeVisible({ timeout: 10000 });
    expect(authStatus.status, memberPage.name).toBe(200);
    expect(authStatus.payload?.data?.authenticated, memberPage.name).toBe(true);
    await expect(loginForms, memberPage.name).toHaveCount(0);
  }
});
