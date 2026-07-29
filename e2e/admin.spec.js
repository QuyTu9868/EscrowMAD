import { test, expect } from '@playwright/test';
import { generate } from 'otplib';
import { makeEscrowWithBothImages, raiseDispute, latestOrderId } from './helpers/chain.js';

// Bo qua ca file neu chua cau hinh TOTP, thay vi bao fail nham.
const SECRET = process.env.ADMIN_TOTP_SECRET;
test.skip(!SECRET, 'Thieu ADMIN_TOTP_SECRET trong .env.local');

// Dang nhap that roi dung lai session cho cac test sau.
async function login(page) {
  await page.goto('/admin/login');
  await page.getByPlaceholder('000000').fill(await generate({ secret: SECRET }));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/disputes/, { timeout: 30_000 });
}

test.describe('Bao ve trang admin', () => {
  test('chua dang nhap thi bi day ve trang login', async ({ page }) => {
    await page.goto('/admin/disputes');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText(/enter the six digit code/i)).toBeVisible();
  });

  test('go /admin thi khong con 404, tu vao danh sach', async ({ page }) => {
    // Truoc day chi co /admin/login va /admin/disputes nen /admin tra 404.
    const res = await page.goto('/admin');
    expect(res.status(), 'Van con 404').toBeLessThan(400);
    await expect(page).toHaveURL(/\/admin\/(login|disputes)/);
  });

  test('trang chi tiet cung bi chan khi chua dang nhap', async ({ page }) => {
    await page.goto('/admin/disputes/0');
    await expect(page).toHaveURL(/\/admin\/login/);
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

  test('bam Open full record thi sang trang chi tiet dung don do', async ({ page }) => {
    // Tao mot dispute that de danh sach chac chan co it nhat 1 the.
    const escrow = await makeEscrowWithBothImages();
    const orderId = await latestOrderId();
    await raiseDispute(escrow);

    await login(page);

    // KHONG dung .first(): cac test truoc cung tao dispute nen danh sach co
    // nhieu the, the dau tien khong phai don vua tao.
    const link = page.locator(`a[href="/admin/disputes/${orderId}"]`);
    await expect(link, 'Khong thay link mo don vua tao').toHaveCount(1);
    await link.click();

    await expect(page).toHaveURL(new RegExp(`/admin/disputes/${orderId}$`));
    await expect(page.getByRole('heading', { name: new RegExp(`Order ${orderId}$`) })).toBeVisible();
  });

  test('trang chi tiet hien du thong tin, ke ca anh luc gui hang', async ({ page }) => {
    const escrow = await makeEscrowWithBothImages();
    const orderId = await latestOrderId();

    await login(page);
    await page.goto(`/admin/disputes/${orderId}`);

    // Danh sach chi hien 2 anh; trang chi tiet phai co ca 3 o, ke ca o trong.
    await expect(page.locator('.detail-photo')).toHaveCount(3);
    for (const label of ['Listed', 'Dispatched', 'Arrived']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // Nhung truong ma danh sach khong he co
    for (const label of ['Seller', 'Buyer', 'Item price', 'Pool at stake', 'Held right now']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // Chua ai xu thi phai noi ro la chua, khong duoc de trong
    await expect(page.getByText(/has not settled this one yet/i)).toBeVisible();

    await expect(page.locator('.detail-value', { hasText: escrow.slice(0, 10) })).toBeVisible();
  });

  test('orderId khong ton tai thi ra trang not-found, khong phai trang vo', async ({ page }) => {
    await login(page);
    await page.goto('/admin/disputes/999999');

    // KHONG kiem HTTP status: trang nay la server component co await nen bi
    // stream, ma Next 16 da gui header truoc khi notFound() chay. Tai lieu ghi
    // ro "200 for streamed responses... the status code cannot be updated".
    // Thu kiem duoc la UI not-found va the noindex ma Next chen vao.
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /Order 999999/ })).toHaveCount(0);
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
