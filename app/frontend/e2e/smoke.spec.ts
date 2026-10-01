import { expect, test } from './fixtures';

test('the API is up and reaches the database', async ({ request }) => {
  const res = await request.get('http://localhost:8080/ready');

  expect(await res.json()).toEqual({ status: 'ok', database: 'up' });
});

test('UI kit page renders the component reference', async ({ page }) => {
  await page.goto('/ui-kit');

  await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Buttons' })).toBeVisible();
});
