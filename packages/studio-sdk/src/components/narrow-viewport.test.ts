/**
 * The 320 px contract, asserted from the stylesheet.
 *
 * Every floating surface is capped against the VIEWPORT as well as its own
 * preferred size, so none of them can push the document sideways on the
 * narrowest supported screen (the mission's zero-horizontal-overflow rule at
 * 320 px). The check is source-level because the unit environment is jsdom: it
 * runs no layout and loads no CSS, so a rendered assertion would pass at any
 * width and prove nothing. The rendered proof is a screenshot sweep.
 *
 * Floating surfaces are only half of it. An IN-FLOW horizontal strip overflows
 * the document itself, which is the WCAG 1.4.10 failure the contract is written
 * against, and it does so silently: `.tai-tablist` needed 394 px for the five
 * Settings tabs and pushed a document scrollbar at 320, 360 and 390 px while
 * every gate here stayed green, because none of them looked at anything but the
 * three capped popovers. So every strip that lays caller-sized content out in a
 * row must either WRAP or scroll inside itself.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'components.css'),
  'utf8',
);

/** The declaration block of `selector`, or a loud failure if the rule is gone. */
function ruleBody(selector: string): string {
  const match = new RegExp(`\\n\\s*\\${selector}\\s*\\{([^}]*)\\}`).exec(stylesheet);
  if (match?.[1] === undefined) throw new Error(`components.css declares no ${selector} rule`);
  return match[1];
}

/**
 * The horizontal strips: `display: flex` rows whose items are caller-sized —
 * labels, buttons, chips, tabs, server messages — and which are therefore as wide
 * as their content wants. Each must declare `flex-wrap: wrap` (the sheet's
 * convention) or take the overflow itself with `overflow-x`. Anything else pushes
 * the document.
 */
const HORIZONTAL_STRIPS = [
  '.tai-tablist',
  '.tai-row',
  '.tai-page-actions',
  '.tai-page-header',
  '.tai-dialog-actions',
  '.tai-drawer-header',
  '.tai-error-state-title',
  '.tai-field-error',
];

/**
 * The flex ROWS that are not caller-sized, each with the reason it cannot push
 * the document. A closed, hand-audited set — the same shape `field-group.test.ts`
 * uses for its expression-child sites, and for the same reason: a blind spot that
 * is enumerated is bounded, a blind spot that is implicit is unbounded.
 *
 * A new `display: flex` row lands in NEITHER list and reddens the reconciliation
 * below, which is the whole point: it must be classified, never silently exempt.
 */
const NOT_CALLER_SIZED: Readonly<Record<string, string>> = {
  '.tai-select-trigger': 'width: 100% — it takes its width from the field, not its content',
  '.tai-select-item': 'lives inside the viewport-capped .tai-select-content popover',
  '.tai-select-item-indicator': 'a bare 16 px mark, flex: none, no text',
  '.tai-nav-link': 'sits in a fixed-width sidebar; the rail band gives it overflow-wrap',
  '.tai-brand': 'the product name, a constant this repo owns',
  '.tai-topbar': 'justify-content: space-between over two fixed chrome slots',
};

describe('narrow-viewport contract', () => {
  it.each(HORIZONTAL_STRIPS)('%s wraps or scrolls rather than pushing the document', (selector) => {
    const body = ruleBody(selector);
    expect(body).toMatch(/display:\s*flex/);
    const contains = /flex-wrap:\s*wrap/.test(body) || /overflow-x:\s*(auto|scroll)/.test(body);
    expect([selector, contains]).toEqual([selector, true]);
  });

  it('classifies every horizontal strip the sheet declares, in BOTH directions', () => {
    // The floor against the LIST going stale — the exact way the floating-surface
    // triple missed `.tai-select-content`. An `arrayContaining` check here asserted
    // only that the listed names are flex rows; it said nothing about flex rows
    // that are NOT listed, which is precisely the silent-exemption case. This is a
    // set EQUALITY, so an unclassified row fails.
    const rowFlex = [...stylesheet.matchAll(/\n\s*(\.[\w-]+)\s*\{([^}]*)\}/g)]
      .filter(([, , body = '']) => /display:\s*flex/.test(body))
      .filter(([, , body = '']) => !/flex-direction:\s*column/.test(body))
      .map(([, selector = '']) => selector);

    const classified = [...HORIZONTAL_STRIPS, ...Object.keys(NOT_CALLER_SIZED)];
    expect([...new Set(rowFlex)].sort()).toEqual([...new Set(classified)].sort());
    // …and the sweep really reaches the sheet's flex rows.
    expect(rowFlex.length).toBeGreaterThanOrEqual(10);
  });

  it('gives every exemption a stated reason rather than a bare name', () => {
    for (const [selector, reason] of Object.entries(NOT_CALLER_SIZED)) {
      expect([selector, reason.length > 20]).toEqual([selector, true]);
    }
  });
  it.each([
    ['.tai-dialog', 'width'],
    ['.tai-drawer', 'width'],
    ['.tai-tooltip', 'max-width'],
  ])('caps %s against the viewport, not just its own size', (selector, property) => {
    const declaration = new RegExp(`${property}:\\s*([^;]+);`).exec(ruleBody(selector))?.[1];
    expect(declaration).toBeDefined();
    expect(declaration).toContain('min(');
    expect(declaration).toContain('100vw');
  });
});
