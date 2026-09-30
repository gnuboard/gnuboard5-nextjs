import { expect, test } from '@playwright/test';
import {
  hasSmokeLoginCredentials,
  loginThroughForm,
  readAuthMe,
  smokeLoginSkipReason,
} from './helpers/login';

test('login state persists after navigating to another page', async ({ page }) => {
  test.skip(!hasSmokeLoginCredentials, smokeLoginSkipReason);

  await loginThroughForm(page);

  const signedInMarker = page.locator('a[href="/mypage"], header button .rounded-full, header .rounded-full');
  await expect(signedInMarker.first()).toBeVisible({ timeout: 5000 });

  await page.goto('/boards', { waitUntil: 'networkidle' });

  const authStatus = await readAuthMe(page);
  const loginForms = page.locator('form').filter({ has: page.locator('input[name="mb_password"]') });

  expect(authStatus.status).toBe(200);
  expect(authStatus.payload?.data?.authenticated).toBe(true);
  await expect(loginForms).toHaveCount(0);
});
