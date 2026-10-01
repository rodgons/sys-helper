import { expect, test } from '@playwright/test';

test('frontend reaches the API and the API reaches the database', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('status')).toHaveText('API: ok · database: up');
});

test('UI kit page renders the component reference', async ({ page }) => {
  await page.goto('/ui-kit');

  await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Buttons' })).toBeVisible();
});
