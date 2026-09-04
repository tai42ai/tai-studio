/**
 * The cross-viewport sweep, measured in a REAL browser against the LIVE boot
 * skeleton. `design-system.spec.ts` measures one control's geometry; this walks
 * whole screens at each width the layout contract names and asserts the four
 * things only a laid-out document reveals: the document never scrolls SIDEWAYS,
 * the shell shows the right chrome for its band (a 232 px sidebar, a 72 px rail,
 * or a top bar + drawer), a master/detail split folds to one pane below 1024,
 * and a dense table's overflow is caught by its own scroll region rather than
 * the page.
 *
 * The full screen set is swept at 1280 in BOTH themes — a redesign that restyles
 * light and dark separately can regress one without the other — and the
 * representative subset (shell, login, a master/detail, a dense table, the
 * observability views) is swept across the 320 → 1920 ladder. Each viewport is
 * set BEFORE the first paint (one browser context per width), so every
 * measurement is of a page laid out at that width, not one restyled into it.
 *
 * `@axe-core/playwright` is wired here so the a11y audit that follows has the
 * harness it needs; the smoke below asserts the credential screen — the surface
 * the redesign fully owns — carries no critical or serious automated violation.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

/** The document's horizontal overflow in CSS px (<= 0 means it does not scroll
 * sideways). `clientWidth` already excludes the vertical scrollbar, so a page
 * that only scrolls DOWN reports 0 here. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

/** Wait for the authed shell to have committed a routed page: every feature page
 * renders its title through `PageHeader`, so its `<h1>` inside `#main-content` is
 * the one signal common to all of them. */
async function waitForFeaturePage(page: Page): Promise<void> {
  await expect(page.locator('#main-content h1').first()).toBeVisible();
}

/** Every authed feature route the shell mounts (the nav's Dashboard row plus each
 * section), in nav order. Login is swept separately — it has no shell. */
const FEATURE_ROUTES = [
  '/observability',
  '/tools',
  '/agents',
  '/presets',
  '/extensions',
  '/templates',
  '/connectors',
  '/hooks',
  '/storage',
  '/scheduling',
  '/interactions',
  '/notifications',
  '/conversations',
  '/marketplace',
  '/manifest',
  '/served-endpoints',
  '/settings',
  '/system',
] as const;

// ---- Full screen set at 1280, in both themes -----------------------------------
// The preference defaults to `system`, so emulating the OS colour scheme is what
// pins the resolved theme; the assertion on `data-theme` proves the pin took, so
// the dark pass is a genuinely different render and not the light one relabelled.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`full screen set at 1280 (${scheme})`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });

    test('every feature screen renders in-theme with no horizontal overflow', async ({ page }) => {
      await seedCredential(page);
      for (const route of FEATURE_ROUTES) {
        await page.goto(route);
        await waitForFeaturePage(page);
        const theme = await page.evaluate(() =>
          document.documentElement.getAttribute('data-theme'),
        );
        expect(theme, `data-theme did not resolve to ${scheme} on ${route}`).toBe(scheme);
        expect(
          await horizontalOverflow(page),
          `${route} overflows horizontally at 1280 px (${scheme})`,
        ).toBeLessThanOrEqual(0);
      }
    });
  });

  test.describe(`credential screen at 1280 (${scheme})`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });

    test('renders in-theme with no horizontal overflow', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(theme).toBe(scheme);
      expect(
        await horizontalOverflow(page),
        `login overflows horizontally (${scheme})`,
      ).toBeLessThanOrEqual(0);
    });
  });
}

// ---- The 320 → 1920 ladder over the representative subset -----------------------
const LADDER = [320, 390, 640, 768, 1024, 1920] as const;

for (const width of LADDER) {
  const phone = width < 640;
  const rail = width >= 640 && width < 1024;
  const singlePane = width < 1024;

  test.describe(`the ladder at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('the shell shows the right chrome for its band and never scrolls sideways', async ({
      page,
    }) => {
      await seedCredential(page);
      await page.goto('/observability');
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

      const sidebar = page.locator('.tai-shell-sidebar');
      const topbar = page.locator('.tai-topbar');
      const hamburger = page.getByRole('button', { name: 'Open navigation' });
      const brandLabel = page.locator('.tai-shell-sidebar .tai-brand-label');

      if (phone) {
        // Below 640 the sidebar is replaced by a sticky top bar whose hamburger
        // opens the nav in a modal drawer.
        await expect(sidebar).toBeHidden();
        await expect(topbar).toBeVisible();
        await expect(hamburger).toBeVisible();
      } else {
        await expect(sidebar).toBeVisible();
        await expect(topbar).toBeHidden();
        const box = await sidebar.boundingBox();
        expect(box, 'the sidebar has no layout box').not.toBeNull();
        if (rail) {
          // 640-1023: a 72 px icon rail with its brand/section labels dropped.
          expect(box?.width).toBeGreaterThanOrEqual(60);
          expect(box?.width).toBeLessThanOrEqual(96);
          await expect(brandLabel).toBeHidden();
        } else {
          // >= 1024: the full 232 px labelled sidebar.
          expect(box?.width).toBeGreaterThanOrEqual(200);
          expect(box?.width).toBeLessThanOrEqual(264);
          await expect(brandLabel).toBeVisible();
        }
      }

      expect(
        await horizontalOverflow(page),
        `the shell overflows horizontally at ${String(width)} px`,
      ).toBeLessThanOrEqual(0);
    });

    test('the credential screen never scrolls sideways', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      expect(
        await horizontalOverflow(page),
        `login overflows horizontally at ${String(width)} px`,
      ).toBeLessThanOrEqual(0);
    });

    test('the tools master/detail folds to one pane below 1024', async ({ page }) => {
      await seedCredential(page);
      await page.goto('/tools');
      await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible();

      const list = page.locator('.tai-split-list');
      const detail = page.locator('.tai-split-detail');
      const firstTool = page.locator('[aria-label^="Open tool "]').first();
      await expect(firstTool).toBeVisible();
      await firstTool.click();

      // Selecting a tool routes to `?tool=`; the pane-back control appears only in
      // the single-pane bands, where the detail replaces the list. Its accessible
      // name is exactly "Back" — matched exactly so the run panel's "Run in
      // background" (a substring "Back") is not swept in.
      const back = page.getByRole('button', { name: 'Back', exact: true });
      if (singlePane) {
        await expect(detail).toBeVisible();
        await expect(list).toBeHidden();
        await expect(back).toBeVisible();
      } else {
        await expect(list).toBeVisible();
        await expect(detail).toBeVisible();
        await expect(back).toHaveCount(0);
      }

      expect(
        await horizontalOverflow(page),
        `tools overflows horizontally at ${String(width)} px`,
      ).toBeLessThanOrEqual(0);
    });

    test('the API keys table is contained by its own scroll region', async ({ page }) => {
      await seedCredential(page);
      await page.goto('/settings');
      await page.getByRole('tab', { name: 'API keys' }).click();

      // The keys table lives inside a `ScrollRegion` (`.tai-scroll-region`), which
      // owns any horizontal overflow so a dense table never pushes the document
      // sideways at a narrow width.
      const region = page.locator('.tai-scroll-region').filter({ has: page.locator('table') });
      await expect(region.locator('table')).toBeVisible();

      // Containment proof: the keys table lives inside the region (asserted above)
      // and the document does not scroll sideways (asserted below) — so the region,
      // not the page, absorbs any overflow. If the region stopped containing it, the
      // dense table would push the document wide and this assertion would fail.
      expect(
        await horizontalOverflow(page),
        `the API keys table pushed the document sideways at ${String(width)} px`,
      ).toBeLessThanOrEqual(0);
    });

    test('the observability tracing view never scrolls sideways', async ({ page }) => {
      await seedCredential(page);
      await page.goto('/observability');
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
      await page.getByRole('tab', { name: 'Tracing' }).click();
      // The tracing panel commits its own content region under the tabs.
      await expect(page.getByRole('tabpanel')).toBeVisible();
      expect(
        await horizontalOverflow(page),
        `observability tracing overflows horizontally at ${String(width)} px`,
      ).toBeLessThanOrEqual(0);
    });
  });
}

// ---- Automated a11y smoke (the audit's harness, proven on one owned screen) -----
test.describe('accessibility smoke at 1280', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the credential screen has no critical or serious axe violations', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking.map((v) => v.id)).toEqual([]);
  });
});
