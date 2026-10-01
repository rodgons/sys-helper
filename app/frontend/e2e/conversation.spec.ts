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
