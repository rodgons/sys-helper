import { expect, test } from './fixtures';

test('visitors see the home page and a GitHub sign-in', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('architecture');
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
});

test('signed-in users land on their projects and can sign out', async ({ page, signIn }) => {
  const username = await signIn();

  await page.goto('/');

  await expect(page).toHaveURL('/projects');
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
});
