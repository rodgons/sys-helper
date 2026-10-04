import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// The compact layout end to end, on a phone: chat, review a Proposal from the banner, edit and add
// Components in the sheet, switch Projects through the drawer and sign out from the avatar.

const node = (page: Page, name: string) =>
  page.locator('.react-flow__node').filter({ hasText: name });

async function expectTapTarget(target: Locator) {
  const box = await target.boundingBox();
  expect(box, 'the target is on screen').not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
}

test('a phone chats, reviews, edits the canvas and switches Projects', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/projects');
  await page.getByLabel('Project name').fill('Phone other');
  await page.getByRole('button', { name: 'Create project' }).tap();
  const bar = page.getByRole('banner');
  const sheet = page.getByRole('complementary', { name: 'Project panel' });
  await expect(bar.getByRole('heading', { level: 1, name: 'Phone other' })).toBeVisible();

  // A second Project, from the drawer.
  await bar.getByRole('button', { name: 'Projects' }).tap();
  await page
    .getByRole('dialog', { name: 'Projects' })
    .getByRole('button', { name: 'New project' })
    .tap();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Project name').fill('Phone project');
  await create.getByRole('button', { name: 'Create project' }).tap();
  await expect(bar.getByRole('heading', { level: 1, name: 'Phone project' })).toBeVisible();

  // One bar, no site header, nothing scrolling sideways.
  await expect(bar.getByRole('button', { name: 'Projects' })).toBeVisible();
  await expect(bar.getByRole('link', { name: /helper/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const name of ['Projects', 'Project actions', 'Account']) {
    await expectTapTarget(bar.getByRole('button', { name }));
  }
  await expectTapTarget(page.getByRole('button', { name: 'Add' }));
  await expectTapTarget(page.getByRole('button', { name: 'Fit View' }));
  await expectTapTarget(page.getByRole('button', { name: 'Tidy up' }));
  await expect(page.getByRole('button', { name: 'Zoom In' })).toHaveCount(0);

  // Chat, then accept the Proposal from the one-line banner.
  const composer = sheet.getByLabel('Message', { exact: true });
  expect(await composer.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  await composer.fill('Please propose an architecture');
  await sheet.getByRole('button', { name: 'Send' }).tap();
  const banner = page.getByRole('region', { name: 'Proposal' });
  await expect(banner.getByText('Proposal #1')).toBeVisible();
  await banner.getByRole('button', { name: 'Accept' }).tap();
  await expect(banner).toHaveCount(0);
  await expect(sheet.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(node(page, 'Fake API')).not.toContainText('new');

  // One tap on a Component opens its Inspector in the sheet; rename it there.
  await node(page, 'Fake API').tap();
  const inspector = sheet.getByRole('region', { name: 'Inspector' });
  await expect(inspector.getByText('Service', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('tab', { name: 'Conversation' })).toBeVisible();
  await inspector.getByLabel('Name').fill('Edge API');
  await expect(node(page, 'Edge API')).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible();

  // One tap on a Connection opens its Inspector.
  await page.locator('.react-flow__edge-interaction').first().tap({ force: true });
  await expect(inspector.getByText('Connection', { exact: true })).toBeVisible();

  // A tab closes the Inspector; "+ Add" adds a Component and opens it, with no field focused.
  await sheet.getByRole('tab', { name: 'Conversation' }).tap();
  await expect(inspector).toHaveCount(0);
  await page.getByRole('button', { name: 'Add' }).tap();
  await page
    .getByRole('dialog', { name: 'Add component' })
    .getByRole('button', { name: 'Queue / Stream' })
    .tap();
  await expect(inspector.getByLabel('Name')).toHaveValue('Queue / Stream');
  await expect(inspector.getByLabel('Name')).not.toBeFocused();
  await expect(page.getByText('All changes saved')).toBeVisible();

  // The edits survive a reload.
  await page.reload();
  await expect(node(page, 'Edge API')).toBeVisible();
  await expect(node(page, 'Queue / Stream')).toBeVisible();

  // Switch Projects through the drawer.
  await bar.getByRole('button', { name: 'Projects' }).tap();
  const drawer = page.getByRole('dialog', { name: 'Projects' });
  await expect(drawer.getByRole('link', { name: 'Phone project' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await drawer.getByRole('link', { name: 'Phone other' }).tap();
  await expect(drawer).toHaveCount(0);
  await expect(bar.getByRole('heading', { level: 1, name: 'Phone other' })).toBeVisible();

  // Sign out from the avatar.
  await bar.getByRole('button', { name: 'Account' }).tap();
  await page.getByRole('menuitem', { name: 'Sign out' }).tap();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
});
