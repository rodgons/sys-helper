import { expect, test } from './fixtures';
import { apiUrl, closedApiUrl } from './servers';

test('visitors see the home page and both sign-in options', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('architecture');
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});

test('signed-in users land on their projects and can sign out', async ({ page, signIn }) => {
  const { name } = await signIn();

  await page.goto('/');

  await expect(page).toHaveURL('/projects');
  await expect(page.getByText(`Signed in as ${name}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
});

test('a Google-only user can sign in and create a project', async ({ page, signIn }) => {
  const { name } = await signIn({ provider: 'google' });

  await page.goto('/projects');

  await expect(page.getByText(`Signed in as ${name}`)).toBeVisible();
  await page.getByLabel('Project name').fill('Photo Sharing');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photo Sharing' })).toBeVisible();
});

test.describe('off the allowlist', () => {
  test.beforeEach(async ({ page }) => {
    // Send this page's API calls to the API that admits nobody.
    await page.route(`${apiUrl}/**`, (route) =>
      route.continue({ url: route.request().url().replace(apiUrl, closedApiUrl) }),
    );
  });

  test('a GitHub user is asked for their username', async ({ page, signIn }) => {
    const { name } = await signIn();

    await page.goto('/projects');

    await expect(
      page.getByRole('heading', { name: "You're not on the beta list yet" }),
    ).toBeVisible();
    await expect(page.getByText('Ask for access with your GitHub username.')).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  });

  test('a Google user sees their Google id to send', async ({ page, signIn }) => {
    const { id } = await signIn({ provider: 'google' });

    await page.goto('/projects');

    await expect(
      page.getByRole('heading', { name: "You're not on the beta list yet" }),
    ).toBeVisible();
    await expect(page.getByText('Ask for access with your Google id.')).toBeVisible();
    await expect(page.getByText(id, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy Google id' })).toBeVisible();
  });
});
