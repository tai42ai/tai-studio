/**
 * The visible-focus contract, asserted from the stylesheet.
 *
 * The check is source-level because the unit environment is jsdom: it runs no
 * layout and loads no CSS, so a rendered assertion would see no ring either way
 * and prove nothing. A ring that has been cancelled by a later rule is invisible
 * in review too — one `outline: none` at equal specificity, further down the
 * sheet, silently took the ring off every Select option — so the cancellation is
 * what this file watches.
 *
 * WHO bears the ring is DERIVED from two sources and reconciled against the rule
 * in both directions: the sheet's own `cursor: pointer` controls, and the
 * keyboard tab stops read out of the JSX by `tab-stops.ts`. A list of class names
 * checked one way — every name is in the rule — closes only the harmless
 * direction: it cannot see a new focusable element the sheet has never heard of,
 * and a tab stop with no ring passed the whole suite. Residue on either side is
 * an exemption carrying its reason, reconciled so an entry naming a class that
 * has gone reddens too.
 */
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  type Rule,
  declarationsOf,
  everywhere,
  readRules,
  selectorsOf,
  sheetText,
  stylesheetsWithin,
} from './test-css-reader';
import { productSourcesWithin, tabStopsIn } from './test-tab-stops';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

/**
 * Where a stylesheet that reaches a browser can live.
 *
 * `e2e/` is one of them: the reference plugin ships a scoped sheet the host
 * injects as a `<link>` into the running Studio, so a rule in it lands in the
 * same cascade as the design system's own and can cancel a ring exactly as the
 * app shell can.
 */
const SHEET_ROOTS = ['packages', 'apps', 'e2e'];

/**
 * EVERY stylesheet that reaches the browser, not just this package's component
 * layer, and DISCOVERED rather than listed. A ring cancelled from another sheet
 * is exactly as invisible, and `apps/studio/src/styles.css` carries UNLAYERED
 * blocks that outrank every design-system layer — reading `components.css` alone
 * left the one file whose rules beat the ring unconditionally outside the
 * contract, and a further sheet added beside these would fall out the same way.
 */
const SHEETS = SHEET_ROOTS.flatMap((root) => stylesheetsWithin(resolve(repoRoot, root))).sort();

/** The path of a discovered sheet, or a loud failure if it has moved. */
function sheetPath(suffix: string): string {
  const found = SHEETS.find((path) => path.endsWith(suffix));
  if (found === undefined) throw new Error(`no ${suffix} among the scanned stylesheets`);
  return found;
}

/** The component layer alone — what the ring's own declaration is asserted from. */
const stylesheet = sheetText(readFileSync(sheetPath('/components.css'), 'utf8'));

/** All sheets concatenated — what CANCELLATIONS are hunted in. */
const allSheets = SHEETS.map((path) => sheetText(readFileSync(path, 'utf8'))).join('\n');

const rules: Rule[] = readRules(stylesheet);

/** Every rule the browser sees, across every sheet in `SHEETS`. */
const allRules: Rule[] = readRules(allSheets);

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
  // Blank the BODY of every functional pseudo-class first, innermost outwards.
  // Two reasons, both load-bearing: a combinator inside `:is(a > b)` is not a
  // combinator of this selector, and — the defect this closes — a guard buried
  // in `:has(:not(:focus-visible))` is a condition on a DESCENDANT, not on the
  // subject's own focus state, so reading it as the subject's guard launders the
  // cancellation exactly as an ancestor guard did.
  let masked = selector;
  let previous = '';
  while (masked !== previous) {
    previous = masked;
    masked = masked.replace(
      /\(([^()]*)\)/g,
      (_match, body: string) => `(${'\u0000'.repeat(body.length)})`,
    );
  }
  const compounds = masked.split(/\s*[>+~]\s*|\s+/).filter((part) => part !== '');
  const last = compounds[compounds.length - 1];
  if (last === undefined) return selector;
  // Map the masked compound back onto the original text by offset, so the
  // returned string is the real selector the guard test reads.
  const start = masked.lastIndexOf(last);
  return selector.slice(start, start + last.length);
}

/** The guard that makes an outline cancellation safe on the element it styles. */
const FOCUS_GUARD = ':not(:focus-visible)';

/**
 * Whether `compound` is guarded on ITS OWN focus state.
 *
 * The guard must sit at the compound's TOP LEVEL. Buried inside a functional
 * pseudo it says something else entirely: `.tai-b:has(:not(:focus-visible))`
 * matches `.tai-b` whenever a DESCENDANT is not focus-visible — which is true
 * while `.tai-b` itself holds focus — so a substring test reads it as a guard
 * and launders the cancellation, the same hole as an ancestor guard, one level
 * in. Depth is counted rather than the text masked, because a top-level
 * `:not(:focus-visible)` has a body of its own that masking would erase too.
 */
function subjectGuardsFocusVisible(compound: string): boolean {
  let depth = 0;
  for (let index = 0; index < compound.length; index += 1) {
    if (depth === 0 && compound.startsWith(FOCUS_GUARD, index)) return true;
    const char = compound[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
  }
  return false;
}

/**
 * A length that draws nothing: numerically zero in any unit, or none at all.
 * The number is matched as a NUMBER, not as a bare `0` — `0.0px`, `.0em` and
 * `00` all draw exactly as much ring as `0` does, which is none.
 */
const ZERO_LENGTH = /^0*(?:\.0+)?(?:px|em|rem|ex|ch|vw|vh|pt|pc|in|cm|mm|q|%)?$/;

/**
 * The CSS-wide keywords. On `outline` (or on `all`) each of them throws the
 * property back to its INITIAL value — `outline: medium none currentcolor` —
 * which draws nothing. They are not "no-ops that leave the ring alone": a rule
 * that wins the cascade and says `outline: initial` kills the ring exactly as
 * `outline: none` does, and `revert-layer` in a later layer does the same.
 */
const CSS_WIDE_KEYWORDS = new Set(['initial', 'unset', 'revert', 'revert-layer']);

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
/**
 * Whether a value paints a colour that is NOT the ring's own. `--tai-color-focus-ring`
 * is the only colour the shared ring is allowed, so anything else — another token,
 * a hex, a colour keyword, a colour function — is a cancellation rather than a
 * guess. A value naming no colour at all (`2px solid`, which inherits
 * `currentColor`) is not treated as one.
 */
function namesAnotherColour(value: string): boolean {
  if (value.includes('var(--tai-color-focus-ring)')) return false;
  return (
    /var\(--[\w-]+/.test(value) ||
    /#[0-9a-f]{3,8}\b/i.test(value) ||
    /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color|color-mix|light-dark)\(/i.test(value) ||
    /\b(?:currentcolor|canvastext|buttontext|highlight|white|black|gray|grey|red|blue|green)\b/i.test(
      value,
    )
  );
}

function cancelsOutline(body: string): boolean {
  return declarationsOf(body).some(({ property, value }) => {
    const tokens = valueTokens(value);
    // `all` resets every property including `outline`; the CSS-wide keywords
    // reset whichever property carries them. Both erase the ring without ever
    // naming it, which is why they are checked before the per-property switch.
    if (property === 'all') return tokens.some((token) => CSS_WIDE_KEYWORDS.has(token));
    if (property.startsWith('outline') && tokens.some((token) => CSS_WIDE_KEYWORDS.has(token))) {
      return true;
    }
    switch (property) {
      case 'outline':
        return (
          tokens.some(
            (token) =>
              token === 'none' ||
              token === 'hidden' ||
              token.includes('transparent') ||
              ZERO_LENGTH.test(token),
          ) ||
          // The shorthand carries a COLOUR too, and the docblock above promises
          // the ground-coloured ring is caught on the shorthand as well as on the
          // longhand. It was not: `outline: 2px solid var(--tai-color-surface)`
          // draws a ring in the surface it sits on, i.e. nothing, and returned
          // false here. Any named colour that is not the ring's own is a
          // cancellation, exactly as in the `outline-color` case below.
          namesAnotherColour(value)
        );
      case 'outline-width':
        return tokens.some((token) => ZERO_LENGTH.test(token));
      case 'outline-style':
        return tokens.includes('none') || tokens.includes('hidden');
      case 'outline-color':
        return !value.includes('var(--tai-color-focus-ring)');
      case 'outline-offset':
        // A literal negative, or a calc that resolves to one. `calc()` is not
        // evaluated here — a negated term inside it is treated as pulling the
        // ring under the element, because that is the only reason to write one.
        return tokens.some((token) => token.startsWith('-') || /\(\s*-|\*\s*-/.test(token));
      default:
        return false;
    }
  });
}

/** The rule declaring the shared ring — the one every focusable class shares. */
const sharedRing = everywhere(rules).filter((rule) => /outline:\s*2px solid/.test(rule.body));

/** The classes the ring rule keys, with the `:focus-visible` they are keyed on removed. */
const RING_BEARERS = new Set(
  selectorsOf(sharedRing[0]?.selector ?? '').map((selector) =>
    selector.replace(/:focus-visible$/, ''),
  ),
);

/** Every single-class selector the sheet declares a rule for. */
const bareClasses = new Set(
  rules.flatMap((rule) => rule.selectors).filter((selector) => /^\.tai-[\w-]+$/.test(selector)),
);

/**
 * The classes the sheet itself presents as controls: `cursor: pointer` at rest.
 * A control is keyboard-operable by definition, so the affordance is evidence
 * the sheet carries about its own surfaces — read out of it rather than listed.
 */
const POINTER_CONTROLS = [...bareClasses]
  .filter((name) =>
    everywhere(rules).some(
      (rule) => rule.selectors.includes(name) && /(?:^|;)\s*cursor\s*:\s*pointer/.test(rule.body),
    ),
  )
  .sort();

/**
 * Every keyboard tab stop the product renders, read out of the JSX.
 *
 * `e2e/` is scanned with the rest: the reference plugin is the worked example a
 * plugin author copies, and a tab stop it renders is as real as one the shell
 * renders.
 */
const TAB_STOPS = tabStopsIn(
  SHEET_ROOTS.flatMap((root) => productSourcesWithin(resolve(repoRoot, root))),
);

/** Everything the source shows is keyboard-reachable, from either direction. */
const DERIVED_BEARERS = new Set([
  ...TAB_STOPS.flatMap((stop) => stop.classes),
  ...POINTER_CONTROLS,
]);

/**
 * Ring members the scans cannot reach, each with the reason they are out of
 * range rather than out of the contract. Reconciled against the rule below, so
 * an entry naming a selector the sheet has dropped reddens.
 */
const RING_BEYOND_THE_SCAN: Readonly<Record<string, string>> = {
  '.tai-link':
    'published surface with no call site in this repository: the design-system inline link, worn by whatever anchor a host or a plugin writes',
  '.tai-nav-item':
    'published surface with no call site: the design-system nav row, which this shell renders under its own `.tai-nav-link` instead',
  '.tai-brand':
    'published surface with no call site: the shell brand lockup, a link home in whichever frame a host composes for itself',
  '.tai-nav-link':
    'handed to the shell own `AppLink`, which renders the `<a href>`; the class crosses a component boundary the tag scan does not follow',
  '.tai-prose a':
    'an anchor inside authored prose, which carries no class of its own: the ring is keyed on the descendant rather than on anything the JSX writes',
  '.tai-prose pre':
    'a preformatted block inside authored prose, made a named scroll region at runtime rather than by an attribute any JSX tag writes',
  '.tai-drawer':
    'a Radix `Dialog.Content`: the library moves focus onto the panel when it opens, and the attribute that does it is inside the dependency',
  '.tai-dialog':
    'the modal panel, likewise a Radix `Dialog.Content`, focused by the library rather than by a `tabIndex` written in this repository',
  '.tai-tabpanel':
    'a Radix `Tabs.Content`, on which the library hard-codes `tabIndex: 0`, so a panel is a tab stop whether or not it holds one',
};

/**
 * Surfaces the source shows are reachable that the ring deliberately skips, with
 * the reason. Reconciled both ways: an entry naming a class nothing reaches, or
 * one that has since joined the ring, reddens.
 */
const REACHABLE_WITHOUT_THE_RING: Readonly<Record<string, string>> = {
  '.tai-choice':
    'a `<label>` and not a tab stop: the checkbox or radio it labels is what takes focus, and that box is in the shared ring already',
};

describe('visible focus', () => {
  it('parses a brace inside a quoted value without losing the walk', () => {
    // A brace is legal inside a CSS string, and the rule it sits in is truncated
    // at it: a cancellation written after one is invisible, and every brace count
    // from there on is off by one. The sheets are neutralised on read; this is
    // the control that the neutralising works and changes nothing else.
    const parsed = readRules(
      ".a::after { content: '}'; outline: none } .b:focus-visible { outline: 2px }",
    );
    expect(parsed.map((rule) => rule.selector)).toEqual(['.a::after', '.b:focus-visible']);
    expect(parsed.filter((rule) => cancelsOutline(rule.body)).map((rule) => rule.selector)).toEqual(
      ['.a::after'],
    );
    // The quotes themselves survive, because selectors are read as written.
    expect(sheetText(".x[data-theme='dark'] { color: red }")).toContain("[data-theme='dark']");
  });

  it('reads every stylesheet the repository serves, not only the design system', () => {
    // The floor on the discovery. A sheet outside this list can cancel the ring
    // from a rule no assertion here would ever read.
    const names = SHEETS.map((path) => relative(repoRoot, path));
    expect(names).toContain('packages/studio-sdk/src/components/components.css');
    expect(names).toContain('packages/studio-sdk/src/components/tokens.css');
    expect(names).toContain('apps/studio/src/styles.css');
    expect(names).toContain('e2e/reference-plugin/studio-src/styles.css');
    expect(names.length).toBeGreaterThanOrEqual(5);
  });

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

  it('lets no rule repaint the ring token out of existence', () => {
    // `cancelsOutline` only reads `outline*` and `all`. `--tai-color-focus-ring`
    // is the single colour the ring is drawn in, so a component rule redefining
    // it — `.tai-btn { --tai-color-focus-ring: transparent }` — took the ring off
    // every bearer at once without ever naming an outline property.
    //
    // The token belongs to the THEME blocks in `tokens.css` and nowhere else.
    const redefiners = allRules
      .filter((rule) => /--tai-color-focus-ring\s*:/.test(rule.body))
      .flatMap((rule) => selectorsOf(rule.selector))
      .filter((selector) => !/^:root(\[data-theme=('|")(light|dark)\2\])?$/.test(selector));

    expect(redefiners).toEqual([]);
    // The theme blocks really do define it — otherwise this passes vacuously and
    // the ring would be drawn in an undefined token.
    expect(allSheets).toMatch(/--tai-color-focus-ring:\s*\S/);
  });

  describe('who bears the ring', () => {
    it('gives every tab stop the product renders a class that bears the ring', () => {
      // The direction a list of names cannot cover. A `<div className=
      // "tai-log-pane" tabIndex={0}>` is a keyboard tab stop the sheet has never
      // heard of, and no assertion built from the sheet alone can know it exists.
      const unringed = TAB_STOPS.filter(
        (stop) =>
          !stop.classes.some((name) => RING_BEARERS.has(name)) &&
          !stop.classes.every((name) => name in REACHABLE_WITHOUT_THE_RING),
      ).map(
        (stop) => `${relative(repoRoot, stop.file)} <${stop.element}> ${stop.classes.join(' ')}`,
      );

      expect(unringed).toEqual([]);
    });

    it('gives every class the sheet presents as a control the ring, or says why not', () => {
      const missing = POINTER_CONTROLS.filter(
        (name) => !RING_BEARERS.has(name) && !(name in REACHABLE_WITHOUT_THE_RING),
      );

      expect(missing).toEqual([]);
    });

    it('carries no ring member the source cannot account for', () => {
      // The other direction, and the one that reddens when a bearer is DELETED
      // from the rule: every selector in the ring is either derived from the
      // source or named below with its reason, and the two sides are compared as
      // SETS, so neither can drift past the other in silence.
      const unaccounted = [...RING_BEARERS]
        .filter((name) => !DERIVED_BEARERS.has(name) && !(name in RING_BEYOND_THE_SCAN))
        .sort();

      expect(unaccounted).toEqual([]);
    });

    it('leaves no exemption naming a class the sheet or the source has dropped', () => {
      // Both maps are reconciled against what they exempt. An entry for a class
      // that no longer exists is fiction, and fiction is how a list goes stale.
      expect(Object.keys(RING_BEYOND_THE_SCAN).filter((name) => !RING_BEARERS.has(name))).toEqual(
        [],
      );
      expect(
        Object.keys(REACHABLE_WITHOUT_THE_RING).filter(
          (name) => !DERIVED_BEARERS.has(name) || RING_BEARERS.has(name),
        ),
      ).toEqual([]);
    });

    it('derives real sets on both sides (either found empty would pass vacuously)', () => {
      expect(RING_BEARERS.size).toBeGreaterThanOrEqual(20);
      expect(POINTER_CONTROLS.length).toBeGreaterThanOrEqual(9);
      expect(TAB_STOPS.length).toBeGreaterThanOrEqual(12);
      // The floor that keeps the JSX side from collapsing to "native elements
      // only": the scrolling regions are tab stops solely because a hook spreads
      // a `tabIndex` onto them, which is the resolution the log-pane case needs.
      expect(TAB_STOPS.filter((stop) => stop.element === 'pre').length).toBeGreaterThanOrEqual(1);
      expect([...DERIVED_BEARERS]).toContain('.tai-scroll-region');
      expect([...DERIVED_BEARERS]).toContain('.tai-textarea');
    });
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
    const unguarded = allRules
      .filter((rule) => cancelsOutline(rule.body))
      .flatMap((rule) => selectorsOf(rule.selector))
      .filter((selector) => !subjectGuardsFocusVisible(subjectCompound(selector)));

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
      // The CSS-wide keywords: each throws `outline` back to `medium none
      // currentcolor`, which draws nothing, without ever naming `none`.
      'outline: initial;',
      'outline: unset;',
      'outline: revert;',
      'outline: revert-layer;',
      'outline-style: initial;',
      'outline-width: unset;',
      // `all` erases the ring without naming the property at all.
      'all: unset;',
      'all: initial;',
      'all: revert;',
      // Numerically-zero lengths a bare `0` test misses.
      'outline: 0.0px;',
      'outline-width: .0em;',
      'outline-width: 00;',
      // A calc that resolves negative pulls the ring under the element.
      'outline-offset: calc(-1 * 4px);',
      'outline-offset: calc(0px - 4px);',
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
      // `all` with anything but a CSS-wide keyword is not a reset.
      'all: revert-layer-ish;',
      // A positive offset written as a calc is a real ring, not a cancellation.
      'outline-offset: calc(1px + 1px);',
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
      // The guard buried in a functional pseudo is a condition on a DESCENDANT,
      // not on the subject's own focus state — the same laundering one level in.
      '.tai-b:has(:not(:focus-visible))',
      '.tai-b:has(.tai-c:not(:focus-visible))',
    ]) {
      expect([selector, subjectGuardsFocusVisible(subjectCompound(selector))]).toEqual([
        selector,
        false,
      ]);
    }
    for (const selector of [
      '.tai-b:not(:focus-visible)',
      '.tai-a > .tai-b:not(:focus-visible)',
      '.tai-b:hover:not(:focus-visible)',
    ]) {
      expect([selector, subjectGuardsFocusVisible(subjectCompound(selector))]).toEqual([
        selector,
        true,
      ]);
    }
  });
});
