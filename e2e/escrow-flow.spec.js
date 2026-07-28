import { test, expect } from '@playwright/test';
import { installMockWallet, connectWallet, ACCOUNTS } from './helpers/mockWallet.js';
import { createEscrow, uploadItemImage, makeActiveEscrow, getState, getBalance } from './helpers/chain.js';
import { publicClient } from './helpers/chain.js';
import { ESCROW_ABI } from '../lib/escrowAbi.mjs';

const read = (escrow, fn) => publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: fn });

// Chon option dau tien co gia tri that trong mot the <select>
async function pickFirstOption(page, index) {
  const select = page.locator('select').nth(index);
  await expect
    .poll(async () => (await select.locator('option').count()), { timeout: 30_000 })
    .toBeGreaterThan(1);
  const value = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(value);
}

// Navbar co HAI nhanh JSX rieng: da ket noi thi kem logo, chua ket noi thi khong.
// Nhanh chua ket noi da duoc landing.spec.js phu, day la nhanh con lai.
test.describe('Navbar khi da ket noi vi', () => {
  test('van hien so phien ban tren ten dApp', async ({ page }) => {
    await installMockWallet(page, ACCOUNTS.seller);
    await page.goto('/');
    await connectWallet(page, ACCOUNTS.seller);

    const version = page.locator('.logo-version');
    await expect(version).toHaveText('v1.1.0');

    const v = await version.boundingBox();
    const name = await page.locator('.logo').boundingBox();
    expect(v.y + v.height, 'So phien ban khong nam tren ten dApp').toBeLessThanOrEqual(name.y + 1);
  });
});

test.describe('Buyer tham gia va tra tien', () => {
  test('buyer tra dung itemPrice + coc, escrow chuyen sang ACTIVE', async ({ page }) => {
    const escrow = await createEscrow({ itemPrice: '0.05', description: 'E2E may anh' });
    await uploadItemImage(escrow);

    const itemPrice = await read(escrow, 'itemPrice');
    const deposit = await read(escrow, 'deposit');
    const escrowBefore = await getBalance(escrow);
    const buyerBefore = await getBalance(ACCOUNTS.buyer);

    await installMockWallet(page, ACCOUNTS.buyer);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.buyer);

    await expect(page.locator('.state-badge')).toContainText('AWAITING BUYER');

    // Dia chi giao hang: 3 select lay tu API GHN, phai chon lan luot
    await pickFirstOption(page, 0); // Tinh/Thanh
    await pickFirstOption(page, 1); // Quan/Huyen
    await pickFirstOption(page, 2); // Phuong/Xa
    await page.getByPlaceholder(/street address/i).fill('72 Nguyen Trai');

    await page.getByRole('button', { name: /join & send payment/i }).click();

    await expect.poll(async () => Number(await getState(escrow)), { timeout: 60_000 }).toBe(1); // ACTIVE

    // Escrow phai giu du ca pool: itemPrice + 2 x deposit
    expect(await getBalance(escrow)).toBe(escrowBefore + itemPrice + deposit);

    // Tien phai roi khoi vi buyer, it nhat bang so da tra
    const spent = buyerBefore - (await getBalance(ACCOUNTS.buyer));
    expect(spent).toBeGreaterThanOrEqual(itemPrice + deposit);
  });
});

test.describe('Xac nhan nhan hang va giai ngan', () => {
  test('seller nhan itemPrice + coc, buyer duoc hoan coc', async ({ page }) => {
    const escrow = await makeActiveEscrow({ itemPrice: '0.05', description: 'E2E tai nghe' });

    const itemPrice = await read(escrow, 'itemPrice');
    const deposit = await read(escrow, 'deposit');
    const sellerBefore = await getBalance(ACCOUNTS.seller);

    await installMockWallet(page, ACCOUNTS.buyer);

    // Nut Confirm chi bat khi seller da danh dau da gui hang, va co do
    // duoc luu trong localStorage chu khong phai on-chain.
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, JSON.stringify({ at: Date.now() }));
    }, `escrowmad_shipped_${escrow}`);

    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.buyer);

    await expect(page.locator('.state-badge')).toContainText('ACTIVE');

    const confirm = page.getByRole('button', { name: /^confirm$/i });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect.poll(async () => Number(await getState(escrow)), { timeout: 60_000 }).toBe(4); // COMPLETED

    // Escrow phai rong, va seller nhan dung itemPrice + deposit
    expect(await getBalance(escrow)).toBe(0n);
    expect((await getBalance(ACCOUNTS.seller)) - sellerBefore).toBe(itemPrice + deposit);
  });

  test('nut Confirm bi khoa khi seller chua danh dau gui hang', async ({ page }) => {
    const escrow = await makeActiveEscrow({ itemPrice: '0.05', description: 'E2E chua gui' });

    await installMockWallet(page, ACCOUNTS.buyer);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.buyer);

    // "Awaiting shipment" xuat hien o ca nut Confirm lan Return, nen phai
    // gioi han trong dung nut Confirm.
    const confirm = page.getByRole('button', { name: /^confirm/i }).first();
    await expect(confirm).toBeDisabled();
    await expect(confirm).toContainText(/awaiting shipment/i);

    // Va tien van con nguyen trong escrow
    expect(Number(await getState(escrow))).toBe(1); // van ACTIVE
  });
});
