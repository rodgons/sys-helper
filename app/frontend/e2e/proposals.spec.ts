import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function askForProposal(page: Page, name: string) {
  await page.goto('/projects');
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByLabel('Message', { exact: true }).fill('Please propose an architecture');
  await page.getByLabel('Message', { exact: true }).press('Enter');
  await expect(page.getByText('Proposal #1', { exact: true })).toBeVisible();
}

const node = (page: Page, name: string) =>
  page.locator('.react-flow__node').filter({ hasText: name });

test('accepting a proposal applies it to the canvas and keeps it', async ({ page, signIn }) => {
  await signIn();
  await askForProposal(page, 'Accept me');

  // The preview shows the new components as "new" before anything is saved.
  await expect(node(page, 'Fake API')).toContainText('new');
  await expect(node(page, 'Fake Cache')).toBeVisible();
  const chat = page.getByRole('list', { name: 'Messages' });
  await expect(chat).toContainText('Add Service “Fake API” (runtime: Go)');
  await expect(chat).toContainText('Connect Fake API → Fake Cache (sync, reads)');

  await page
    .getByRole('region', { name: 'Proposal' })
    .getByRole('button', { name: 'Accept' })
    .click();

  await expect(chat.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Proposal' })).toHaveCount(0);
  // The AI follows up on the review without the User writing anything.
  await expect(chat).toContainText('You said: [I accepted proposal #1');
  await expect(node(page, 'Fake API')).not.toContainText('new');

  await page.reload();
  await expect(node(page, 'Fake API')).toBeVisible();
  await expect(node(page, 'Fake Cache')).toContainText('Redis');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(chat.getByText('Accepted', { exact: true })).toBeVisible();
});

test('rejecting a proposal leaves the canvas as it was', async ({ page, signIn }) => {
  await signIn();
  await askForProposal(page, 'Reject me');

  await page
    .getByRole('list', { name: 'Messages' })
    .getByRole('button', { name: 'Reject' })
    .click();

  await expect(
    page.getByRole('list', { name: 'Messages' }).getByText('Rejected', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText(
    'You said: [I rejected proposal #1',
  );
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Messages' }).getByText('Rejected', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
});

test('undoing and redoing an accept takes its Decision with it', async ({ page, signIn }) => {
  await signIn();
  await askForProposal(page, 'Undo me');
  const decision = page.getByRole('article', { name: 'D1 Cache reads in Redis' });
  const saved = page.getByText('All changes saved');
  await page
    .getByRole('region', { name: 'Proposal' })
    .getByRole('button', { name: 'Accept' })
    .click();
  await expect(node(page, 'Fake Cache')).toBeVisible();
  await page.getByRole('tab', { name: /Decisions/ }).click();
  await expect(decision).toBeVisible();

  await page.getByRole('button', { name: 'Undo Accept Proposal #1' }).click();
  await expect(node(page, 'Fake Cache')).toHaveCount(0, { timeout: 3000 });
  await expect(saved).toBeVisible();
  await expect(decision).toHaveCount(0);

  await page.getByRole('button', { name: 'Redo Accept Proposal #1' }).click();
  await expect(node(page, 'Fake Cache')).toBeVisible();
  await expect(saved).toBeVisible();
  await expect(decision).toBeVisible();

  // A Connection kind change is a step of its own.
  // Its label covers the middle of the path, where Playwright would click.
  await page.locator('.react-flow__edge').dispatchEvent('click');
  await page.getByLabel('Kind').selectOption('async');
  const labels = page.locator('.react-flow__edgelabel-renderer');
  await expect(labels).toContainText('async');
  await page.getByRole('button', { name: 'Undo Edit connection' }).click();
  await expect(labels).toContainText('reads');
  await expect(labels).not.toContainText('async');
  await expect(saved).toBeVisible();

  // A drag is one step, back to where the drag began.
  const cache = node(page, 'Fake Cache');
  const start = await cache.boundingBox();
  if (!start) throw new Error('Fake Cache has no box');
  await page.mouse.move(start.x + 20, start.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(start.x + 20 + i * 30, start.y + 10 + i * 20);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Undo Move Fake Cache' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo Move Fake Cache' }).click();
  await expect.poll(async () => (await cache.boundingBox())?.x).toBeCloseTo(start.x, 0);
  await expect(page.getByRole('button', { name: 'Undo Accept Proposal #1' })).toBeEnabled();
  await expect(saved).toBeVisible();

  await page.reload();
  await expect(node(page, 'Fake Cache')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: /Decisions/ }).click();
  await expect(decision).toBeVisible();
});
