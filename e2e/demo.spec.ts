import { expect, test } from '@playwright/test';

test('demo navigation and invalid link recovery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByLabel('Demo notice')).toBeVisible();
  for (const [path, title] of [['collections', /Door styles/], ['quick-order', /Quick order by SKU/], ['cart', /^Cart$/]]) {
    await page.goto('/#/' + path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  }
  await page.goto('/#/%E0%A4%A');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to the home page' }).click();
  await expect(page.getByLabel('Demo notice')).toBeVisible();
  expect(errors).toEqual([]);
});

test('sample quick order reaches cart and survives reload', async ({ page }) => {
  await page.goto('/#/quick-order');
  await page.getByLabel('SKU and quantity, one per line').fill('B36 2');
  await page.getByRole('button', { name: 'Add 1 item to cart', exact: true }).click();
  await page.getByRole('link', { name: 'Go to cart', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cart', exact: true })).toBeVisible();
  await expect(page.getByText('B36', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('B36', { exact: true }).first()).toBeVisible();
});

test('room planner supports edit, cancel and saved reload', async ({ page }) => {
  await page.goto('/#/design');
  await page.locator('#rf-width').fill('144');
  await page.locator('#rf-depth').fill('144');
  await page.getByRole('button', { name: 'Continue to layout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add a cabinet', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add cabinet', exact: true }).click();
  await page.getByRole('button', { name: 'Edit room', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add a cabinet', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to estimate', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Step 3: Itemized estimate', exact: true })).toBeVisible();
  await expect(page.getByText(/Saved /).first()).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Design planner', exact: true })).toBeVisible();
});

test('clearing a quick order discards its delayed price response', async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const intercepted = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/quotes', async route => {
    const response = await route.fetch();
    started();
    await pending;
    await route.fulfill({ response });
  });
  await page.goto('/#/quick-order');
  await page.getByLabel('SKU and quantity, one per line').fill('B36 2');
  await intercepted;
  await page.getByLabel('SKU and quantity, one per line').fill('');
  release();
  await expect(page.getByRole('heading', { name: 'Check (0 ready)', exact: true })).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByRole('heading', { name: 'Price', exact: true })).toHaveCount(0);
});
