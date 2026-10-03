import { expect, test } from './fixtures';

test('a new project opens with the welcome message, and the AI answers what the user says', async ({
  page,
  signIn,
}) => {
  await signIn();
  await page.goto('/projects');
  await page.getByLabel('Project name').fill('Shortener');
  await page.getByRole('button', { name: 'Create project' }).click();

  const messages = page.getByRole('list', { name: 'Messages' });
  await expect(messages).toContainText("I'm your AI architect");
  await expect(messages).toContainText('What are you building, and who is it for?');

  await page.getByLabel('Message', { exact: true }).fill('A URL shortener for a marketing team');
  await page.getByLabel('Message', { exact: true }).press('Enter');
  await expect(messages.getByRole('listitem').last()).toContainText(
    'A URL shortener for a marketing team',
  );

  await expect(messages.getByRole('listitem').last()).toContainText(
    'This is a fake AI reply (AI_FAKE=1). You said: A URL shortener for a marketing team',
  );

  await page.reload();
  await expect(messages.getByRole('listitem')).toHaveCount(3);
  await expect(messages.getByRole('listitem').nth(1)).toContainText('You');
  await expect(messages.getByRole('listitem').last()).toContainText('fake AI reply');
});

test('a new conversation replaces the messages with the welcome message, and stays that way', async ({
  page,
  signIn,
}) => {
  await signIn();
  await page.goto('/projects');
  await page.getByLabel('Project name').fill('Fresh start');
  await page.getByRole('button', { name: 'Create project' }).click();
  const messages = page.getByRole('list', { name: 'Messages' });
  await page.getByLabel('Message', { exact: true }).fill('A URL shortener');
  await page.getByLabel('Message', { exact: true }).press('Enter');
  await expect(messages.getByRole('listitem').last()).toContainText('You said: A URL shortener');

  await page.getByRole('button', { name: 'New conversation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a new conversation?' });
  await expect(dialog).toContainText('The current messages will be deleted.');
  await dialog.getByRole('button', { name: 'Start new conversation' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(messages.getByRole('listitem')).toHaveCount(1);
  await expect(messages).toContainText('What are you building, and who is it for?');
  await expect(page.getByRole('button', { name: 'New conversation' })).toBeDisabled();

  await page.reload();
  await expect(messages.getByRole('listitem')).toHaveCount(1);
  await expect(messages).toContainText('What are you building, and who is it for?');
  await expect(messages).not.toContainText('A URL shortener');
});

test('a new conversation discards the pending proposal and its preview', async ({
  page,
  signIn,
}) => {
  await signIn();
  await page.goto('/projects');
  await page.getByLabel('Project name').fill('Discard me');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByLabel('Message', { exact: true }).fill('Please propose an architecture');
  await page.getByLabel('Message', { exact: true }).press('Enter');
  await expect(page.getByText('Proposal #1', { exact: true })).toBeVisible();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Fake API' })).toBeVisible();

  await page.getByRole('button', { name: 'New conversation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a new conversation?' });
  await expect(dialog).toContainText('The pending proposal will be discarded.');
  await dialog.getByRole('button', { name: 'Start new conversation' }).click();

  await expect(page.getByRole('region', { name: 'Proposal' })).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.getByText('Proposal #1', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Messages' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
});
