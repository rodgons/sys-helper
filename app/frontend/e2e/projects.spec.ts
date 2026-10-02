import { expect, test } from './fixtures';

test('create, rename, revisit by old slug, and delete a project', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/projects');

  await page.getByLabel('Project name').fill('URL Shortener');
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page).toHaveURL(/\/p\/url-shortener-[a-z0-9]{10}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'URL Shortener' })).toBeVisible();
  const suffix = page.url().slice(-10);

  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Project name').fill('Link Service');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(`/p/link-service-${suffix}`);
  await expect(page.getByRole('navigation', { name: 'Projects' })).toContainText('Link Service');

  // The suffix alone identifies the project: an outdated name redirects to the canonical slug.
  await page.goto(`/p/url-shortener-${suffix}`);
  await expect(page).toHaveURL(`/p/link-service-${suffix}`);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click();

  await expect(page).toHaveURL('/projects');
  await expect(page.getByText('“Link Service” was deleted.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
});

test("another user's project is not found", async ({ browser, page, signIn }) => {
  await signIn();
  await page.goto('/projects');
  await page.getByLabel('Project name').fill('Private');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/p\/private-[a-z0-9]{10}$/);
  const path = new URL(page.url()).pathname;

  const otherContext = await browser.newContext();
  const intruder = await otherContext.newPage();
  await signIn({ page: intruder });
  await intruder.goto(path);

  await expect(intruder.getByRole('heading', { name: 'Project not found' })).toBeVisible();
  await otherContext.close();
});
