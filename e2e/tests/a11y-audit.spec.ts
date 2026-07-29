/**
 * The accessibility audit's AUTOMATED pass, run in a REAL browser against the
 * live boot skeleton. `viewport-sweep.spec.ts` proves the credential screen alone
 * carries no critical/serious axe violation; this walks the WHOLE authed feature
 * set in BOTH themes and holds every screen to the same bar — a redesign that
 * restyles light and dark separately can regress one theme's contrast, focus
 * order, or name/role/value while the other stays clean.
 *
 * axe is scoped to the WCAG 2.0/2.1 A + AA rule tags, which is the mission's
 * stated conformance target; any violation returned is a genuine conformance
 * failure. The blocking assertion is zero critical/serious per screen; the full
 * violation list per screen/theme is written to `test-results/a11y-<theme>.json`
 * as the audit's evidence.
 *
 * axe does NOT see non-text contrast, hover/focus-only states, on-tint pairs, the
 * computed type floor, or a motion preference — the manual protocol and the
 * contrast script cover those. The two checks at the foot of this file are the
 * two of those that a laid-out document reveals mechanically: the 11 px type
 * floor (nothing renders below it) and the reduced-motion token collapse.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

/** The A + AA rule tags across WCAG 2.0 and 2.1 — the mission's conformance target. */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

/** Every authed feature route the shell mounts, in nav order (login is swept on its
 * own — it has no shell). Mirrors `viewport-sweep.spec.ts`. */
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
  '/marketplace',
  '/manifest',
  '/settings',
  '/system',
] as const;

/** Wait until the routed page is not just mounted but SETTLED: its `<h1>` is
 * visible, its web fonts are ready, and no loading skeleton is still on screen.
 * axe reads the laid-out, painted document, so analysing before a screen's data
 * has resolved measures a transient (a control mid-load) rather than the design —
 * a false positive that flaps between runs. The skeleton count reaching zero is
 * the one "data resolved" signal every feature screen shares. */
async function waitForFeaturePage(page: Page): Promise<void> {
  await expect(page.locator('#main-content h1').first()).toBeVisible();
  await expect(page.locator('.tai-skeleton')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

interface ScreenReport {
  route: string;
  violations: {
    id: string;
    impact: string | null | undefined;
    help: string;
    nodes: number;
    targets: string[];
  }[];
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe A+AA sweep (${scheme})`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });

    test('every feature screen carries no critical or serious violation', async ({ page }) => {
      // Disable animations for the scan. axe reads the painted document at one
      // instant; a control caught mid-transition (a button's 150 ms disabled ->
      // enabled colour fade) samples an INTERMEDIATE colour pair that neither
      // stable state ever rests at, which WCAG does not evaluate. Reduced-motion
      // collapses the motion tokens to 0 ms, so every control is at its final
      // colour when measured — the theme pin (colorScheme) is preserved.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await seedCredential(page);
      const report: ScreenReport[] = [];
      const blocking: string[] = [];

      for (const route of FEATURE_ROUTES) {
        await page.goto(route);
        await waitForFeaturePage(page);
        const theme = await page.evaluate(() =>
          document.documentElement.getAttribute('data-theme'),
        );
        expect(theme, `data-theme did not resolve to ${scheme} on ${route}`).toBe(scheme);

        const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();

        report.push({
          route,
          violations: results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.length,
            targets: v.nodes.flatMap((n) => n.target.map((t) => String(t))),
            data: v.nodes.flatMap((n) => n.any.map((a): unknown => a.data)),
          })),
        });
        for (const v of results.violations) {
          if (v.impact === 'critical' || v.impact === 'serious') {
            blocking.push(`${route} [${scheme}]: ${v.id} (${v.impact}) — ${v.help}`);
          }
        }
      }

      const evidenceDir = join(test.info().project.outputDir, 'a11y-evidence');
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(join(evidenceDir, `a11y-${scheme}.json`), JSON.stringify(report, null, 2));
      expect(blocking, blocking.join('\n')).toEqual([]);
    });
  });
}

test.describe('credential screen axe A+AA (both themes)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`no critical or serious violation (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(blocking.map((v) => `${v.id} — ${v.help}`)).toEqual([]);
    });
  }
});

// ---- Computed type floor: nothing renders below 11 px --------------------------
// The token scale floors at `--tai-text-xs` (11 px); this proves no rendered text
// element resolves BELOW that floor at the browser, which axe never checks. Dense,
// label-heavy screens are the ones where a stray sub-floor size would hide.
const FLOOR_SCREENS = ['/observability', '/settings', '/tools', '/system'] as const;

test.describe('computed type floor (>= 11 px)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('no visible text renders below the 11 px floor', async ({ page }) => {
    await seedCredential(page);
    const offenders: string[] = [];
    for (const route of FLOOR_SCREENS) {
      await page.goto(route);
      await waitForFeaturePage(page);
      const found = await page.evaluate(() => {
        const bad: { size: number; tag: string; text: string }[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = (node.textContent ?? '').trim();
          if (!text) continue;
          const el = node.parentElement;
          if (!el) continue;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const size = parseFloat(style.fontSize);
          // 10.9 tolerates sub-pixel rounding of the 11 px (0.6875rem) token while
          // still catching a genuine 10 px / 9 px slip.
          if (size < 10.9) {
            bad.push({ size, tag: el.tagName.toLowerCase(), text: text.slice(0, 40) });
          }
        }
        return bad;
      });
      for (const b of found) {
        offenders.push(`${route}: ${String(b.size)}px <${b.tag}> "${b.text}"`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

// ---- Reduced-motion: the motion tokens collapse to 0 ms -------------------------
// The token sheet zeroes `--tai-motion-fast`/`--tai-motion-base` under
// `prefers-reduced-motion: reduce`; every consumer (this repo's classes and plugin
// code that spells the token) honours the preference through that one collapse.
test.describe('reduced-motion', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the published motion tokens resolve to 0 ms', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedCredential(page);
    await page.goto('/observability');
    await waitForFeaturePage(page);
    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        fast: s.getPropertyValue('--tai-motion-fast').trim(),
        base: s.getPropertyValue('--tai-motion-base').trim(),
      };
    });
    // The browser serializes a zero duration as either `0s` or `0ms`; both mean
    // the motion collapsed. Assert the numeric value is zero, unit-agnostically.
    expect(tokens.fast).toMatch(/^0m?s$/);
    expect(tokens.base).toMatch(/^0m?s$/);
  });
});

// ---- 1.4.12 text-spacing: the WCAG override does not clip or overflow -----------
// Apply the exact user-stylesheet 1.4.12 asks a page to survive (line-height 1.5,
// letter/word/paragraph spacing), then assert the document still does not scroll
// sideways — the failure mode text-spacing exposes.
test.describe('1.4.12 text-spacing', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('applying the WCAG text-spacing override causes no horizontal overflow', async ({
    page,
  }) => {
    await seedCredential(page);
    await page.goto('/settings');
    await expect(page.locator('#main-content h1').first()).toBeVisible();
    await page.addStyleTag({
      content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'text-spacing override pushed the document sideways').toBeLessThanOrEqual(0);
  });
});
