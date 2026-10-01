import { expect, test } from './fixtures';

test('a new project opens with the welcome message and keeps what the user says', async ({
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

  await page.reload();
  await expect(messages.getByRole('listitem')).toHaveCount(2);
  await expect(messages.getByRole('listitem').last()).toContainText('You');
});
