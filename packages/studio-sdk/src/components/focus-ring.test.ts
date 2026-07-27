/**
 * The visible-focus contract, asserted from the stylesheet.
 *
 * The check is source-level because the unit environment is jsdom: it runs no
 * layout and loads no CSS, so a rendered assertion would see no ring either way
 * and prove nothing. A ring that has been cancelled by a later rule is invisible
 * in review too — one `outline: none` at equal specificity, further down the
 * sheet, silently took the ring off every Select option — so the cancellation is
 * what this file watches.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'components.css'),
  'utf8',
).replaceAll(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  readonly selector: string;
  readonly body: string;
}

/**
 * Every innermost declaration block in the sheet, with its selector. `[^{}]`
 * cannot cross a brace, so an `@layer`/`@media` wrapper never matches as a rule
 * of its own and its nested rules are returned instead.
 */
const rules: Rule[] = [...stylesheet.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map((match) => ({
  selector: (match[1] ?? '').trim(),
  body: match[2] ?? '',
}));

/** A comma group split into its individual selectors, blanks dropped. */
function selectorsOf(selector: string): string[] {
  return selector
    .split(',')
    .map((one) => one.trim())
    .filter((one) => one !== '');
}

/** The rule declaring the shared ring — the one every focusable class shares. */
const sharedRing = rules.filter((rule) => /outline:\s*2px solid/.test(rule.body));

describe('visible focus', () => {
  it('parses the stylesheet (a scan that found nothing would pass vacuously)', () => {
    expect(rules.length).toBeGreaterThan(100);
    expect(sharedRing).toHaveLength(1);
  });

  it('draws the ring as an outline at a 2 px offset, never a box-shadow', () => {
    const ring = sharedRing[0];
    expect(ring?.body).toContain('outline: 2px solid var(--tai-color-focus-ring)');
    expect(ring?.body).toContain('outline-offset: 2px');
    expect(ring?.body).not.toContain('box-shadow');
  });

  it('keys every selector sharing the ring on :focus-visible', () => {
    const notKeyed = selectorsOf(sharedRing[0]?.selector ?? '').filter(
      (selector) => !selector.endsWith(':focus-visible'),
    );

    expect(notKeyed).toEqual([]);
  });

  it('puts every interactive class in the shared ring', () => {
    // Naming ONE class here would let the other nineteen be deleted from the
    // rule with every test still green. The list is the design system's own
    // set of keyboard-reachable surfaces; a new one is added here deliberately.
    const RING_BEARERS = [
      '.tai-btn',
      '.tai-icon-btn',
      '.tai-link',
      '.tai-input',
      '.tai-textarea',
      '.tai-select-trigger',
      // Radix moves DOM focus onto the highlighted option, so it needs a ring.
      '.tai-select-item',
      '.tai-checkbox',
      '.tai-radio',
      '.tai-segment',
      '.tai-chip',
      '.tai-tab',
      '.tai-nav-item',
      '.tai-nav-link',
      '.tai-skip-link',
      '.tai-card-interactive',
      '.tai-scroll-region',
      '.tai-code-block',
      '.tai-prose a',
      '.tai-prose pre',
      '.tai-drawer',
      '.tai-dialog',
    ];
    const keyed = new Set(selectorsOf(sharedRing[0]?.selector ?? ''));
    const missing = RING_BEARERS.filter((name) => !keyed.has(`${name}:focus-visible`));

    expect(missing).toEqual([]);
  });

  it('never cancels the outline for a state that can be keyboard focus', () => {
    // A rule that turns the outline off is only safe if it cannot apply while
    // the element is focus-visible. Radix's `data-highlighted` is stamped for
    // pointer hover AND keyboard movement alike, so a bare `[data-highlighted]`
    // cancellation takes the ring off the keyboard case too.
    //
    // The guard is checked PER SELECTOR: in a comma group, one guarded member
    // would otherwise launder every unguarded sibling beside it. And the
    // cancellation is matched on the longhands and the zero-with-a-unit
    // spellings too, since `outline-width: 0` removes the ring just as
    // completely as `outline: none`.
    const CANCELS_OUTLINE =
      /outline(-width|-style|-color)?\s*:\s*(none|0(px|em|rem|%)?|transparent)\s*(;|$)/;
    const unguarded = rules
      .filter((rule) => CANCELS_OUTLINE.test(rule.body))
      .flatMap((rule) => selectorsOf(rule.selector))
      .filter((selector) => !selector.includes(':not(:focus-visible)'));

    expect(unguarded).toEqual([]);
  });
});
