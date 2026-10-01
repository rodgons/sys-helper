import { expect, test } from '@playwright/test';

test('frontend reaches the API and the API reaches the database', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('status')).toHaveText('API: ok · database: up');
});
