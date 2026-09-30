import { expect, test } from '@playwright/test';
import {
  hasSmokeLoginCredentials,
  loginThroughForm,
  smokeLoginSkipReason,
} from './helpers/login';

test('login stores auth tokens as httpOnly cookies with a public hint', async ({ page }) => {
  test.skip(!hasSmokeLoginCredentials, smokeLoginSkipReason);

  const loginResponse = await loginThroughForm(page);

  const loginPayload = await loginResponse.json();
  const memberKeys = Object.keys(loginPayload?.data?.member ?? {});
  expect(memberKeys).not.toContain('mb_password');
  expect(memberKeys).not.toContain('mb_password2');
  expect(memberKeys).not.toContain('mb_password_q');
  expect(memberKeys).not.toContain('mb_password_a');

  const cookies = await page.context().cookies();
  const tokenCookie = cookies.find((cookie) => cookie.name === 'g5_token');
  const refreshCookie = cookies.find((cookie) => cookie.name === 'g5_refresh');
  const authHintCookie = cookies.find((cookie) => cookie.name === 'g5_auth_hint');
  const visibleCookieNames = await page.evaluate(() =>
    document.cookie
      .split(';')
      .map((item) => item.trim().split('=')[0])
      .filter(Boolean)
  );

  expect(tokenCookie?.value).toBeTruthy();
  expect(tokenCookie?.httpOnly).toBe(true);
  expect(refreshCookie?.httpOnly).toBe(true);
  expect(authHintCookie?.value).toBe('1');
  expect(authHintCookie?.httpOnly).toBe(false);
  expect(visibleCookieNames).not.toContain('g5_token');
  expect(visibleCookieNames).not.toContain('g5_refresh');
  expect(visibleCookieNames).toContain('g5_auth_hint');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('input[name="mb_password"]')).toHaveCount(0);
});
