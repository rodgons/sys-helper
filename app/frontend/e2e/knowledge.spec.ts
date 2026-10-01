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

test('an accepted proposal brings its requirement, decision and experience level', async ({
  page,
  signIn,
}) => {
  await signIn();
  await newProject(page, 'Knowledge from AI');
  await page.getByLabel('Message', { exact: true }).fill('Please propose an architecture');
  await page.getByLabel('Message', { exact: true }).press('Enter');
  const chat = page.getByRole('list', { name: 'Messages' });
  await expect(chat).toContainText(
    'Note requirement (Performance): Reads outnumber writes 100 to 1',
  );
  await expect(chat).toContainText(
    'Record decision “Cache reads in Redis” on Fake Cache, Fake API → Fake Cache',
  );

  await page
    .getByRole('region', { name: 'Proposal' })
    .getByRole('button', { name: 'Accept' })
    .click();
  await expect(chat.getByText('Accepted', { exact: true })).toBeVisible();

  await expect(node(page, 'Fake Cache')).toContainText('1 decision');
  await page.getByRole('tab', { name: /Requirements/ }).click();
  await expect(page.getByLabel('Your experience')).toHaveValue('beginner');
  await expect(page.getByRole('region', { name: 'Performance' })).toContainText('R1');
  await page.getByRole('tab', { name: /Decisions/ }).click();
  const decision = page.getByRole('article', { name: 'D1 Cache reads in Redis' });
  await expect(decision).toContainText('Cache-aside');
  await expect(decision).toContainText('Fake Cache, Fake API → Fake Cache');
  await expect(decision).toContainText('R1 (Performance) Reads outnumber writes 100 to 1');
});

test('changing a requirement flags the decisions citing it until confirmed', async ({
  page,
  signIn,
}) => {
  await signIn();
  await newProject(page, 'Knowledge by hand');

  await page.getByRole('tab', { name: /Requirements/ }).click();
  const add = page.getByRole('form', { name: 'Add requirement' });
  await add.getByLabel('Category').selectOption('scale');
  await add.getByLabel('Requirement').fill('10k orders per minute');
  await add.getByRole('button', { name: 'Add requirement' }).click();
  await expect(page.getByRole('region', { name: 'Scale' })).toContainText('R1');

  await page.getByRole('button', { name: 'Add Database', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Inspector' });
  await inspector.getByRole('button', { name: '+ Add decision' }).click();
  await inspector.getByLabel('Decision', { exact: true }).fill('Postgres for orders');
  await inspector.getByLabel('Why').fill('Orders need transactions.');
  await inspector.getByLabel(/R1/).check();
  await inspector.getByRole('button', { name: 'Add decision' }).click();
  await expect(node(page, 'Database')).toContainText('1 decision');

  await page.getByRole('button', { name: 'Edit R1' }).click();
  await page.getByLabel('Edit R1').fill('50k orders per minute');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(node(page, 'Database')).toContainText('needs review');
  await page.getByRole('tab', { name: /Decisions/ }).click();
  await page
    .getByRole('tabpanel', { name: /Decisions/ })
    .getByRole('button', { name: 'Still valid' })
    .click();
  await expect(node(page, 'Database')).not.toContainText('needs review');

  // Deleting the component deletes the decision that only explained it.
  await node(page, 'Database').click();
  await inspector.getByRole('button', { name: 'Delete component' }).click();
  await expect(page.getByRole('tabpanel', { name: /Decisions/ })).toContainText(
    'No decisions yet',
    { timeout: 5000 },
  );
});

test('a default experience level from settings applies to projects without their own', async ({
  page,
  signIn,
}) => {
  await signIn();
  await newProject(page, 'Default level');

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Default experience level').selectOption('expert');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('tab', { name: /Requirements/ }).click();
  await expect(page.getByLabel('Your experience')).toHaveValue('expert');
});
