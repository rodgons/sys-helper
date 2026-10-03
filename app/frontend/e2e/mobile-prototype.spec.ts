// PROTOTYPE: throwaway. Screenshots of the compact workspace variants at phone size.
import { expect, test } from './fixtures';

const out = '/private/tmp/claude-501/proto-shots';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('capture compact variants', async ({ page, signIn }) => {
  test.setTimeout(120_000);
  await signIn();
  await page.goto('/projects');
  await page.getByLabel('Project name').fill('Mobile proto');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/p\//);
  const base = page.url();
  await page.screenshot({ path: `${out}/A-0-empty.png` });
  await page.getByLabel('Message', { exact: true }).fill('Please propose an architecture');
  await page.getByLabel('Message', { exact: true }).press('Enter');
  await expect(page.getByText('Proposal #1', { exact: true }).first()).toBeAttached();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/A-1-half-proposal.png` });
  await page.getByTitle('Drag, or tap to hide/show').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/A-2-peek.png` });

  await page.goto(`${base}?variant=B`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/B-1-open.png` });
  await page.getByRole('button', { name: 'Hide panel' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/B-2-hidden.png` });

  await page.goto(`${base}?variant=C`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/C-1-chat.png` });
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: /Canvas/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/C-2-canvas.png` });
});
