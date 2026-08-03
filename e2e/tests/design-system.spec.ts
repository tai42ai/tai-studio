/**
 * The design system's DOM contract, measured in a REAL browser against the LIVE
 * boot skeleton. Nothing else in this repo evaluates a CSS rule — the unit
 * suites run with `css: false` and jsdom performs no layout — so intrinsic
 * sizing, wrapping and document overflow, everything the stylesheet actually
 * decides, are only observable here.
 *
 * A table cell is not a flex item: auto table layout hands each column its
 * MIN-CONTENT, and a control that opts into breaking anywhere reports a
 * min-content of one character. So a button in a table column can be laid out a
 * letter per line while every source-level gate stays green. The legs below
 * measure the rendered geometry of a real row's button at each of the four
 * widths the layout contract is stated at.
 *
 * Every viewport is set BEFORE the first paint, one browser context per width,
 * so each measurement is of a page laid out at that width rather than of a page
 * restyled into it.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { API_KEY, EXECUTION_KEY_ID, seedCredential } from './helpers';

/** The viewport widths the layout contract is stated at. */
const WIDTHS = [320, 640, 768, 1280] as const;

/** Geometry of one control, plus the single-line height its own sheet implies. */
interface ControlGeometry {
  /** The rendered border-box height. */
  readonly height: number;
  /** `max(min-height, one line box + vertical padding + borders)`. */
  readonly singleLine: number;
}

/**
 * Read a control's rendered height together with the single-line height its
 * COMPUTED STYLE implies, so the expectation tracks the sheet's own tokens
 * rather than a number copied out of it.
 */
async function controlGeometry(control: Locator): Promise<ControlGeometry> {
  return control.evaluate((el) => {
    const style = getComputedStyle(el);
    const px = (value: string): number => {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    };
    const fontSize = px(style.fontSize);
    // The sheet sets a unitless line-height, which computes to a length; the
    // `normal` branch is only a guard.
    const lineBox = style.lineHeight === 'normal' ? fontSize * 1.2 : px(style.lineHeight);
    const frame =
      px(style.paddingTop) +
      px(style.paddingBottom) +
      px(style.borderTopWidth) +
      px(style.borderBottomWidth);
    return {
      height: el.getBoundingClientRect().height,
      singleLine: Math.max(px(style.minHeight), lineBox + frame),
    };
  });
}

/**
 * Register a hook through the real authed door, open the hooks page and filter
 * the list down to that one topic — so the table under measurement holds exactly
 * one row whatever else the suite has registered. Resolves the row's button.
 */
async function seedFilteredHookRow(page: Page): Promise<Locator> {
  const suffix = Date.now().toString(36);
  const name = `e2e-ds-${suffix}`;
  const topic = `e2e-design-system-${suffix}`;
  const registered = await page.request.post('/api/hooks', {
    headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    data: { name, topic, tool: 'echo', execution_key: EXECUTION_KEY_ID },
  });
  expect(registered.status()).toBe(200);

  await seedCredential(page);
  await page.goto('/hooks');
  await page.getByLabel('Filter by topic').fill(topic);
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(1);
  return page.getByRole('button', { name: `Delete hook ${name}` });
}

for (const width of WIDTHS) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('a button in a table cell renders on one line', async ({ page }) => {
      const button = await seedFilteredHookRow(page);
      await expect(button).toBeVisible();

      const { height, singleLine } = await controlGeometry(button);
      // A one-pixel allowance covers sub-pixel rounding of the derived height; a
      // second line costs a whole line box, so it cannot hide in that margin.
      expect(
        height,
        `the "Delete" button is taller than one ${String(singleLine)} px line, so its column collapsed to its min-content`,
      ).toBeLessThanOrEqual(singleLine + 1);
    });
  });
}

test.describe('at 320 px', () => {
  test.use({ viewport: { width: 320, height: 900 } });

  /**
   * The zero-horizontal-overflow rule on the narrowest supported screen, on the
   * one full screen whose chrome is the design system's own: the credential
   * screen composes a card, a field, a text input, a checkbox and a button with
   * no application shell around them.
   */
  test('the credential screen never scrolls sideways', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow, 'the document overflows horizontally at 320 px').toBeLessThanOrEqual(0);
  });
});

/**
 * The AUTHENTICATED shell — the surface the credential screen above does not cover
 * — at the two narrowest widths. Below 640 the fixed sidebar is replaced by a
 * sticky top bar and a modal drawer, so the document must not scroll sideways.
 */
for (const width of [320, 390] as const) {
  test.describe(`the shell at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('never scrolls sideways', async ({ page }) => {
      await seedCredential(page);
      await page.goto('/observability');
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(
        overflow,
        `the shell overflows horizontally at ${String(width)} px`,
      ).toBeLessThanOrEqual(0);
    });
  });
}

/**
 * The mobile navigation drawer: below 640 the nav lives behind the top bar's
 * hamburger in an APG modal dialog. Escape returns focus to the hamburger; a
 * nav-link activation dismisses it and changes the route.
 */
test.describe('the mobile navigation drawer', () => {
  test.use({ viewport: { width: 375, height: 900 } });

  test('opens from the top bar, closes on Escape returning focus, and closes on navigation', async ({
    page,
  }) => {
    await seedCredential(page);
    await page.goto('/observability');

    const hamburger = page.getByRole('button', { name: 'Open navigation' });
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const dialog = page.getByRole('dialog', { name: 'Navigation' });
    await expect(dialog).toBeVisible();

    // Escape dismisses the modal and returns focus to the opener.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(hamburger).toBeFocused();

    // Re-open and activate a nav link: the drawer closes and the route changes.
    await hamburger.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('link', { name: 'Tools' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/tools/);
  });
});
