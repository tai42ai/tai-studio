/**
 * The 320 px contract, asserted from the stylesheet.
 *
 * Every floating surface is capped against the VIEWPORT as well as its own
 * preferred size, so none of them can push the document sideways on the
 * narrowest supported screen (the mission's zero-horizontal-overflow rule at
 * 320 px). The check is source-level because the unit environment is jsdom: it
 * runs no layout and loads no CSS, so a rendered assertion would pass at any
 * width and prove nothing.
 *
 * Floating surfaces are only half of it. An IN-FLOW horizontal strip overflows
 * the document itself, which is the WCAG 1.4.10 failure the contract is written
 * against, and it does so silently: `.tai-tablist` needed 394 px for the five
 * Settings tabs and pushed a document scrollbar at 320, 360 and 390 px while
 * every gate here stayed green, because none of them looked at anything but the
 * three capped popovers.
 *
 * TWO different overflow mechanisms, which is why there are two lists rather
 * than one, and why one remedy does not serve both:
 *
 * - A CONTAINER strip lays several separate items out in a row. Its overflow is
 *   the ITEM ORDER, so `flex-wrap: wrap` (or taking the scroll itself) fixes it.
 * - A caller-sized ITEM — a button, a badge, a chip, a status line — is a leaf
 *   control whose own text is the overflow. `flex-wrap: wrap` is a MEASURED
 *   NO-OP on these: at 320 px `.tai-btn`/`.tai-badge`/`.tai-chip` render
 *   byte-identical geometry with and without it (317 px wide, 333 px scroll
 *   width, both ways), because wrapping the item order cannot break a word.
 *   What fixes them is letting the control shrink below its own content and
 *   letting the content break: `min-width: 0` + `overflow-wrap: anywhere`, and
 *   NOT `white-space: nowrap`, which makes ordinary prose push the document on
 *   its own (`.tai-btn` at 41 characters, `.tai-badge` at 55).
 *
 * Accepting `flex-wrap: wrap` on an item rule would therefore turn this gate
 * green with the document still pushing — the false green this revision exists
 * to prevent.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'components.css'),
  'utf8',
);

interface Rule {
  /** The rule's selector list, split and trimmed. */
  readonly selectors: string[];
  /** The declaration block, without its braces. */
  readonly body: string;
  /** The at-rule preludes this rule is nested inside, outermost first. */
  readonly context: string[];
}

/**
 * Every rule block in the sheet, WITH the at-rule context it sits inside.
 *
 * The reader this replaces was a single un-anchored `.exec` per selector:
 * `new RegExp('\\n\\s*\\' + selector + '\\s*\\{([^}]*)\\}')` — no `g` flag, one
 * match, the FIRST occurrence in the file. `components.css` declares its base
 * rules first and its `@media` bands afterwards, so every later override of a
 * gated selector was invisible and the whole contract was asserted against the
 * base rule alone: appending
 * `@media (max-width: 639px) { .tai-tablist { flex-wrap: nowrap } }` restored
 * the exact defect this file is named after with all thirteen assertions green.
 *
 * A real walk is used rather than a cleverer regex because the two facts that
 * matter — which rules share a selector, and which at-rule each sits in — are
 * both structural. Nesting is tracked to any depth, so a band inside a
 * `@supports` inside a `@layer` is still reached.
 */
function rules(source: string): Rule[] {
  const found: Rule[] = [];
  const context: string[] = [];
  // Comments are removed FIRST: this sheet's rules are introduced by prose
  // docblocks, and a comma inside one would otherwise be read as a selector
  // separator — which silently emptied the classified set rather than failing.
  const text = source.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
  let prelude = '';
  let index = 0;

  while (index < text.length) {
    const character = text[index] ?? '';
    if (character === '{') {
      const head = prelude.trim();
      prelude = '';
      index += 1;
      if (head.startsWith('@')) {
        context.push(head);
        continue;
      }
      // A declaration block: read to its matching close. `components.css`
      // declares no nested rules inside a rule, and a `{` inside a declaration
      // value is not legal CSS, so the first `}` closes it.
      const end = text.indexOf('}', index);
      const close = end === -1 ? text.length : end;
      found.push({
        selectors: head
          .split(',')
          .map((selector) => selector.trim())
          .filter((selector) => selector !== ''),
        body: text.slice(index, close),
        context: [...context],
      });
      index = close + 1;
      continue;
    }
    if (character === '}') {
      context.pop();
      prelude = '';
      index += 1;
      continue;
    }
    prelude += character;
    index += 1;
  }
  return found;
}

const sheet = rules(stylesheet);

/** Every rule block that names `selector` on its own, base rules and bands alike. */
function blocksFor(selector: string): Rule[] {
  return sheet.filter((rule) => rule.selectors.includes(selector));
}

/** The narrowest supported viewport. Every question below is asked AT this width. */
const NARROW_PX = 320;

/**
 * Whether a rule in this at-rule context applies at {@link NARROW_PX}.
 *
 * A band keyed above 320 px is not part of the 320 px contract, and a band keyed
 * below it does not reach it either. Non-width conditions (`pointer: coarse`,
 * `prefers-reduced-motion`) can all hold at 320 px, so they never exclude.
 */
function appliesAtNarrow(context: readonly string[]): boolean {
  for (const at of context) {
    if (!at.startsWith('@media')) continue;
    for (const [, feature, value, unit] of at.matchAll(
      /\(\s*(max|min)-width\s*:\s*([\d.]+)(px|r?em)\s*\)/g,
    )) {
      const bound = Number(value) * (unit === 'px' ? 1 : 16);
      if (feature === 'min' && bound > NARROW_PX) return false;
      if (feature === 'max' && bound < NARROW_PX) return false;
    }
  }
  return true;
}

/**
 * The value `selector` ends up with for `property` AT 320 px, across every rule
 * that names it and reaches that width — the LAST one wins, which is the cascade
 * for a set of equal-specificity bare-class rules in one sheet. `undefined` when
 * none of them declares it.
 *
 * The property name is ANCHORED to the start of a declaration. Un-anchored, a
 * `min-width:` sitting above a `width:` shadows it, and `.tai-dialog { width:
 * 900px }` passed the viewport-cap assertion with a decoy in the same block.
 */
function declaredValue(selector: string, property: string): string | undefined {
  const pattern = new RegExp(String.raw`(?:^|;)\s*${property}\s*:\s*([^;}]+)`, 'g');
  let value: string | undefined;
  for (const rule of blocksFor(selector)) {
    if (!appliesAtNarrow(rule.context)) continue;
    for (const match of rule.body.matchAll(pattern)) value = match[1]?.trim();
  }
  return value;
}

/** Whether `selector` lays its content out in a ROW, after every band. */
function isRowFlex(selector: string): boolean {
  const display = declaredValue(selector, 'display');
  if (display !== 'flex' && display !== 'inline-flex') return false;
  return declaredValue(selector, 'flex-direction') !== 'column';
}

/**
 * CONTAINER strips: rows of several separate caller-sized items. Each must
 * declare `flex-wrap: wrap` (the sheet's convention) or take the overflow itself
 * with `overflow-x`.
 *
 * `.tai-page-header` is deliberately absent: the <640 px band turns it into a
 * COLUMN, so at 320 px it is not a row at all and cannot push. Drop that band
 * and it re-enters the universe below unclassified, which reddens — the
 * classification is derived from the sheet, not asserted about it.
 */
const CONTAINER_STRIPS = [
  '.tai-tablist',
  '.tai-row',
  '.tai-page-actions',
  '.tai-dialog-actions',
  '.tai-drawer-header',
  '.tai-error-state-title',
  '.tai-field-error',
  '.tai-segmented',
];

/**
 * Caller-sized ITEMS: leaf controls carrying text this repo does not own — a
 * server label, a tag, an operator's own string. Each must be able to shrink
 * below its own content and to break that content, and must not pin it with
 * `white-space: nowrap`.
 *
 * The membership of this list is MEASURED, not assumed: each of these was swept
 * in a real browser at 320/360/375/390 px and pushes a document scrollbar —
 * `.tai-btn` at 41 characters of ordinary prose, `.tai-badge` at 55, and
 * `.tai-chip`/`.tai-choice`/`.tai-status`/`.tai-segment`/`.tai-nav-item` on an
 * unbroken token of 34-40 characters.
 */
const CALLER_SIZED_ITEMS = [
  '.tai-btn',
  '.tai-badge',
  '.tai-chip',
  '.tai-choice',
  '.tai-status',
  '.tai-nav-item',
  '.tai-nav-link',
];

/**
 * The flex ROWS that are not caller-sized, each with the reason it cannot push
 * the document. A closed, hand-audited set — the same shape `field-group.test.ts`
 * uses for its expression-child sites, and for the same reason: a blind spot that
 * is enumerated is bounded, a blind spot that is implicit is unbounded.
 *
 * A new row-flex rule lands in NONE of the three lists and reddens the
 * reconciliation below, which is the whole point: it must be classified, never
 * silently exempt.
 */
const NOT_CALLER_SIZED: Readonly<Record<string, string>> = {
  '.tai-select-trigger': 'width: 100% — it takes its width from the field, not its content',
  '.tai-select-item': 'lives inside the viewport-capped .tai-select-content popover',
  '.tai-select-item-indicator': 'a bare 16 px mark, flex: none, no text',
  '.tai-brand': 'the product name, a constant this repo owns',
  '.tai-topbar': 'justify-content: space-between over two fixed chrome slots',
  '.tai-icon-btn':
    'a fixed square: width and height are both var(--tai-control-height), and its only content is a 16 px icon',
  '.tai-segment':
    'its label is visually hidden — the option IS its 16 px icon — and it holds a 28 px minimum, so no caller text sizes it',
  '.tai-checkbox':
    'a fixed 1rem box with flex: none; its label is a sibling .tai-choice, not content of its own',
  '.tai-radio':
    'a fixed 1rem box with flex: none; its label is a sibling .tai-choice, not content of its own',
};

describe('narrow-viewport contract', () => {
  it('reads the sheet as rules, with their at-rule context', () => {
    // Positive controls on the reader itself. Without them every assertion below
    // would pass vacuously on a parse that found nothing.
    const parsed = rules(
      '@layer a { .x { color: red } @media (max-width: 639px) { .x, .y { color: blue } } }',
    );
    expect(parsed.map((rule) => [rule.selectors, rule.context])).toEqual([
      [['.x'], ['@layer a']],
      [
        ['.x', '.y'],
        ['@layer a', '@media (max-width: 639px)'],
      ],
    ]);
    // …and the sheet itself really parsed.
    expect(sheet.length).toBeGreaterThan(150);
    expect(sheet.some((rule) => rule.context.some((at) => at.startsWith('@media')))).toBe(true);
  });

  it('lets a LATER rule win, so a band cannot undo a base declaration', () => {
    // The defect this reader was written for: the old one read only the first
    // rule per selector, so any `@media` override of a gated selector was
    // invisible and the contract was asserted against the base rule alone.
    const banded = rules(
      '.x { flex-wrap: wrap } @media (max-width: 639px) { .x { flex-wrap: nowrap } }',
    );
    const value = banded
      .filter((rule) => rule.selectors.includes('.x'))
      .flatMap((rule) => [...rule.body.matchAll(/(?:^|;)\s*flex-wrap\s*:\s*([^;}]+)/g)])
      .map((match) => match[1]?.trim())
      .at(-1);
    expect(value).toBe('nowrap');
  });

  it.each(CONTAINER_STRIPS)('%s wraps or scrolls rather than pushing the document', (selector) => {
    expect([selector, isRowFlex(selector)]).toEqual([selector, true]);
    const wraps = declaredValue(selector, 'flex-wrap') === 'wrap';
    const scrolls = /^(auto|scroll)$/.test(declaredValue(selector, 'overflow-x') ?? '');
    expect([selector, wraps || scrolls]).toEqual([selector, true]);
  });

  it.each(CALLER_SIZED_ITEMS)('%s breaks its own caller text rather than pushing', (selector) => {
    expect([selector, isRowFlex(selector)]).toEqual([selector, true]);
    // `flex-wrap: wrap` is deliberately NOT accepted here — measured no-op.
    expect([selector, declaredValue(selector, 'min-width')]).toEqual([selector, '0']);
    expect([selector, declaredValue(selector, 'overflow-wrap')]).toEqual([selector, 'anywhere']);
    // …and nothing may pin the text back together afterwards.
    expect([selector, declaredValue(selector, 'white-space')]).toEqual([selector, undefined]);
  });

  it('pins every white-space: nowrap in the sheet to a stated reason', () => {
    // Keying the item contract on the EXACT bare selector left a hole a live
    // sibling rule walks through: `.tai-btn-primary { white-space: nowrap }` is a
    // different selector, so `declaredValue('.tai-btn', …)` never sees it, and it
    // restores the defect on every button with the gate green. `nowrap` is the
    // one declaration that can undo the whole 320 px contract from anywhere in
    // the sheet, so it is allow-listed by name rather than checked per rule.
    const NOWRAP_ALLOWED: Readonly<Record<string, string>> = {
      '.tai-visually-hidden':
        'the standard clip pattern — the text is never painted, so it cannot push anything',
      '.tai-brand-label':
        'the product name, a constant this repo owns and deliberately keeps on one line',
    };
    const nowrap = sheet
      .filter((rule) => /(?:^|;)\s*white-space\s*:\s*nowrap/.test(rule.body))
      .flatMap((rule) => rule.selectors);
    expect(nowrap.filter((selector) => !(selector in NOWRAP_ALLOWED))).toEqual([]);
    // …and the allow-list is not stale: every entry still names a live rule.
    expect(Object.keys(NOWRAP_ALLOWED).filter((selector) => !nowrap.includes(selector))).toEqual(
      [],
    );
  });

  it('classifies every horizontal strip the sheet declares, in BOTH directions', () => {
    // The floor against the LIST going stale — the exact way the floating-surface
    // triple missed `.tai-select-content`. This is a set EQUALITY, so an
    // unclassified row fails.
    //
    // The sweep this replaces read `/\n\s*(\.[\w-]+)\s*\{([^}]*)\}/` and matched
    // `display:\s*flex`, so it saw 14 of the sheet's row-flex rules and was blind
    // to the rest: every `display: inline-flex` rule (`.tai-btn` `.tai-icon-btn`
    // `.tai-choice` `.tai-segmented` `.tai-segment` `.tai-chip` `.tai-badge`
    // `.tai-status`) and every non-LAST member of a comma group (`.tai-nav-item`,
    // `.tai-checkbox`). The set equality was green because both sides were
    // computed from the same blind spot.
    const bareClass = /^\.[\w-]+$/;
    const rowFlex = new Set(
      sheet
        .flatMap((rule) => rule.selectors)
        .filter((selector) => bareClass.test(selector))
        .filter((selector) => isRowFlex(selector)),
    );

    const classified = [
      ...CONTAINER_STRIPS,
      ...CALLER_SIZED_ITEMS,
      ...Object.keys(NOT_CALLER_SIZED),
    ];
    expect([...rowFlex].sort()).toEqual([...new Set(classified)].sort());
    // …and the sweep really reaches the sheet's flex rows, in both spellings.
    expect(rowFlex.size).toBeGreaterThanOrEqual(20);
    expect(
      [...rowFlex].filter((selector) => declaredValue(selector, 'display') === 'inline-flex'),
    ).not.toHaveLength(0);
  });

  it('gives every exemption a stated, distinct reason rather than a bare name', () => {
    const reasons = Object.values(NOT_CALLER_SIZED);
    for (const [selector, reason] of Object.entries(NOT_CALLER_SIZED)) {
      // A floor that can actually trip: the shortest reason here is 37
      // characters, so a name-shaped placeholder fails rather than passing.
      expect([selector, reason.length > 35]).toEqual([selector, true]);
    }
    // A reason copied from a sibling explains nothing about THIS rule. The two
    // 1rem boxes are the one deliberate pair, and they are checked as a pair.
    expect(new Set(reasons).size).toBe(reasons.length - 1);
    expect(NOT_CALLER_SIZED['.tai-checkbox']).toBe(NOT_CALLER_SIZED['.tai-radio']);
  });

  it.each([
    ['.tai-dialog', 'width'],
    ['.tai-drawer', 'width'],
    ['.tai-tooltip', 'max-width'],
  ])('caps %s against the viewport, not just its own size', (selector, property) => {
    // Read through `declaredValue`, which anchors the property name to the start
    // of a declaration. Un-anchored, a `min-width:` above the `width:` shadowed
    // it and `.tai-dialog { width: 900px }` passed with a decoy in the block.
    const declaration = declaredValue(selector, property);
    expect([selector, declaration]).not.toEqual([selector, undefined]);
    expect(declaration).toContain('min(');
    expect(declaration).toContain('100vw');
  });
});
