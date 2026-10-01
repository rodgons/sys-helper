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

  await expect(chat.getByText('Accepted')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Proposal' })).toHaveCount(0);
  await expect(node(page, 'Fake API')).not.toContainText('new');

  await page.reload();
  await expect(node(page, 'Fake API')).toBeVisible();
  await expect(node(page, 'Fake Cache')).toContainText('Redis');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(chat.getByText('Accepted')).toBeVisible();
});

test('rejecting a proposal leaves the canvas as it was', async ({ page, signIn }) => {
  await signIn();
  await askForProposal(page, 'Reject me');

  await page
    .getByRole('list', { name: 'Messages' })
    .getByRole('button', { name: 'Reject' })
    .click();

  await expect(page.getByRole('list', { name: 'Messages' }).getByText('Rejected')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Messages' }).getByText('Rejected')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
});
