import { test, expect } from '@playwright/test';
const projects = [
  { id: 'kitchen-plan', name: 'Kitchen plan', roomType: 'kitchen', cabinets: 8, latestRevision: 3, updatedAt: '2026-11-17T10:00:00Z' },
  { id: 'laundry-plan', name: 'Laundry plan', roomType: 'laundry', cabinets: 2, latestRevision: 5, updatedAt: '2026-11-17T11:00:00Z' },
];
async function signedIn(page, current = 'kitchen-plan') {
  await page.addInitScript((id) => {
    localStorage.setItem('rta.demoAccount', 'u_home');
    localStorage.setItem('rta.project.u_home', id);
  }, current);
}
async function details(page) {
  await page.getByLabel('Project ZIP code').fill('10001');
  await page.getByLabel('When do you want to start?').selectOption({ label: 'Just exploring' });
  await page.getByLabel('Cabinet budget').selectOption({ label: 'Not sure yet' });
}
test('choose a different saved design and submit its room and reference for human review', async ({ page }) => {
  await signedIn(page);
  await page.route('**/api/me/projects', (route) => route.fulfill({ json: { projects } }));
  let submitted;
  await page.route('**/api/design-requests', async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { ...submitted, id: 'review-test', state: 'submitted', revisionNumber: 5 } });
  });
  await page.goto('/#/design-service');
  await expect(page.getByLabel('Saved design to attach')).toHaveValue('kitchen-plan');
  await page.getByLabel('Saved design to attach').selectOption('laundry-plan');
  await expect(page.getByText('Laundry plan: laundry · 2 cabinets · revision 5')).toBeVisible();
  await expect(page.getByLabel('Room', { exact: true })).toHaveValue('laundry');
  await expect(page.getByLabel('Room', { exact: true })).toBeDisabled();
  await details(page);
  expect(submitted).toBeUndefined();
  await page.getByRole('button', { name: 'Send design request' }).click();
  await expect(page.getByText(/Attached design: laundry-plan, revision 5/)).toBeVisible();
  expect(submitted.projectId).toBe('laundry-plan');
  expect(submitted.roomType).toBe('laundry');
});
test('stale local pointer is not submitted and customer can explicitly detach a design', async ({ page }) => {
  await signedIn(page, 'deleted-project');
  await page.route('**/api/me/projects', (route) => route.fulfill({ json: { projects } }));
  let submitted;
  await page.route('**/api/design-requests', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { ...submitted, id: 'review-test', state: 'submitted' } });
  });
  await page.goto('/#/design-service');
  await expect(page.getByLabel('Saved design to attach')).toHaveValue('');
  await page.getByLabel('Saved design to attach').selectOption('kitchen-plan');
  await page.getByLabel('Saved design to attach').selectOption('');
  await expect(page.getByLabel('Room', { exact: true })).toBeEnabled();
  await details(page);
  await page.getByRole('button', { name: 'Send design request' }).click();
  await expect(page.getByText('Request review-test received')).toBeVisible();
  expect(submitted).not.toHaveProperty('projectId');
});
test('failed saved-design lookup can be retried without losing entered details', async ({ page }) => {
  await signedIn(page);
  let attempts = 0;
  await page.route('**/api/me/projects', (route) => ++attempts === 1
    ? route.fulfill({ status: 503, json: { error: { message: 'Try again later' } } })
    : route.fulfill({ json: { projects: [] } }));
  await page.goto('/#/design-service');
  await expect(page.getByText('Could not load saved designs')).toBeVisible();
  await details(page);
  await page.getByRole('button', { name: 'Retry saved designs' }).click();
  await expect(page.getByText(/No saved designs yet/)).toBeVisible();
  await expect(page.getByLabel('Project ZIP code')).toHaveValue('10001');
});
