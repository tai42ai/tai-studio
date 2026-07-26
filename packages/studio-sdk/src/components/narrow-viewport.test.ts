/**
 * The 320 px contract, asserted from the stylesheet.
 *
 * Every floating surface is capped against the VIEWPORT as well as its own
 * preferred size, so none of them can push the document sideways on the
 * narrowest supported screen (the mission's zero-horizontal-overflow rule at
 * 320 px). The check is source-level because the unit environment is jsdom: it
 * runs no layout and loads no CSS, so a rendered assertion would pass at any
 * width and prove nothing. The rendered proof is a screenshot sweep.
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

describe('narrow-viewport contract', () => {
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
