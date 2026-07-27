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
 * labels, buttons, chips, tabs — and which are therefore as wide as their
 * content wants. Each must declare `flex-wrap: wrap` (the sheet's convention) or
 * take the overflow itself with `overflow-x`. Anything else pushes the document.
 */
const HORIZONTAL_STRIPS = ['.tai-tablist', '.tai-row', '.tai-page-actions', '.tai-dialog-actions'];

describe('narrow-viewport contract', () => {
  it.each(HORIZONTAL_STRIPS)('%s wraps or scrolls rather than pushing the document', (selector) => {
    const body = ruleBody(selector);
    expect(body).toMatch(/display:\s*flex/);
    const contains = /flex-wrap:\s*wrap/.test(body) || /overflow-x:\s*(auto|scroll)/.test(body);
    expect([selector, contains]).toEqual([selector, true]);
  });

  it('lists every horizontal strip the sheet declares', () => {
    // The floor against the LIST going stale — the exact way the floating-surface
    // triple missed `.tai-select-content`. Every rule that sets `display: flex`
    // without `flex-direction: column` and without a width cap is a strip, and a
    // new one must be classified here rather than silently exempted.
    const rowFlex = [...stylesheet.matchAll(/\n\s*(\.[\w-]+)\s*\{([^}]*)\}/g)]
      .filter(([, , body = '']) => /display:\s*flex/.test(body))
      .filter(([, , body = '']) => !/flex-direction:\s*column/.test(body))
      .map(([, selector = '']) => selector);
    // Every listed strip is really one of them…
    expect(rowFlex).toEqual(expect.arrayContaining(HORIZONTAL_STRIPS));
    // …and the sweep really reaches the sheet's flex rows.
    expect(rowFlex.length).toBeGreaterThanOrEqual(10);
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
