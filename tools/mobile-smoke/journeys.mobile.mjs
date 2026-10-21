import { test, expect } from '@playwright/test';

async function fitsPhone(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test('phone menu can be closed, reopened, navigated, and revisited', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Plan, price and order');
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
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Plan, price and order');
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
