import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// jsdom can't evaluate `pointer: coarse`, so the touch sizes are measured here, on a phone.

async function expectTapTarget(target: Locator) {
  const box = await target.boundingBox();
  expect(box, 'the target is on screen').not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
}

async function expectFieldText(field: Locator) {
  expect(await field.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
}

async function expectThemeMenu(page: Page) {
  const banner = page.getByRole('banner');
  await expectTapTarget(banner.getByRole('button', { name: 'Theme' }));
  await banner.getByRole('button', { name: 'Theme' }).click();
  for (const item of await banner.getByRole('menuitemradio').all()) await expectTapTarget(item);
  await page.keyboard.press('Escape');
}

test('Home has touch-sized header controls', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('banner');

  await expectThemeMenu(page);
  await expectTapTarget(banner.getByRole('button', { name: 'Menu' }));
  await expectTapTarget(banner.getByRole('link', { name: 'Sign in' }));
});

test('Login has touch-sized controls', async ({ page }) => {
  await page.goto('/login');

  await expectThemeMenu(page);
  await expectTapTarget(page.getByRole('button', { name: 'Continue with GitHub' }));
});

test('Projects has 16px fields and touch-sized buttons and menus', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/projects');
  const banner = page.getByRole('banner');

  await expectFieldText(page.getByLabel('Project name'));
  await expectTapTarget(page.getByRole('button', { name: 'Create project' }));
  await expectThemeMenu(page);
  await expectTapTarget(banner.getByRole('button', { name: 'Account' }));
  await banner.getByRole('button', { name: 'Account' }).click();
  await expectTapTarget(banner.getByRole('menuitem', { name: 'Settings' }));
  await expectTapTarget(banner.getByRole('menuitem', { name: 'Sign out' }));
});
