// AUDIT: throwaway, lives only on the `audit/phone-width` branch. Screenshots every page at phone
// and portrait-tablet widths and measures what breaks: horizontal overflow, small tap targets,
// inputs under 16px (iOS focus-zoom) and tiny text. Findings land in AUDIT_OUT as JSON + PNGs.
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const out = process.env.AUDIT_OUT ?? 'test-results/phone-audit';
mkdirSync(out, { recursive: true });

const WIDTHS = [375, 768] as const;
const findings: Record<string, unknown> = {};

async function measure(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const describe = (el: Element) => {
      const h = el as HTMLElement;
      const name =
        h.getAttribute('aria-label') ??
        h.getAttribute('title') ??
        (h.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${h.id ? `#${h.id}` : ''} "${name}"`;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const all = [...document.querySelectorAll('body *')].filter(visible);

    // Elements whose right edge passes the viewport, outermost first (skip their descendants).
    const overflow: string[] = [];
    const seen = new Set<Element>();
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && ![...seen].some((s) => s.contains(el))) {
        seen.add(el);
        overflow.push(`${describe(el)} right=${Math.round(r.right)} width=${Math.round(r.width)}`);
      }
    }
    const interactive = all.filter((el) =>
      el.matches('a[href], button, input, select, textarea, [role="button"], [role="tab"], [tabindex="0"]'),
    );
    const smallTargets = interactive
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(({ el, r }) => `${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    const smallInputs = all
      .filter((el) => el.matches('input:not([type=checkbox]):not([type=radio]), textarea, select'))
      .map((el) => ({ el, size: Number.parseFloat(getComputedStyle(el).fontSize) }))
      .filter(({ size }) => size < 16)
      .map(({ el, size }) => `${describe(el)} ${size}px`);
    const tinyText = [
      ...new Set(
        all
          .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()))
          .filter((el) => Number.parseFloat(getComputedStyle(el).fontSize) < 12)
          .map((el) => `${describe(el)} ${getComputedStyle(el).fontSize}`),
      ),
    ];
    return {
      viewport: vw,
      documentWidth: document.documentElement.scrollWidth,
      pageScrollsSideways: document.documentElement.scrollWidth > vw,
      overflow,
      smallTargets,
      smallInputs,
      tinyText,
    };
  });
}

async function capture(page: Page, name: string) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 812 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}-${w}.png` });
    await page.screenshot({ path: `${out}/${name}-${w}-full.png`, fullPage: true });
    findings[`${name}@${w}`] = await measure(page);
  }
}

test.use({ hasTouch: true });

test('audit pages at phone width', async ({ page, signIn }) => {
  test.setTimeout(180_000);

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, 'home');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Menu' }).click();
  await capture(page, 'home-menu-open');

  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, 'login');

  await page.goto('/ui-kit');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await capture(page, 'ui-kit');

  await signIn();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await capture(page, 'home-signed-in');

  await page.goto('/projects');
  await expect(page.getByLabel('Project name')).toBeVisible();
  await capture(page, 'projects-empty');

  await page.getByLabel('Project name').fill('Payments API with a rather long project name');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/p\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, 'workspace-empty');

  // With a Proposal pending (the fake model proposes on any message).
  await page.setViewportSize({ width: 1280, height: 812 });
  await page.getByLabel('Message', { exact: true }).fill('Please propose an architecture');
  await page.getByLabel('Message', { exact: true }).press('Enter');
  await expect(page.getByText('Proposal #1', { exact: true }).first()).toBeAttached();
  await capture(page, 'workspace-proposal');

  // The Projects page with a Project redirects to it; the account Settings dialog is the other modal.
  await page.goto('/ui-kit');
  await page.setViewportSize({ width: 375, height: 812 });
  const account = page.getByRole('button', { name: 'Account' });
  findings['account-menu@375'] = { reachable: await account.isVisible() };

  writeFileSync(`${out}/findings.json`, JSON.stringify(findings, null, 2));
});
