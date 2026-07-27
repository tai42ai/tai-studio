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

/**
 * The SUBJECT of a selector — its last compound, the element the declarations
 * actually style. `.a > .b` styles `.b`; `.a .b` styles `.b`.
 *
 * The guard that makes an outline cancellation safe has to sit on the subject:
 * `.tai-x:not(:focus-visible) .tai-y` guards the ANCESTOR, so `.tai-y` still
 * loses its ring while it is focus-visible. Reading the guard off the whole
 * selector string would let that ancestor launder the descendant.
 */
function subjectCompound(selector: string): string {
  const compounds = selector.split(/\s*[>+~]\s*|\s+/).filter((part) => part !== '');
  return compounds[compounds.length - 1] ?? selector;
}

/** One `prop: value` declaration, lowercased so spelling case cannot hide it. */
interface Declaration {
  readonly property: string;
  readonly value: string;
}

function declarationsOf(body: string): Declaration[] {
  return body
    .split(';')
    .map((one) => one.trim())
    .filter((one) => one !== '')
    .flatMap((one) => {
      const colon = one.indexOf(':');
      if (colon === -1) return [];
      return [
        {
          property: one.slice(0, colon).trim().toLowerCase(),
          value: one
            .slice(colon + 1)
            .trim()
            .toLowerCase(),
        },
      ];
    });
}

/** A length that draws nothing: zero in any unit, or none at all. */
const ZERO_LENGTH = /^0(px|em|rem|ex|ch|vw|vh|pt|pc|in|cm|mm|q|%)?$/;

/** The value tokens of a declaration, `!important` and `url()` commas aside. */
function valueTokens(value: string): string[] {
  return value.split(/\s+/).filter((token) => token !== '' && token !== '!important');
}

/**
 * Whether a declaration block removes the focus ring.
 *
 * Matched on the SHORTHAND and every longhand, because each of them can erase
 * the ring on its own and they do not all spell it the same way: `outline: none`,
 * `outline: 0 none`, `outline: medium none`, `outline: 1px solid transparent`,
 * `outline-width: 0`, `outline-style: hidden`, an `outline-color` painted in the
 * ground the ring sits on, and a negative `outline-offset` that pulls the ring
 * under the element all end with nothing visible. `--tai-color-focus-ring` is
 * the ONLY colour the shared ring is allowed, so any other `outline-color` is
 * treated as a cancellation rather than guessed at.
 */
function cancelsOutline(body: string): boolean {
  return declarationsOf(body).some(({ property, value }) => {
    const tokens = valueTokens(value);
    switch (property) {
      case 'outline':
        return tokens.some(
          (token) =>
            token === 'none' ||
            token === 'hidden' ||
            token.includes('transparent') ||
            ZERO_LENGTH.test(token),
        );
      case 'outline-width':
        return tokens.some((token) => ZERO_LENGTH.test(token));
      case 'outline-style':
        return tokens.includes('none') || tokens.includes('hidden');
      case 'outline-color':
        return !value.includes('var(--tai-color-focus-ring)');
      case 'outline-offset':
        return tokens.some((token) => token.startsWith('-'));
      default:
        return false;
    }
  });
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
    // Naming ONE class here would let the other twenty-one be deleted from the
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
      // Radix gives every TabsContent `tabIndex: 0`, so a panel is a tab stop
      // whether or not it contains one.
      '.tai-tabpanel',
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
    // The guard is checked PER SELECTOR and on that selector's SUBJECT: in a
    // comma group one guarded member would otherwise launder every unguarded
    // sibling beside it, and a guard on an ANCESTOR (`.a:not(:focus-visible) .b`)
    // says nothing about `.b`'s own focus state, so reading the guard off the
    // whole string would launder the descendant one level down.
    const unguarded = rules
      .filter((rule) => cancelsOutline(rule.body))
      .flatMap((rule) => selectorsOf(rule.selector))
      .filter((selector) => !subjectCompound(selector).includes(':not(:focus-visible)'));

    expect(unguarded).toEqual([]);

    // Positive controls: every spelling that removes the ring must be caught,
    // or a pattern that stopped matching would turn this gate green.
    for (const declaration of [
      'outline: none;',
      'outline: none !important;',
      'outline: 0 !important;',
      'outline: 0px;',
      'outline: 0 none;',
      'outline: medium none;',
      'outline: 1px solid transparent;',
      'OUTLINE: NONE;',
      'Outline-Width: 0rem;',
      'outline-width: 0;',
      'outline-style: hidden;',
      'outline: transparent;',
      'outline-color: var(--tai-color-surface);',
      'outline-offset: -200px;',
    ]) {
      expect([declaration, cancelsOutline(declaration)]).toEqual([declaration, true]);
    }
    // …and a real ring must not read as a cancellation.
    for (const declaration of [
      'outline: 2px solid var(--tai-color-focus-ring);',
      'outline-offset: 2px;',
      'outline-color: var(--tai-color-focus-ring);',
      'outline-width: 2px;',
      'outline-style: solid;',
      'border: 0;',
      'box-shadow: none;',
    ]) {
      expect([declaration, cancelsOutline(declaration)]).toEqual([declaration, false]);
    }

    // The guard has to be read off the subject, not the selector string. A
    // control that would pass under a bare substring test is exactly the class
    // of hole this replaced.
    for (const selector of [
      '.tai-a:not(:focus-visible) .tai-b',
      '.tai-a:not(:focus-visible) > .tai-b',
      '.tai-a:not(:focus-visible) + .tai-b',
      '.tai-a:not(:focus-visible) ~ .tai-b',
    ]) {
      expect([selector, subjectCompound(selector).includes(':not(:focus-visible)')]).toEqual([
        selector,
        false,
      ]);
    }
    for (const selector of ['.tai-b:not(:focus-visible)', '.tai-a > .tai-b:not(:focus-visible)']) {
      expect([selector, subjectCompound(selector).includes(':not(:focus-visible)')]).toEqual([
        selector,
        true,
      ]);
    }
  });
});
