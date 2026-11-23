import { test, expect } from '@playwright/test';

async function fitsPhone(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test('phone menu can be closed, reopened, navigated, and revisited', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your dream kitchen.');
  await fitsPhone(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Close menu' }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Shop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shop materials' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await fitsPhone(page);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your dream kitchen.');
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Shop materials' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('product details close and reopen without trapping the phone screen', async ({ page }) => {
  await page.goto('/#/shop');
  const details = page.getByRole('button', { name: /^View details for/ }).first();
  await details.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await fitsPhone(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await details.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('planner and interrupted account forms remain usable at phone width', async ({ page }) => {
  await page.goto('/#/design');
  await expect(page.getByRole('heading', { name: 'Design planner' })).toBeVisible();
  await fitsPhone(page);
  await page.goto('/#/signin');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Mobile test');
  await page.getByRole('tab', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Create account' }).click();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Mobile test');
  await fitsPhone(page);
});


test('reference storefront fits both viewports and links to the real planner', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your dream kitchen.');
  await expect(page.getByText('Preview experience.', { exact: false })).toBeVisible();
  await fitsPhone(page);
  await page.screenshot({ path: testInfo.outputPath('homepage-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fitsPhone(page);
  await page.screenshot({ path: testInfo.outputPath('homepage-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: 'Open the kitchen planner' }).click();
  await expect(page.getByRole('heading', { name: 'Design planner' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your dream kitchen.');
});

test('guest builds a measured kitchen and reaches itemized estimate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Open the kitchen planner' }).click();
  await page.getByRole('button', { name: 'Continue to layout' }).click();
  await expect(page.locator('#rf-width')).toBeFocused();
  await page.getByRole('button', { name: 'Use example kitchen dimensions' }).click();
  await expect(page.locator('#rf-source')).toHaveValue('unverified');
  await page.getByRole('button', { name: 'Continue to layout' }).click();
  await expect(page.getByRole('heading', { name: 'Measured 2D plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Add cabinet', exact: true }).click();
  const plan = page.getByRole('group', { name: 'Room plan, top-down view' });
  await expect(plan.getByRole('button', { name: /wide × .*deep.*selected/ })).toBeVisible();
  await expect(page.locator('.plan-measurement')).toContainText(/ W × .* D × .* H/);
  await fitsPhone(page);
  await page.getByRole('button', { name: 'Continue to estimate' }).click();
  await expect(page.getByRole('heading', { name: 'Step 3: Itemized estimate' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Itemized design estimate' })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare salesperson review' }).click();
  await expect(page.getByRole('heading', { name: 'Salesperson review' })).toBeVisible();
  await expect(page.getByText('Review only, not an order')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send design request' })).toHaveCount(0);
});

test('neutral storefront banner follows shopping routes and opens the measuring guide', async ({ page }) => {
  const banner = page.getByRole('complementary', { name: 'Project planning' });
  for (const route of ['/', '/#/shop', '/#/design', '/#/collections', '/#/cart']) {
    await page.goto(route);
    await expect(banner).toContainText('Measure first. Build with confidence.');
    await expect(banner).not.toContainText(/discount|coupon|% off/i);
    await fitsPhone(page);
  }
  const next = banner.getByRole('button', { name: 'Next banner' });
  const previous = banner.getByRole('button', { name: 'Previous banner' });
  await next.focus();
  await next.press('Enter');
  await expect(next).toBeFocused();
  await expect(banner.getByRole('link', { name: 'Explore cabinet collections' })).toBeVisible();
  await expect(banner.getByRole('status')).toContainText('2 of 3');
  await next.click();
  await expect(banner.getByRole('link', { name: 'Explore design help' })).toBeVisible();
  await expect(banner.getByRole('status')).toContainText('3 of 3');
  await fitsPhone(page);
  await next.click();
  await expect(banner.getByRole('status')).toContainText('1 of 3');
  await previous.click();
  await expect(banner.getByRole('status')).toContainText('3 of 3');
  await next.click();
  await banner.getByRole('link', { name: 'Open measuring guide' }).click();
  await expect(page).toHaveURL(/#\/measure$/);
  await expect(banner).toBeVisible();
  await page.goto('/#/account');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(banner).toHaveCount(0);
});


test('measurement worksheet keeps entered fractions in the printed handoff', async ({ page }) => {
  await page.goto('/#/measure');
  const wall = page.getByRole('group', { name: 'Wall 1', exact: true });
  await wall.getByRole('textbox', { name: 'Width or length (inches)' }).fill('144 3/8');
  const windowMeasurements = page.getByRole('group', { name: 'Window', exact: true });
  await windowMeasurements.getByRole('textbox', { name: 'Above floor (inches)' }).fill('33 1/2');
  await fitsPhone(page);
  await page.emulateMedia({ media: 'print' });
  const printed = page.getByRole('table', { name: 'Customer notes in inches; not verified dimensions.' });
  await expect(printed.getByRole('row', { name: /Wall 1/ })).toContainText('144 3/8');
  await expect(printed.getByRole('row', { name: /Window/ })).toContainText('33 1/2');
  await expect(wall).not.toBeVisible();
});
