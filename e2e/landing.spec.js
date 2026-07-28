import { test, expect } from '@playwright/test';

// Landing chi hien khi CHUA ket noi vi, nen khong test nao khac cham toi no:
// moi test kia deu tiem vi gia truoc. Vi vay mot loi lam sap ca trang van di
// qua duoc build xanh va 16 test xanh - dung nhu lan tham chieu icon khong co
// trong bang tra, tra ve undefined va React nem "Element type is invalid".
//
// Cac test duoi day co tinh KHONG tiem vi.

/** Gom loi console va loi runtime cua trang. */
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test.describe('Landing khi chua ket noi vi', () => {
  test('trang tai duoc, khong co loi runtime', async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto('/');
    await page.waitForTimeout(2_500);

    // Loi kieu component undefined se lam ca trang sap va hien man hinh nay
    await expect(page.getByText(/this page could.?n.?t load/i)).toHaveCount(0);

    const fatal = errors.filter((e) => /Element type is invalid|is not defined|Cannot read/i.test(e));
    expect(fatal, `Loi runtime tren landing:\n${fatal.join('\n')}`).toEqual([]);
  });

  test('day du cac muc gioi thieu', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2_000);

    const labels = page.locator('.landing-section-label');
    await expect(labels).toHaveCount(4);

    for (const name of ['About', 'Why EscrowMAD', 'How to Use', 'When Both Sides Dig In']) {
      await expect(page.locator('.landing-section-label', { hasText: name })).toHaveCount(1);
    }
  });

  test('khoi gioi thieu agent hien day du va cuon toi thi sang len', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2_000);

    const label = page.locator('.landing-section-label', { hasText: 'When Both Sides Dig In' });

    // Truoc khi cuon toi thi con mo
    expect(await label.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

    await label.scrollIntoViewIfNeeded();
    await expect
      .poll(async () => label.evaluate((el) => getComputedStyle(el).opacity), { timeout: 10_000 })
      .toBe('1');

    await expect(page.locator('.agent-step')).toHaveCount(4);
    await expect(page.locator('.agent-guard-list li')).toHaveCount(4);
  });

  test('moi icon trong luoi tinh nang deu ve duoc, khong co o trong', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2_000);

    await page.locator('.landing-section-label', { hasText: 'Why EscrowMAD' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_200);

    // Icon tra tu bang WHY_ICONS. Thieu ten nao thi cho do rong chu khong bao loi.
    const cards = page.locator('.why-card, .why-item');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    const withoutSvg = await cards.evaluateAll((els) => els.filter((e) => !e.querySelector('svg')).length);
    expect(withoutSvg, 'Co the tinh nang khong ve duoc icon').toBe(0);
  });

  test('cac buoc huong dan nam tren mot hang tren man hinh rong', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 950 });
    await page.goto('/');
    await page.waitForTimeout(2_000);

    await page.locator('.landing-section-label', { hasText: 'How to Use' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_200);

    // Them buoc ma quen noi rong luoi thi buoc cuoi rot xuong hang rieng
    const tops = await page.locator('.tl-step').evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().top)),
    );
    expect(tops.length).toBeGreaterThan(0);
    expect(new Set(tops).size, 'Cac buoc bi vo thanh nhieu hang').toBe(1);
  });
});
