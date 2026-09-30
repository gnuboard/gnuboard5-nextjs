import { expect, test, type Page } from '@playwright/test';

function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('login form handles empty submit without runtime errors', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('input[name="mb_id"]')).toBeVisible();
  await expect(page.locator('input[name="mb_password"]')).toBeVisible();

  await page.locator('#main-content form button[type="submit"]').click();
  await expect(page.locator('input[name="mb_id"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('login failure appears in a daisyUI error toast', async ({ page }) => {
  await page.route('**/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: 'Invalid member ID or password.',
      }),
    });
  });

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('input[name="mb_id"]').fill('invalid-member');
  await page.locator('input[name="mb_password"]').fill('invalid-password');
  await Promise.all([
    page.waitForRequest(
      (request) => request.url().includes('/auth/login') && request.method() === 'POST'
    ),
    page.locator('#main-content form button[type="submit"]').click(),
  ]);

  const toast = page.locator('[data-slot="toast"].alert.alert-error');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('아이디 또는 비밀번호가 올바르지 않습니다.');
  await expect(toast).not.toContainText('Invalid member ID or password.');
  const closeButton = toast.locator('button[aria-label="알림 닫기"]');
  await expect(closeButton).toBeVisible();
  await expect(page.locator('#main-content [role="alert"]')).toHaveCount(0);
  await closeButton.click();
  await expect(toast).toBeHidden();
});

test('register form handles empty submit without runtime errors', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  const registerForm = page.locator('#main-content form').first();
  await expect(registerForm).toBeVisible();

  const submit = registerForm.locator('button[type="submit"]').first();
  if ((await submit.count()) > 0) {
    await submit.click();
  }

  await expect(registerForm).toBeVisible();
  expect(errors).toEqual([]);
});
