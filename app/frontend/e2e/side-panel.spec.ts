import { expect, test } from './fixtures';

// Wide enough that the default 24rem panel can grow: the max keeps the canvas at 32rem beside the
// 16rem project list, so 1440 - 256 - 512 = 672px.
test.use({ viewport: { width: 1440, height: 900 } });

test('dragging the side panel border resizes it, and the width survives a reload', async ({
  page,
  signIn,
}) => {
  await signIn();
  await page.goto('/projects');
  await page.getByLabel('Project name').fill('Resizable');
  await page.getByRole('button', { name: 'Create project' }).click();

  const panel = page.getByRole('complementary', { name: 'Project panel' });
  const handle = page.getByRole('separator', { name: 'Resize panel' });
  await expect(handle).toHaveAttribute('aria-valuenow', '384');
  const before = (await panel.boundingBox())?.width ?? 0;

  const box = await handle.boundingBox();
  if (!box) throw new Error('the resize handle has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 120, y, { steps: 6 });
  await page.mouse.up();

  await expect(handle).toHaveAttribute('aria-valuenow', '504');
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeCloseTo(before + 120, -1);

  await page.reload();
  await expect(handle).toHaveAttribute('aria-valuenow', '504');
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeCloseTo(before + 120, -1);
});
