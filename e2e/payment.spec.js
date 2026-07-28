import { test, expect } from '@playwright/test';
import { installMockWallet, connectWallet, ACCOUNTS } from './helpers/mockWallet.js';
import { publicClient, getBalance, FACTORY_ADDRESS } from './helpers/chain.js';
import { FACTORY_ABI } from '../lib/escrowAbi.mjs';
import { parseEther } from 'viem';

const totalEscrows = () =>
  publicClient.readContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getTotalEscrows' });

test.describe('Ket noi vi', () => {
  test('ket noi duoc va hien dia chi vi', async ({ page }) => {
    await installMockWallet(page, ACCOUNTS.seller);
    await page.goto('/');
    await connectWallet(page, ACCOUNTS.seller);

    // RainbowKit hien dia chi rut gon sau khi ket noi
    const short = ACCOUNTS.seller.slice(-4).toLowerCase();
    await expect(page.locator('body')).toContainText(new RegExp(short, 'i'));
  });
});

test.describe('Tao hop dong va nap coc (flow tien)', () => {
  test('seller tra dung 20% coc va escrow moi xuat hien on-chain', async ({ page }) => {
    await installMockWallet(page, ACCOUNTS.seller);
    await page.goto('/');
    await connectWallet(page, ACCOUNTS.seller);

    const itemPrice = '0.05';
    const expectedDeposit = parseEther(itemPrice) / 5n;

    const countBefore = await totalEscrows();
    const balanceBefore = await getBalance(ACCOUNTS.seller);

    // Form deploy nam trong panel 'Contract' tren navbar
    await page.getByRole('button', { name: 'Contract', exact: true }).click();
    await page.getByPlaceholder(/item description/i).fill('E2E ghe cong thai hoc');
    await page.getByPlaceholder(/item price in eth/i).fill(itemPrice);

    await page.getByRole('button', { name: /deploy & send deposit/i }).click();

    // Cho escrow moi thuc su len chain
    await expect.poll(async () => Number(await totalEscrows()), { timeout: 60_000 })
      .toBe(Number(countBefore) + 1);

    // Tien phai roi khoi vi seller, it nhat bang so coc (con them gas)
    const balanceAfter = await getBalance(ACCOUNTS.seller);
    const spent = balanceBefore - balanceAfter;
    expect(spent).toBeGreaterThanOrEqual(expectedDeposit);

    // Va escrow moi phai giu dung so coc do
    const newEscrow = await publicClient.readContract({
      address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'allEscrows', args: [countBefore],
    });
    expect(await getBalance(newEscrow)).toBe(expectedDeposit);
  });

  test('user tu choi ky thi khong co escrow nao duoc tao', async ({ page }) => {
    // rejectAll gia lap user bam "Tu choi" trong vi
    await installMockWallet(page, ACCOUNTS.seller, { rejectAll: true });
    await page.goto('/');
    await connectWallet(page, ACCOUNTS.seller);

    const countBefore = await totalEscrows();

    // Form deploy nam trong panel 'Contract' tren navbar
    await page.getByRole('button', { name: 'Contract', exact: true }).click();
    await page.getByPlaceholder(/item description/i).fill('E2E don bi tu choi');
    await page.getByPlaceholder(/item price in eth/i).fill('0.05');
    await page.getByRole('button', { name: /deploy & send deposit/i }).click();

    // KHONG cho cung 5s o day: thong bao tu an sau 5s nen se bi lo mat.
    // Playwright tu cho trong cac expect ben duoi.

    // App phai bao cho user biet, khong im lang
    await expect(page.getByText(/you rejected the transaction/i)).toBeVisible();

    // Khong duoc tao escrow nao
    expect(Number(await totalEscrows())).toBe(Number(countBefore));

    // Va KHONG duoc treo: nut phai bam lai duoc ngay, khong phai tai lai trang
    await expect(page.getByRole('button', { name: /deploy & send deposit/i })).toBeEnabled();
  });
});
