import { test, expect } from '@playwright/test';
import { installMockWallet, connectWallet, ACCOUNTS } from './helpers/mockWallet.js';
import { makeActiveEscrow, makeEscrowWithBothImages, getState, getBalance } from './helpers/chain.js';

// Nut Raise Dispute la phan moi them va chua ai bam thu lan nao.
// Dieu kien hien nut: co DU 2 anh (anh seller dang + anh buyer chup luc nhan).
test.describe('Nut Raise Dispute', () => {
  test('AN khi thieu anh bang chung, kem huong dan thay the', async ({ page }) => {
    const escrow = await makeActiveEscrow(); // moi co anh cua seller
    await installMockWallet(page, ACCOUNTS.buyer);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.buyer);

    await expect(page.locator('.state-badge')).toContainText('ACTIVE');
    await expect(page.getByRole('button', { name: /raise dispute/i })).toHaveCount(0);
    await expect(page.getByText(/a dispute needs both photos/i)).toBeVisible();
  });

  test('HIEN khi du 2 anh, va bam vao thi doi state sang DISPUTED', async ({ page }) => {
    const escrow = await makeEscrowWithBothImages();
    expect(Number(await getState(escrow))).toBe(3); // RETURN_REQUESTED

    const balanceBefore = await getBalance(escrow);

    await installMockWallet(page, ACCOUNTS.buyer);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.buyer);

    // Nut co window.confirm chan truoc khi goi tx
    page.on('dialog', (d) => d.accept());

    const button = page.getByRole('button', { name: /raise dispute/i });
    await expect(button).toBeVisible();
    await button.click();

    await expect.poll(async () => Number(await getState(escrow)), { timeout: 60_000 }).toBe(7);

    // Tien phai con nguyen trong escrow, dispute khong dong toi tien
    expect(await getBalance(escrow)).toBe(balanceBefore);
  });

  test('bam Huy trong hop thoai xac nhan thi khong gui gi', async ({ page }) => {
    const escrow = await makeEscrowWithBothImages();

    await installMockWallet(page, ACCOUNTS.buyer);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.buyer);

    page.on('dialog', (d) => d.dismiss()); // bam Huy

    await page.getByRole('button', { name: /raise dispute/i }).click();
    await page.waitForTimeout(5_000);

    expect(Number(await getState(escrow))).toBe(3); // van la RETURN_REQUESTED
  });

  test('nguoi ngoai khong thay nut', async ({ page }) => {
    const escrow = await makeEscrowWithBothImages();
    await installMockWallet(page, ACCOUNTS.outsider);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.outsider);

    await expect(page.getByRole('button', { name: /raise dispute/i })).toHaveCount(0);
  });
});

test.describe('Hien thi trang thai DISPUTED', () => {
  test('badge hien dung chu DISPUTED, khong phai undefined', async ({ page }) => {
    const escrow = await makeEscrowWithBothImages();

    await installMockWallet(page, ACCOUNTS.buyer);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.buyer);
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /raise dispute/i }).click();
    await expect.poll(async () => Number(await getState(escrow)), { timeout: 60_000 }).toBe(7);

    await page.reload();
    // Day la loi that truoc khi gom ABI ve lib: STATE_LABELS chi co 7 phan tu
    // nen state 7 render ra "undefined".
    await expect(page.locator('.state-badge')).toContainText('DISPUTED');
    await expect(page.locator('.state-badge')).not.toContainText('undefined');
    await expect(page.getByText(/dispute under review/i)).toBeVisible();
  });
});
