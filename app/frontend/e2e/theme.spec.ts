import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// The OS asks for dark; the User's choice must win, survive a reload and reach the canvas.
test.use({ colorScheme: 'dark' });

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function choose(page: Page, theme: 'System' | 'Light' | 'Dark') {
  const header = page.getByRole('banner');
  await header.getByRole('button', { name: 'Theme' }).click();
  await header.getByRole('menuitemradio', { name: theme }).click();
}

test('a chosen theme overrides the system one and survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => background(page)).toBe('rgb(13, 10, 18)');

  await choose(page, 'Light');
  await expect.poll(() => background(page)).toBe('rgb(255, 255, 255)');

  await page.reload();
  // Set by theme-init.js before React starts, so there is no dark first paint.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => background(page)).toBe('rgb(255, 255, 255)');

  await choose(page, 'System');
  await expect.poll(() => background(page)).toBe('rgb(13, 10, 18)');
});

test('the canvas follows the chosen theme', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/projects');
  await page.getByLabel('Project name').fill('Themed');
  await page.getByRole('button', { name: 'Create project' }).click();
  const canvas = page.locator('.react-flow');
  await expect(canvas).toHaveClass(/\bdark\b/);

  await choose(page, 'Light');

  await expect(canvas).toHaveClass(/\blight\b/);
});
