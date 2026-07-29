import { test, expect } from '@playwright/test';
import { installMockWallet, connectWallet, ACCOUNTS } from './helpers/mockWallet.js';
import { createEscrow, makeActiveEscrow } from './helpers/chain.js';

// Popup danh gia mo tu the Participants tren trang hop dong.
//
// LUU Y ve quyen xem: khi ca hai ben da tham gia, app chan nguoi ngoai voi man
// hinh "This contract is private". Nen tinh huong that cua tinh nang nay la luc
// hop dong CON CHO BUYER: nguoi mua tiem nang mo link duoc chia se, xem danh gia
// cua seller, roi moi quyet dinh bo tien vao. Dung sau do thi chi hai ben xem.
test.describe('Popup xem danh gia doi tac', () => {
  test('nguoi mua tiem nang xem duoc danh gia seller truoc khi bo tien vao', async ({ page }) => {
    const escrow = await createEscrow(); // con AWAITING BUYER

    // Vi la nguoi la, chua tham gia deal
    await installMockWallet(page, ACCOUNTS.outsider);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.outsider);

    const seller = page.locator('.party-link').first();
    await expect(seller).toBeVisible();
    await seller.click();

    await expect(page.locator('.modal-panel')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible();
  });

  test('dia chi chua ai danh gia thi noi ro, khong de trong', async ({ page }) => {
    const escrow = await createEscrow();
    await installMockWallet(page, ACCOUNTS.outsider);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.outsider);

    await page.locator('.party-link').first().click();

    // De trong thi nguoi dung tuong trang hong. Phai co chu giai thich.
    await expect(
      page.getByText(/nobody has rated this address yet|not readable yet|could not load/i),
    ).toBeVisible();
  });

  test('bam ra ngoai thi dong popup', async ({ page }) => {
    const escrow = await createEscrow();
    await installMockWallet(page, ACCOUNTS.outsider);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.outsider);

    await page.locator('.party-link').first().click();
    await expect(page.locator('.modal-panel')).toBeVisible();

    await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.modal-panel')).toHaveCount(0);
  });

  test('buyer chua tham gia thi o Buyer khong bam duoc', async ({ page }) => {
    const escrow = await createEscrow();
    await installMockWallet(page, ACCOUNTS.outsider);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.outsider);

    await expect(page.getByText('not joined yet')).toBeVisible();
    await expect(page.locator('.party-link')).toHaveCount(1); // chi con seller
  });

  test('deal da chay thi ca hai ben deu bam duoc', async ({ page }) => {
    const escrow = await makeActiveEscrow();

    // Phai la nguoi trong cuoc, vi nguoi ngoai bi chan o man hinh private.
    await installMockWallet(page, ACCOUNTS.buyer);
    await page.goto(`/?contract=${escrow}`);
    await connectWallet(page, ACCOUNTS.buyer);

    await expect(page.locator('.party-link')).toHaveCount(2);
    await expect(page.locator('.you-badge')).toHaveCount(1);
  });
});
