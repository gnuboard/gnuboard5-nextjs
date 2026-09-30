import type { Page, Response } from '@playwright/test';

export const smokeLoginId = process.env.LOCAL_SMOKE_LOGIN_ID || process.env.E2E_LOGIN_ID || '';
export const smokeLoginPassword = process.env.LOCAL_SMOKE_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD || '';
export const hasSmokeLoginCredentials = Boolean(smokeLoginId && smokeLoginPassword);
export const smokeLoginSkipReason =
  'Set LOCAL_SMOKE_LOGIN_ID and LOCAL_SMOKE_LOGIN_PASSWORD to run login e2e.';

export function loginForm(page: Page) {
  return page.locator('form').filter({ has: page.locator('input[name="mb_password"]') }).first();
}

export async function loginThroughForm(page: Page): Promise<Response> {
  await page.goto('/login', { waitUntil: 'networkidle' });

  const form = loginForm(page);
  await form.locator('input[name="mb_id"]').fill(smokeLoginId);
  await form.locator('input[name="mb_password"]').fill(smokeLoginPassword);

  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/auth/login') && response.request().method() === 'POST'
  );
  await form.locator('button[type="submit"]').click();
  const loginResponse = await loginResponsePromise;
  await page.waitForURL('**/', { timeout: 10000 });

  return loginResponse;
}

export async function readAuthMe(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/me', { credentials: 'include' });
    const payload = await response.json().catch(() => null);
    return {
      status: response.status,
      payload,
    };
  });
}
