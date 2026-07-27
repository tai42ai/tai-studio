/**
 * The component sheet's own structural contract, asserted FROM the sheet.
 *
 * `vitest.config.ts` sets `css: false`, so no unit test in this repo evaluates a
 * CSS rule: jsdom loads no stylesheet and runs no layout, and a rendered
 * assertion about a component's colour, state or geometry would pass whatever
 * the sheet said. Everything a rule decides is therefore either measured in the
 * browser by the e2e spec or read STATICALLY out of the sheet here — and the two
 * do not substitute for each other. This file catches the deletion; the browser
 * catches the mechanism changing underneath it.
 *
 * What is pinned here is the set of decisions the sheet argues for in prose and
 * nothing else re-checks: the five-state contract every control owes, the shell
 * chrome (which had NO gate at all — five CSS suites stayed green through three
 * separate rule deletions, `.tai-skip-link:focus` among them), the contrast tier
 * each identifying colour is drawn from, and every derived group the sheet
 * builds by hand and could silently let drift.
 *
 * Every group below is DERIVED from the sheet and reconciled in BOTH directions
 * where that is possible, rather than listed here: a list here is a claim nobody
 * re-checks, and it decays the day someone adds a rule. Where a hand-written set
 * is unavoidable it carries a stated reason per entry, and the reasons are
 * themselves checked for being distinct and non-trivial.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { type Rule, readRules, withoutComments } from './test-css-reader';
import { productSourcesWithin, tabStopsIn } from './test-tab-stops';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const stylesheet = readFileSync(resolve(here, 'components.css'), 'utf8');
/**
 * The token sheet, so a value written as `var(--tai-…)` resolves to a length.
 * Comments go first: every spacing token is followed by its rendered px in a
 * comment, and a reader anchored to the declaration before it would find none of
 * them and silently resolve nothing.
 */
const tokenSheet = withoutComments(readFileSync(resolve(here, 'tokens.css'), 'utf8'));

const sheet = readRules(stylesheet);

/** Every rule block naming `selector` exactly, base rules and bands alike. */
function blocksFor(selector: string): Rule[] {
  return sheet.filter((rule) => rule.selectors.includes(selector));
}

/** Every value `selector` is given for `property`, in sheet order. */
function declaredValues(selector: string, property: string): string[] {
  const pattern = new RegExp(String.raw`(?:^|;)\s*${property}\s*:\s*([^;}]+)`, 'g');
  return blocksFor(selector).flatMap((rule) =>
    [...rule.body.matchAll(pattern)].map((match) => (match[1] ?? '').trim()),
  );
}

/** Every `property: value` pair in `body`, in order. */
function declarations(body: string): [string, string][] {
  return [...body.matchAll(/(?:^|;)\s*([-\w]+)\s*:\s*([^;}]+)/g)].map((match) => [
    (match[1] ?? '').trim(),
    (match[2] ?? '').trim(),
  ]);
}

/**
 * `selector` split into COMPOUNDS — the per-element pieces a combinator
 * separates. Parenthesised argument lists are masked first so a combinator
 * inside `:not(…)` cannot split a compound in half.
 */
function compounds(selector: string): string[] {
  const groups: string[] = [];
  const masked = selector.replaceAll(/\([^()]*\)/g, (group) => {
    groups.push(group);
    return `%${String(groups.length - 1)}%`;
  });
  return masked
    .split(/\s*[>+~]\s*|\s+/)
    .filter((part) => part !== '')
    .map((part) =>
      part.replaceAll(/%(\d+)%/g, (_whole, index: string) => groups[Number(index)] ?? ''),
    );
}

/**
 * The compound of `selector` whose SUBJECT is `className`, or `undefined`.
 *
 * Only `:`, `[` and `.` continue the same element — a `-` continues the NAME
 * (`.tai-chip-static` is not `.tai-chip`), and a combinator starts a different
 * element. Reading the whole selector string instead is what let a sibling rule
 * hide: `.tai-chip:not(.tai-chip-static)` names `.tai-chip-static` without
 * saying anything about it.
 */
function compoundNaming(selector: string, className: string): string | undefined {
  return compounds(selector).find(
    (compound) =>
      compound === className ||
      (compound.startsWith(className) && /^[:[.]/.test(compound.slice(className.length))),
  );
}

/** A compound with its `:not()` arguments removed, so a negated state is not read as one. */
function statesOf(compound: string): string {
  return compound.replaceAll(/:not\([^)]*\)/g, '');
}

/** Whether any rule in the sheet fires while `className` itself is in `state`. */
function hasState(className: string, state: RegExp): boolean {
  return sheet.some((rule) =>
    rule.selectors.some((selector) => {
      const compound = compoundNaming(selector, className);
      return compound !== undefined && state.test(statesOf(compound));
    }),
  );
}

/** Every rule that fires while `className` itself is hovered. */
function hoverRules(className: string): Rule[] {
  return sheet.filter((rule) =>
    rule.selectors.some((selector) => {
      const compound = compoundNaming(selector, className);
      return compound !== undefined && statesOf(compound).includes(':hover');
    }),
  );
}

/** The single value the token sheet gives `name`, or `undefined` when it varies. */
function tokenValue(name: string): string | undefined {
  const values = new Set(
    [...tokenSheet.matchAll(new RegExp(String.raw`(?:^|;|\{)\s*${name}\s*:\s*([^;}]+)`, 'g'))].map(
      (match) => (match[1] ?? '').trim(),
    ),
  );
  return values.size === 1 ? [...values][0] : undefined;
}

/** `declaration` as a length in px, resolving one level of `var(--token)`. */
function lengthPx(declaration: string): number | undefined {
  const resolved = declaration.replaceAll(
    /var\(\s*(--[\w-]+)\s*\)/g,
    (whole, name: string) => tokenValue(name) ?? whole,
  );
  const match = /^(-?[\d.]+)(px|rem|em)?$/.exec(resolved.trim());
  if (match === null) return undefined;
  const size = Number(match[1]);
  if (match[2] === undefined) return size === 0 ? 0 : undefined;
  return size * (match[2] === 'px' ? 1 : 16);
}

/** Bare single-class selectors, the universe every derived group is built from. */
const BARE_CLASS = /^\.[\w-]+$/;

function bareClasses(): string[] {
  return [...new Set(sheet.flatMap((rule) => rule.selectors).filter((s) => BARE_CLASS.test(s)))];
}

/** Whether `className` lays its content out in a ROW in any state the sheet declares. */
function isRowFlex(className: string): boolean {
  const displays = declaredValues(className, 'display');
  if (!displays.some((value) => value === 'flex' || value === 'inline-flex')) return false;
  const directions = declaredValues(className, 'flex-direction');
  return directions.length === 0 || directions.some((value) => value !== 'column');
}

/** The one shared focus rule; `focus-ring.test.ts` proves there is exactly one. */
const ringRule = sheet.find((rule) => /outline:\s*2px solid/.test(rule.body));

/** The classes the shared ring keys, with the state they are keyed on removed. */
const RING_BEARERS = new Set(
  (ringRule?.selectors ?? []).map((selector) => selector.replace(/:focus-visible$/, '')),
);

/** Every class the sheet presents as a control: `cursor: pointer` at rest. */
const POINTER_CONTROLS = bareClasses()
  .filter((className) =>
    blocksFor(className).some((rule) => /(?:^|;)\s*cursor\s*:\s*pointer/.test(rule.body)),
  )
  .sort();

/** Every class a keyboard tab stop in this repository's JSX wears. */
const TAB_STOP_CLASSES = new Set(
  tabStopsIn(
    ['packages', 'apps', 'e2e'].flatMap((root) => productSourcesWithin(resolve(repoRoot, root))),
  ).flatMap((stop) => stop.classes),
);

/**
 * Every value `className` is given for `border` or one of its colour-bearing
 * longhands, in sheet order. The shorthand alone misses `border-color` and the
 * per-side spellings, and a boundary drawn in the wrong tier is drawn in the
 * wrong tier whichever property paints it.
 */
function declaredBorders(className: string): string[] {
  return [
    'border',
    'border-color',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
  ].flatMap((property) => declaredValues(className, property));
}

describe('component sheet contract', () => {
  it('reads the sheet as rules, statement at-rules included', () => {
    // Positive controls on the reader. Without them every assertion below could
    // pass vacuously on a parse that found nothing.
    expect(
      readRules(
        '@layer a { .x { color: red } @media (max-width: 639px) { .x, .y { color: blue } } }',
      ),
    ).toEqual([
      { selector: '.x', selectors: ['.x'], body: ' color: red ', context: ['@layer a'] },
      {
        selector: '.x, .y',
        selectors: ['.x', '.y'],
        body: ' color: blue ',
        context: ['@layer a', '@media (max-width: 639px)'],
      },
    ]);
    // A STATEMENT at-rule ends at its semicolon. Without the reset, `@layer a, b;`
    // swallows the rule after it into one at-rule prelude and the rule vanishes.
    expect(readRules('@layer a, b; .x { color: red }').map((rule) => rule.selectors)).toEqual([
      ['.x'],
    ]);
    // …and a compound reader that can see past a `:not()` argument list.
    expect(compounds('.a:not(.b > .c) > .d')).toEqual(['.a:not(.b > .c)', '.d']);
    expect(
      compoundNaming('.tai-chip:not(.tai-chip-static):hover', '.tai-chip-static'),
    ).toBeUndefined();
    expect(compoundNaming('.tai-choice:hover > .tai-checkbox', '.tai-choice')).toBe(
      '.tai-choice:hover',
    );
    expect(statesOf('.tai-btn:hover:not(:disabled)')).toBe('.tai-btn:hover');
    // …and the sheet itself really parsed.
    expect(sheet.length).toBeGreaterThan(150);
    expect(ringRule).toBeDefined();
  });

  describe('the five-state contract', () => {
    /**
     * Every class that presents itself as a control, read off the sheet: it
     * declares `cursor: pointer` at rest. Derived rather than listed, so a new
     * control is inside the contract the moment it is written.
     */
    const INTERACTIVE = bareClasses()
      .filter((className) =>
        blocksFor(className).some((rule) => /(?:^|;)\s*cursor\s*:\s*pointer/.test(rule.body)),
      )
      .sort();

    /**
     * The states a control legitimately cannot carry, with the reason. A blind
     * spot that is enumerated is bounded; one that is implicit is not.
     */
    const STATE_EXEMPT: Readonly<Record<string, Readonly<Record<string, string>>>> = {
      '.tai-choice': {
        unavailable:
          'a <label>, which is not a form control and never matches :disabled; the box it labels carries the disabled rendering, and :has() is below this package browser floor',
        'focus-visible':
          'a <label> is not a tab stop; the box it labels is what takes focus, and that box is in the shared ring',
      },
    };

    it('finds the sheet controls (a set that found nothing would pass vacuously)', () => {
      expect(INTERACTIVE.length).toBeGreaterThanOrEqual(9);
      expect(INTERACTIVE).toContain('.tai-checkbox');
      expect(INTERACTIVE).toContain('.tai-radio');
      expect(INTERACTIVE).toContain('.tai-choice');
    });

    it.each(INTERACTIVE)('%s answers the pointer', (className) => {
      // The state the sheet went without on three controls at once: a checkbox, a
      // radio and the label that is their larger hit target all showed nothing
      // whatever under the pointer.
      expect([className, hasState(className, /:hover/)]).toEqual([className, true]);
    });

    it.each(INTERACTIVE)('%s renders being unavailable', (className) => {
      const exempt = STATE_EXEMPT[className]?.unavailable;
      if (exempt !== undefined) {
        expect([className, exempt.length > 60]).toEqual([className, true]);
        return;
      }
      expect([className, hasState(className, /:disabled|\[aria-disabled|\[data-disabled/)]).toEqual(
        [className, true],
      );
    });

    it.each(INTERACTIVE)('%s takes the one shared focus ring', (className) => {
      const exempt = STATE_EXEMPT[className]?.['focus-visible'];
      if (exempt !== undefined) {
        expect([className, exempt.length > 60]).toEqual([className, true]);
        return;
      }
      expect([className, ringRule?.selectors ?? []]).toEqual([
        className,
        expect.arrayContaining([`${className}:focus-visible`]),
      ]);
    });

    it.each(INTERACTIVE)('%s comes back down if its hover moves it', (className) => {
      // The press state, required exactly where it means something: a control
      // whose hover MOVES it has to have somewhere to return to. Derived from
      // the hover rules themselves, so it can never ask for a press rendering
      // the sheet has no vocabulary for.
      const lifts = hoverRules(className).some((rule) => /(?:^|;)\s*transform\s*:/.test(rule.body));
      expect([className, lifts, lifts ? hasState(className, /:active/) : false]).toEqual([
        className,
        lifts,
        lifts,
      ]);
    });

    it('states a distinct, real reason for every state a control cannot carry', () => {
      const reasons = Object.values(STATE_EXEMPT).flatMap((states) => Object.values(states));
      expect(new Set(reasons).size).toBe(reasons.length);
      // …and no entry is stale: each names a live control and a state of the contract.
      for (const [className, states] of Object.entries(STATE_EXEMPT)) {
        expect([className, INTERACTIVE.includes(className)]).toEqual([className, true]);
        expect([className, Object.keys(states).sort()]).toEqual([
          className,
          expect.arrayContaining([]),
        ]);
        for (const state of Object.keys(states)) {
          expect([className, state, ['unavailable', 'focus-visible'].includes(state)]).toEqual([
            className,
            state,
            true,
          ]);
        }
      }
    });
  });

  describe('shell chrome', () => {
    it('gives a nav item a hover ground that is not the ground it sits on', () => {
      // The defect with no gate at all: `.tai-nav-item:hover` and
      // `.tai-shell-sidebar` both resolved to `var(--tai-color-surface)`, so
      // hovering a nav item in this design system's OWN shell changed nothing.
      // Read as a token comparison, which is the only form a source-level gate
      // can prove: the hover ground may not be any ground this sheet paints
      // chrome or the page with.
      const grounds = new Set(
        [
          ...declaredValues('.tai-shell-sidebar', 'background'),
          ...declaredValues('.tai-shell', 'background'),
          ...declaredValues('.tai-shell-main', 'background'),
          ...declaredValues('.tai-topbar', 'background'),
        ].map((value) => value.trim()),
      );
      expect(grounds.size).toBeGreaterThan(0);
      for (const className of ['.tai-nav-item', '.tai-nav-link']) {
        const hovers = hoverRules(className).flatMap((rule) =>
          declarations(rule.body)
            .filter(([property]) => property === 'background')
            .map(([, value]) => value),
        );
        expect([className, hovers.length]).not.toEqual([className, 0]);
        for (const ground of hovers) {
          expect([className, ground, grounds.has(ground)]).toEqual([className, ground, false]);
        }
      }
    });

    it('leaves the CURRENT nav row answering the pointer as well', () => {
      // The hover ground above is (0,2,0) and `[aria-current='page']` is (0,2,0)
      // too, and it is written LATER — so the cascade handed the current row the
      // resting tint in every state and the one row a reader is standing on was
      // the only row in the rail that did not respond. The remedy has to be a rule
      // the cascade cannot swallow, which means the INTERSECTION of the two
      // states, and it has to come after the rule it beats.
      for (const className of ['.tai-nav-item', '.tai-nav-link']) {
        const current = `${className}[aria-current='page']`;
        const currentIndex = sheet.findIndex((rule) => rule.selectors.includes(current));
        const hoveredIndex = sheet.findIndex((rule) => rule.selectors.includes(`${current}:hover`));
        expect([className, currentIndex >= 0, hoveredIndex > currentIndex]).toEqual([
          className,
          true,
          true,
        ]);
        // It really paints a different ground, and it keeps the accent tint the
        // row is identified by rather than replacing it with the line tone: the
        // tint is translucent, so a tone under it drops `accent-on-tint` below the
        // 4.5:1 the label needs. A second layer of the same token is the step.
        const layers = declaredValues(`${current}:hover`, 'background-image');
        expect([className, layers.length]).toEqual([className, 1]);
        expect([
          className,
          (layers[0] ?? '').match(/var\(--tai-color-accent-tint\)/g)?.length,
        ]).toEqual([className, 2]);
        // …and nothing in that rule replaces the tint underneath it.
        expect(declaredValues(`${current}:hover`, 'background')).toEqual([]);
        expect(declaredValues(`${current}:hover`, 'background-color')).toEqual([]);
        expect(declaredValues(current, 'background')).toEqual(['var(--tai-color-accent-tint)']);
      }
    });

    it('keeps the skip link off screen until it is focused, and then on it', () => {
      // WCAG 2.4.1, and the rule an independent agent deleted outright with five
      // CSS suites green. Both halves: parked above the viewport, and moved back
      // into it by focus alone.
      const parked = declaredValues('.tai-skip-link', 'top');
      const focused = declaredValues('.tai-skip-link:focus', 'top');
      expect(parked).toEqual([expect.stringMatching(/^-/)]);
      expect(focused.length).toBe(1);
      expect(lengthPx(focused[0] ?? '') ?? -1).toBeGreaterThanOrEqual(0);
      // …and it is a link the keyboard can actually reach the ring on.
      expect(ringRule?.selectors ?? []).toContain('.tai-skip-link:focus-visible');
    });

    it('gives the brand lockup the ring every other chrome link takes', () => {
      // `.tai-brand` declares link affordances (`text-decoration: none` over the
      // heading ink) and is the first thing in a sidebar's tab order. It was the
      // one shell-chrome class outside the shared ring.
      expect(declaredValues('.tai-brand', 'text-decoration')).toEqual(['none']);
      expect(ringRule?.selectors ?? []).toContain('.tai-brand:focus-visible');
    });

    it('names the sticky bar height once, so three unlinked rules cannot drift', () => {
      // The bar's own box, the scroll padding that keeps it from covering an
      // element scrolled to by a focus move, and the scroll margin that keeps it
      // from covering an anchor jump. As three bare literals a mutant left 82/82
      // green.
      const references = [...stylesheet.matchAll(/var\(--shell-topbar-height\)/g)];
      expect(references.length).toBe(3);
      expect(declaredValues('.tai-topbar', 'height')).toEqual(['var(--shell-topbar-height)']);
      expect(declaredValues('html', 'scroll-padding-top')).toEqual(['var(--shell-topbar-height)']);
      expect(declaredValues(':target', 'scroll-margin-top')).toEqual([
        'var(--shell-topbar-height)',
      ]);
      // …and no rule keeps a copy of the number.
      const literals = sheet.flatMap((rule) =>
        declarations(rule.body).filter(
          ([property, value]) =>
            /^(height|scroll-padding-top|scroll-margin-top)$/.test(property) &&
            /\b56px\b/.test(value),
        ),
      );
      expect(literals).toEqual([]);
    });

    it('measures every viewport height against the LIVE viewport where the browser can', () => {
      // `vh` is the LARGE viewport, so on a phone with retracting browser chrome a
      // box sized by it is taller than the screen by the height of that chrome.
      // `dvh` is the live value, and the pair is a FALLBACK, not a preference —
      // `dvh` arrived after this package's browser floor (Chrome 108, Firefox
      // 101), so the `vh` line has to come first and stay.
      //
      // DERIVED from the sheet rather than named: with `.tai-shell-sidebar` listed
      // here by hand, `.tai-dialog` capped itself in bare `vh` beside it and ran a
      // modal's own actions row under the URL bar — with no page behind it to
      // scroll the bar away — while this group stayed green.
      const VH_EXEMPT: Readonly<Record<string, string>> = {
        '.tai-select-content max-height':
          'the `60vh` is the FALLBACK inside `var(--radix-select-content-available-height, …)`: Radix measures the space the popper really has and supplies the value, and the 18rem term of the `min()` is the smaller one on any viewport taller than 480 px anyway',
      };
      const usesViewportHeight = sheet.flatMap((rule) =>
        rule.selectors.flatMap((selector) =>
          declarations(rule.body)
            .filter(([, value]) => /\b[\d.]+vh\b/.test(value))
            .map(([property]) => `${selector} ${property}`),
        ),
      );
      expect(usesViewportHeight.length).toBeGreaterThanOrEqual(3);
      for (const site of usesViewportHeight) {
        const reason = VH_EXEMPT[site];
        if (reason !== undefined) {
          expect([site, reason.length > 60]).toEqual([site, true]);
          continue;
        }
        const [selector = '', property = ''] = site.split(' ');
        // The pair, in order: the `vh` line first so a browser under the floor
        // keeps it, the `dvh` line after it so every browser above takes the live
        // value. A lone `dvh` is as wrong as a lone `vh`.
        const values = declaredValues(selector, property);
        expect([site, values.map((value) => /dvh\b/.test(value))]).toEqual([site, [false, true]]);
      }
      // …and the exemption is not stale.
      expect(Object.keys(VH_EXEMPT).filter((site) => !usesViewportHeight.includes(site))).toEqual(
        [],
      );
    });

    it('leaves the rail band declaring only what the base rule does not', () => {
      // Two dead declarations lived here. `align-items: stretch` restated the
      // base column flex's own computed `normal`, and `overflow-wrap: anywhere`
      // restated the base nav rule, which now carries it for every band.
      expect(declaredValues('.tai-shell-sidebar', 'align-items')).toEqual([]);
      const railNav = blocksFor('.tai-shell-sidebar .tai-nav-item');
      expect(railNav.length).toBe(1);
      expect(declaredValues('.tai-shell-sidebar .tai-nav-item', 'overflow-wrap')).toEqual([]);
      expect(declaredValues('.tai-nav-item', 'overflow-wrap')).toEqual(['anywhere']);
    });
  });

  describe('contrast tiers', () => {
    /**
     * The token tiers `tokens.css` publishes as DECORATIVE: below 3:1 by
     * construction, and never the thing that identifies a component or a state.
     */
    const DECORATIVE = ['var(--tai-color-border)', 'var(--tai-color-border-strong)'];

    /**
     * Non-text indicators whose OUTLINE is the whole of what identifies them.
     * They answer no pointer and take no focus, so no derivation from the source
     * reaches them; each says what it draws and is reconciled against the sheet
     * below.
     */
    const NON_TEXT_INDICATORS: Readonly<Record<string, string>> = {
      '.tai-spinner':
        'a busy indicator drawn as a ring and nothing else: the boundary IS the component, at 1.47:1 light and 1.88:1 dark from the decorative tier',
      '.tai-progress-track':
        'the unfilled length of a progress bar, whose boundary is what shows how far the fill has to go against the page ground',
    };

    /**
     * Surfaces whose boundary is DECORATION rather than identification, with the
     * reason. A panel is identified by its ground, its scrim or its shadow; the
     * hairline around it carries no meaning of its own, and WCAG 1.4.11 asks
     * about what identifies a component.
     */
    const DECORATIVE_BOUNDARY: Readonly<Record<string, string>> = {
      '.tai-card':
        'a grouping surface identified by its raised ground: the hairline separates it from the page rather than saying what it is',
      '.tai-code-block':
        'a preformatted block identified by its terminal ground and mono face, with the hairline only closing the box around them',
      '.tai-dialog':
        'a modal panel identified by the scrim behind it and the elevation shadow under it, both of which outrank a one-pixel edge',
      '.tai-drawer':
        'the navigation panel, identified the same way as the modal it shares a Radix root with; its single edge only meets the page',
    };

    /**
     * The classes whose boundary IDENTIFIES them: every interactive surface the
     * sheet and the source agree on, plus the non-text indicators, minus the
     * ones whose boundary is decoration. Derived rather than listed — naming two
     * classes here left the three commonest form controls outside the assertion
     * their own test is named for, and swapping their boundary to the decorative
     * tier changed nothing anywhere in the suite.
     */
    const IDENTIFYING_BOUNDARIES = [
      ...new Set([
        ...RING_BEARERS,
        ...POINTER_CONTROLS,
        ...TAB_STOP_CLASSES,
        ...Object.keys(NON_TEXT_INDICATORS),
      ]),
    ]
      .filter((className) => BARE_CLASS.test(className))
      .filter((className) => declaredBorders(className).length > 0)
      .filter((className) => !(className in DECORATIVE_BOUNDARY))
      .sort();

    /**
     * The FLOATING surfaces with nothing between them and the page: they paint
     * `surface-raised`, which in light IS `bg` (both #ffffff, 1.000:1), so the
     * boundary is the whole of what says where the surface begins. `.tai-dialog`
     * and `.tai-drawer` are out via {@link DECORATIVE_BOUNDARY} — a scrim covers
     * the page behind them, and it outranks a one-pixel edge.
     *
     * Derived from the sheet's own elevation token rather than named: with only
     * the interactive derivation in place, the tooltip and the select popover
     * drew their single edge from a tier `tokens.css` publishes as decorative and
     * nothing anywhere noticed.
     */
    const FLOATING_SURFACES = bareClasses()
      .filter((className) =>
        declaredValues(className, 'box-shadow').some((value) =>
          value.includes('var(--tai-shadow-overlay)'),
        ),
      )
      .filter((className) => !(className in DECORATIVE_BOUNDARY))
      .sort();

    it('derives the floating set from the sheet, both halves of it', () => {
      // Every surface the sheet elevates is judged: the two with a scrim by the
      // decorative-boundary list, the rest by the rule below.
      const elevated = bareClasses().filter((className) =>
        declaredValues(className, 'box-shadow').some((value) =>
          value.includes('var(--tai-shadow-overlay)'),
        ),
      );
      expect(elevated.length).toBeGreaterThanOrEqual(4);
      expect(FLOATING_SURFACES.length).toBeGreaterThanOrEqual(2);
      for (const className of ['.tai-tooltip', '.tai-select-content']) {
        expect([className, FLOATING_SURFACES.includes(className)]).toEqual([className, true]);
      }
      for (const className of ['.tai-dialog', '.tai-drawer']) {
        expect([
          className,
          elevated.includes(className),
          FLOATING_SURFACES.includes(className),
        ]).toEqual([className, true, false]);
      }
    });

    it.each(FLOATING_SURFACES)('%s draws its unscrimmed edge in the control tier', (className) => {
      // Not merely above the decorative tier: the fill matches the ground it
      // floats over, so the edge is the only thing drawn and it is held to the
      // tier the controls use — 4.21:1 light / 3.65:1 dark, against the 1.47:1 /
      // 1.88:1 the decorative tier gives.
      const borders = declaredBorders(className);
      expect([className, borders.length]).not.toEqual([className, 0]);
      for (const border of borders) {
        expect([className, border, border.includes('var(--tai-color-control-border)')]).toEqual([
          className,
          border,
          true,
        ]);
      }
      // …and the fill really is the raised ground, which is what makes the edge
      // the whole of the boundary rather than one signal among several.
      expect([className, declaredValues(className, 'background')]).toEqual([
        className,
        ['var(--tai-color-surface-raised)'],
      ]);
    });

    it('derives a real subject set (one that found nothing would pass vacuously)', () => {
      expect(IDENTIFYING_BOUNDARIES.length).toBeGreaterThanOrEqual(10);
      for (const className of ['.tai-input', '.tai-textarea', '.tai-select-trigger']) {
        expect([className, IDENTIFYING_BOUNDARIES.includes(className)]).toEqual([className, true]);
      }
    });

    it.each(IDENTIFYING_BOUNDARIES)(
      '%s draws its boundary above the decorative tier',
      (className) => {
        // Derived statically from the token hex values, the decorative tier gives
        // 1.47:1 light / 1.88:1 dark on the page ground; the control tier gives
        // 4.21:1 / 3.65:1, which clears the 3:1 that WCAG 1.4.11 asks of a non-text
        // boundary.
        for (const border of declaredBorders(className)) {
          for (const tier of DECORATIVE) {
            expect([className, border, border.includes(tier)]).toEqual([className, border, false]);
          }
        }
      },
    );

    it.each(Object.keys(NON_TEXT_INDICATORS))(
      '%s draws its ring in the control tier',
      (className) => {
        // For an indicator the boundary is not merely above the decorative tier:
        // it is the only thing drawn, so it is held to the tier the controls use.
        const borders = declaredBorders(className);
        expect([className, borders.length]).not.toEqual([className, 0]);
        for (const border of borders) {
          expect([className, border, border.includes('var(--tai-color-control-border)')]).toEqual([
            className,
            border,
            true,
          ]);
        }
      },
    );

    it('leaves neither list describing a boundary the sheet no longer draws', () => {
      const derived = new Set([...RING_BEARERS, ...POINTER_CONTROLS, ...TAB_STOP_CLASSES]);
      for (const [className, reason] of Object.entries(DECORATIVE_BOUNDARY)) {
        // Live in both senses: still a surface the derivation reaches, and still
        // drawing a boundary. An entry for either half gone is fiction.
        expect([className, derived.has(className)]).toEqual([className, true]);
        expect([className, declaredBorders(className).length > 0]).toEqual([className, true]);
        expect([className, reason.length > 60]).toEqual([className, true]);
      }
      for (const [className, reason] of Object.entries(NON_TEXT_INDICATORS)) {
        // …and an indicator that has become interactive is covered by the
        // derivation instead, so its entry here would be a duplicate.
        expect([className, derived.has(className)]).toEqual([className, false]);
        expect([className, reason.length > 60]).toEqual([className, true]);
      }
      const reasons = [
        ...Object.values(DECORATIVE_BOUNDARY),
        ...Object.values(NON_TEXT_INDICATORS),
      ];
      expect(new Set(reasons).size).toBe(reasons.length);
    });

    it('selects with a real pair rather than the near-background tint', () => {
      // Both halves are declared, so a selected run's contrast is on-accent over
      // accent and nothing else: 4.99:1 light (#ffffff on #dc143c) and 5.36:1
      // dark (#0c0e12 on #ed4c67), both derived from the token hex values and
      // both clear of the 4.5:1 body-text floor. The accent TINT it replaced was
      // 1.13:1 / 1.11:1 over body copy.
      expect(declaredValues('::selection', 'background')).toEqual(['var(--tai-color-accent)']);
      expect(declaredValues('::selection', 'color')).toEqual(['var(--tai-color-on-accent)']);
    });
  });

  describe('derived groups the sheet builds by hand', () => {
    it('holds a mark inside a shrinking control at its own size', () => {
      // Set equality against the sheet: every row flex that declares a
      // `min-width` has told the layout it may shrink past its own content, and
      // the text inside it can break where an svg cannot — measured, a 16 px
      // mark came out 11.34 px. Both directions, so adding such a rule forces the
      // svg rule and dropping one reddens.
      const shrinkableRows = bareClasses()
        .filter((className) => isRowFlex(className))
        .filter((className) => declaredValues(className, 'min-width').length > 0)
        .sort();
      const held = sheet
        .filter((rule) => /(?:^|;)\s*flex\s*:\s*none/.test(rule.body))
        .flatMap((rule) => rule.selectors)
        .map((selector) => /^(\.[\w-]+) > svg$/.exec(selector)?.[1])
        .filter((className): className is string => className !== undefined)
        .sort();
      expect(shrinkableRows.length).toBeGreaterThanOrEqual(10);
      expect(held).toEqual(shrinkableRows);
    });

    it('lets a semantic row ground survive the pointer', () => {
      // `.tai-table tbody tr:hover` is (0,1,2) and `.tai-diff-added` is (0,1,0),
      // so a hovered diff row lost its meaning to the accent tint. The exclusion
      // list is reconciled against the sheet's own semantic row grounds, both
      // directions, so a fourth one cannot be added to only one of them.
      const semanticRows = bareClasses()
        .filter((className) => className.startsWith('.tai-diff-'))
        .filter((className) => declaredValues(className, 'background').length > 0)
        .sort();
      const hoverSelector = sheet
        .flatMap((rule) => rule.selectors)
        .find(
          (selector) => selector.startsWith('.tai-table tbody tr') && selector.endsWith(':hover'),
        );
      expect(hoverSelector).toBeDefined();
      const excluded = [...(hoverSelector ?? '').matchAll(/:not\((\.[\w-]+)\)/g)]
        .map((match) => match[1] ?? '')
        .sort();
      expect(semanticRows.length).toBeGreaterThanOrEqual(3);
      expect(excluded).toEqual(semanticRows);
    });

    it('caps every floating surface on the box it actually paints', () => {
      // A cap on the CONTENT box is not a cap: with the default `box-sizing` the
      // padding and boundary sit outside it, and `.tai-tooltip` painted 314 px
      // against its own 288 px cap for a consumer whose host ships no preflight.
      // The group is every surface the sheet caps against the viewport, and it has
      // no exemptions: `.tai-select-content` held one on the grounds that Radix
      // inline-styles `box-sizing` on the element carrying the class, which is a
      // fact about the Radix popper and not about the class — the in-flow
      // suggestion list at `completion-input.tsx` wears the same class on a plain
      // `<ul>` with no Radix near it, as that element's own docblock says. The
      // sheet declares it instead.
      const capped = bareClasses()
        .filter((className) =>
          ['width', 'max-width'].some((property) =>
            declaredValues(className, property).some((value) => value.includes('100vw')),
          ),
        )
        .sort();
      expect(capped.length).toBeGreaterThanOrEqual(4);
      expect(capped).toContain('.tai-select-content');
      for (const className of capped) {
        expect([className, declaredValues(className, 'box-sizing')]).toEqual([
          className,
          ['border-box'],
        ]);
      }
    });

    it('gives the option viewport more room than the ring it must not clip', () => {
      // The padding is what keeps a scrolling ancestor from cutting the shared
      // ring off every option. At exactly the ring's reach it has ZERO slack: the
      // outline width, the offset, or a scrollbar the viewport grows on a long
      // list each reintroduce the clipping with nothing able to see it.
      const outline = ringRule?.body.match(/outline:\s*([\d.]+)px/)?.[1];
      const offset = ringRule?.body.match(/outline-offset:\s*([\d.]+)px/)?.[1];
      expect(outline).toBeDefined();
      expect(offset).toBeDefined();
      const reach = Number(outline) + Number(offset);
      expect(reach).toBeGreaterThan(0);
      for (const property of ['padding', 'scroll-padding']) {
        const values = declaredValues('.tai-select-viewport', property);
        expect([property, values.length]).toEqual([property, 1]);
        const size = lengthPx(values[0] ?? '');
        expect([property, size === undefined]).toEqual([property, false]);
        expect([property, size, (size ?? 0) > reach]).toEqual([property, size, true]);
      }
      // …and the padding lives on the OVERFLOW box, not on its parent.
      expect(declaredValues('.tai-select-content', 'padding')).toEqual([]);
    });

    it('keeps one code surface under its two names', () => {
      // `.tai-prose pre` re-declared eight of `.tai-code-block`'s declarations
      // and had already diverged: a `tab-size` of 8 against 2 rendered the same
      // listing at four times the indent. They are one rule now, and the only
      // declaration they may not share is the margin, because a `<pre>` in prose
      // is placed by `.tai-prose > * + *` and a descendant selector outranks it.
      const shared = sheet.filter(
        (rule) =>
          rule.selectors.includes('.tai-code-block') && rule.selectors.includes('.tai-prose pre'),
      );
      expect(shared.length).toBe(1);
      for (const property of ['box-sizing', 'tab-size', 'padding', 'overflow-x', 'line-height']) {
        expect([property, declaredValues('.tai-prose pre', property)]).toEqual([
          property,
          declaredValues('.tai-code-block', property),
        ]);
      }
      expect(declaredValues('.tai-prose pre', 'margin')).toEqual([]);
      expect(declaredValues('.tai-code-block', 'margin')).toEqual(['0']);
    });

    it('gives the field group the field formatting context itself, not a copy', () => {
      // The copy claimed to reproduce `.tai-field` exactly while carrying a
      // `min-width: 0` that is a measured no-op — the automatic minimum size
      // applies on the MAIN axis, and in a column flex that is the block axis.
      const shared = sheet.filter(
        (rule) =>
          rule.selectors.includes('.tai-field') && rule.selectors.includes('.tai-field-group'),
      );
      expect(shared.length).toBe(1);
      expect(declaredValues('.tai-field-group', 'min-width')).toEqual([]);
    });
  });

  describe('typography and state ordering', () => {
    it('asks for no font feature the shipped faces carry', () => {
      // All thirteen `.woff2` faces were decompressed and their GSUB feature
      // lists read: not one carries a `cvXX` or `ssXX` feature. The Inter latin
      // subset has exactly `calt ccmp dnom frac locl numr pnum tnum`. Naming one
      // selects nothing and reads as a spec being met.
      const declared = sheet.flatMap((rule) =>
        declarations(rule.body).filter(([property]) => property === 'font-feature-settings'),
      );
      expect(declared).toEqual([]);
    });

    it('gives every line box room for the font that sits in it', () => {
      // A unitless `line-height: 1` makes a line box SHORTER than the font's own
      // content area, so consecutive WRAPPED lines overlap — and every control
      // here wraps, which is what `overflow-wrap: anywhere` is for. A control
      // whose text may break anywhere therefore clears 1.2; nothing anywhere in
      // the sheet goes below 1.1.
      for (const rule of sheet) {
        for (const [property, value] of declarations(rule.body)) {
          if (property !== 'line-height') continue;
          const unitless = /^[\d.]+$/.test(value) ? Number(value) : undefined;
          expect([rule.selectors, value, unitless === undefined || unitless >= 1.1]).toEqual([
            rule.selectors,
            value,
            true,
          ]);
        }
      }
      for (const className of bareClasses()) {
        if (!declaredValues(className, 'overflow-wrap').includes('anywhere')) continue;
        for (const value of declaredValues(className, 'line-height')) {
          const unitless = /^[\d.]+$/.test(value) ? Number(value) : undefined;
          expect([className, value, unitless === undefined || unitless >= 1.2]).toEqual([
            className,
            value,
            true,
          ]);
        }
      }
    });

    it('aligns a mark to the first line of a message that wraps', () => {
      // Both of the sheet's icon-plus-message rules make the same call, for the
      // same reason: a centred mark floats between the two lines once the label
      // wraps. It moves the single-line case too — an 18.9 px line box against a
      // 16 px mark, so the mark rises 1.45 px — which is the alignment the
      // wrapped case needs and one line is the wrapped case with one line.
      for (const className of ['.tai-status', '.tai-field-error']) {
        expect([className, declaredValues(className, 'align-items')]).toEqual([
          className,
          ['flex-start'],
        ]);
      }
    });

    it('lets a disabled field read as disabled even while it is invalid', () => {
      // Both rules were (0,2,0) and the invalid one was later, so a control the
      // operator cannot act on wore an error boundary. Disabled wins, and the
      // exclusion is written rather than left to source order — the same call
      // `.tai-checkbox:disabled` makes over its own checked ground.
      for (const className of ['.tai-input', '.tai-textarea', '.tai-select-trigger']) {
        const invalid = sheet
          .flatMap((rule) => rule.selectors)
          .filter((selector) => selector.startsWith(`${className}[aria-invalid`));
        expect([className, invalid.length]).toEqual([className, 1]);
        expect([className, (invalid[0] ?? '').includes(':not(:disabled)')]).toEqual([
          className,
          true,
        ]);
      }
      // …and the checkbox this arithmetic is reconciled with still orders the
      // same way: its disabled rule comes after its checked ground.
      const checkedAt = sheet.findIndex((rule) =>
        rule.selectors.includes(".tai-checkbox[data-state='checked']"),
      );
      const disabledAt = sheet.findIndex((rule) =>
        rule.selectors.includes('.tai-checkbox:disabled'),
      );
      expect(checkedAt).toBeGreaterThanOrEqual(0);
      expect(disabledAt).toBeGreaterThan(checkedAt);
    });

    it('keeps the hover repair that the focused and invalid states depend on', () => {
      // `:not()` carries its argument's specificity, so an unscoped hover rule
      // outranks both the attribute rule and `:focus-visible`: hovering the field
      // being typed in reverted the accent partner border, and hovering an
      // invalid one dropped the error border.
      const hover = sheet
        .flatMap((rule) => rule.selectors)
        .filter((selector) => selector.startsWith('.tai-input') && selector.includes(':hover'));
      expect(hover.length).toBe(1);
      expect(hover[0]).toContain(":not([aria-invalid='true'])");
      expect(hover[0]).toContain(':not(:focus-visible)');
      expect(hover[0]).toContain(':not(:disabled)');
    });

    it('breaks a caller title rather than pushing the document sideways', () => {
      // A page title is a flex item of `.tai-page-header` holding a caller's own
      // string: measured at 320-640 px, a 54-character unbroken one took the
      // document to a scroll width of 734 px.
      expect(declaredValues('.tai-page-title', 'min-width')).toEqual(['0']);
      expect(declaredValues('.tai-page-title', 'overflow-wrap')).toEqual(['anywhere']);
      // …and the block-level caller prose beside it breaks too. `break-word`
      // there and not `anywhere`: a block needs a break when the word does not
      // fit the line, not a collapsed min-content.
      for (const className of [
        '.tai-card-title',
        '.tai-dialog-title',
        '.tai-empty-state-title',
        '.tai-page-description',
        '.tai-section-title',
      ]) {
        expect([className, declaredValues(className, 'overflow-wrap')]).toEqual([
          className,
          ['break-word'],
        ]);
      }
    });
  });
});
