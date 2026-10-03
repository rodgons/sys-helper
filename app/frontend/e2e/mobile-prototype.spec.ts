// PROTOTYPE: throwaway. Screenshots of the compact header and Project drawer variants at phone size.
import { expect, test } from './fixtures';

const out = process.env.PROTO_SHOTS ?? 'test-results/proto-shots';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('capture header variants', async ({ page, signIn }) => {
  test.setTimeout(120_000);
  await signIn();
  await page.goto('/projects');
  await page.getByLabel('Project name').fill('Payments API');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/p\//);
  // The second one through the drawer's New project.
  await page.goto(`${page.url()}?variant=A`);
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill('Mobile proto');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Mobile proto' })).toBeVisible();
  const base = page.url().split('?')[0];

  // A: two bars
  await page.goto(`${base}?variant=A`);
  await expect(page.getByRole('heading', { name: 'Mobile proto' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/A-1-closed.png` });
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/A-2-drawer.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Project actions' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/A-3-actions.png` });

  // B: one bar
  await page.goto(`${base}?variant=B`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/B-1-closed.png` });
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/B-2-drawer.png` });
  // Picking a Project closes the drawer.
  await page.getByRole('dialog').getByRole('link', { name: 'Payments API' }).click();
  await expect(page.getByRole('heading', { name: 'Payments API' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();

  // C: the title is the switcher
  await page.goto(`${base}?variant=C`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/C-1-closed.png` });
  await page.getByRole('button', { name: /Mobile proto/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/C-2-switcher.png` });
});
