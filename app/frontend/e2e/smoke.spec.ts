import { expect, test } from './fixtures';
import { apiUrl } from './servers';

test('the API is up and reaches the database', async ({ request }) => {
  const res = await request.get(`${apiUrl}/ready`);

  expect(await res.json()).toEqual({ status: 'ok', database: 'up' });
});

test('UI kit page renders the component reference', async ({ page }) => {
  await page.goto('/ui-kit');

  await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Buttons' })).toBeVisible();
});
