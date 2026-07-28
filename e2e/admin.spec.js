import { test, expect } from '@playwright/test';
import { generate } from 'otplib';

// Bo qua ca file neu chua cau hinh TOTP, thay vi bao fail nham.
const SECRET = process.env.ADMIN_TOTP_SECRET;
test.skip(!SECRET, 'Thieu ADMIN_TOTP_SECRET trong .env.local');

test.describe('Bao ve trang admin', () => {
  test('chua dang nhap thi bi day ve trang login', async ({ page }) => {
    await page.goto('/admin/disputes');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText(/enter the six digit code/i)).toBeVisible();
  });

  test('ma sai thi bao loi va khong vao duoc', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByPlaceholder('000000').fill('000000');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/ma khong dung/i)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('ma dung thi vao duoc trang disputes', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByPlaceholder('000000').fill(await generate({ secret: SECRET }));
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/admin\/disputes/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /disputes/i })).toBeVisible();
    await expect(page.getByText(/awaiting the agent/i)).toBeVisible();
  });

  test('cookie gia mao khong vao duoc', async ({ page, context }) => {
    await context.addCookies([
      { name: 'escrowmad_admin', value: '99999999999999.chu-ky-bia-dat', url: 'http://localhost:3100' },
    ]);
    await page.goto('/admin/disputes');

    // proxy.js thay co cookie nen cho qua, nhung page tu kiem chu ky HMAC va da ve login
    await expect(page.getByText(/awaiting the agent/i)).toHaveCount(0);
  });
});
