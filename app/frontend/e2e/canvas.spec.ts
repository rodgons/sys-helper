import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function newProject(page: Page, name: string) {
  await page.goto('/projects');
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

const node = (page: Page, name: string) =>
  page.locator('.react-flow__node').filter({ hasText: name });

test('build an architecture by hand and find it again after a reload', async ({ page, signIn }) => {
  await signIn();
  await newProject(page, 'Shop');

  await page.getByRole('button', { name: 'Add Service', exact: true }).click();
  await page.getByLabel('Name').fill('Orders API');
  await page.getByRole('button', { name: 'Add Database', exact: true }).click();
  await page.getByLabel('Engine').fill('PostgreSQL');

  // Drag from the service's right handle to the database's left handle.
  await node(page, 'Orders API')
    .locator('.react-flow__handle-right')
    .dragTo(node(page, 'Database').locator('.react-flow__handle-left'));
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  // The connection's window opens where it was clicked, not in a corner.
  const edge = await page.locator('.react-flow__edge').boundingBox();
  if (!edge) throw new Error('the connection is not drawn');
  const click = { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 };
  await page.mouse.click(click.x, click.y);
  await expect(page.getByLabel('Kind')).toBeVisible();
  const inspector = await page.getByRole('region', { name: 'Inspector' }).boundingBox();
  expect(Math.abs((inspector?.x ?? 0) - click.x)).toBeLessThan(40);
  expect(Math.abs((inspector?.y ?? 0) - click.y)).toBeLessThan(40);

  await page.getByLabel('Kind').selectOption('async');
  await page.getByLabel('Label').fill('order events');

  await expect(page.getByRole('status')).toHaveText('All changes saved', { timeout: 5000 });
  await page.screenshot({ path: test.info().outputPath('canvas.png') });

  await page.reload();

  await expect(node(page, 'Orders API')).toBeVisible();
  await expect(node(page, 'Database')).toContainText('PostgreSQL');
  await expect(page.getByText('async · order events')).toBeVisible();
});

test('a stale tab stops saving instead of overwriting newer work', async ({
  page,
  signIn,
  context,
}) => {
  await signIn();
  await newProject(page, 'Two tabs');
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByRole('toolbar', { name: 'Add component' })).toBeVisible();

  await page.getByRole('button', { name: 'Add Cache', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('All changes saved', { timeout: 5000 });

  await other.getByRole('button', { name: 'Add Queue / Stream', exact: true }).click();

  await expect(other.getByRole('alert')).toContainText('changed in another tab', { timeout: 5000 });
  await page.reload();
  await expect(node(page, 'Cache')).toBeVisible();
  await expect(node(page, 'Queue / Stream')).toHaveCount(0);
});
