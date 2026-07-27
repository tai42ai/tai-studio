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
 *   letting the content break: a `min-width` that is not the flex default plus
 *   `overflow-wrap: anywhere`, and NOT `white-space: nowrap`, which makes
 *   ordinary prose push the document on its own (`.tai-btn` at 41 characters,
 *   `.tai-badge` at 55).
 *
 *   The `min-width` half is a FLOOR, not the literal `0`. `0` is what most of
 *   these rules write, but `.tai-segment` carries a 28 px / 44 px POINTER
 *   TARGET (WCAG 2.5.8) and deleting that to satisfy a test would trade an
 *   accessibility minimum for a spelling: a floor a small fraction of 320 px
 *   wide already lets the control shrink far below its own content, which is
 *   the whole of what the contract asks. So the assertion below is "declared,
 *   not `auto`, and no larger than the widest pointer target this system
 *   defines" — with a positive check that that target really is a small
 *   fraction of 320 px, so the allowance cannot become the loophole.
 *
 * Accepting `flex-wrap: wrap` on an item rule would therefore turn this gate
 * green with the document still pushing — the false green this revision exists
 * to prevent.
 *
 * The item contract carries a SECOND obligation beside that one — not a third
 * list, deliberately — because the same pair of declarations that saves a
 * caller-sized control on a phone breaks it inside a table. A table cell is not
 * a flex item: auto table layout distributes column
 * width from each column's MIN-CONTENT, and `overflow-wrap: anywhere` — unlike
 * `break-word` — counts toward that min-content. A column holding one of these
 * controls therefore reported a min-content of one character and laid the label
 * out a letter per line; measured, a live 5-column table rendered its "Revoke"
 * button at 6 lines / 99 px at 320 px and still 2 lines at 768 px. The sheet
 * takes the pair back inside `.tai-table`, for EVERY caller-sized item and not
 * only the four a cell holds today — the rest are guard declarations, and the
 * sheet says which is which. The reconciliation below is a set equality against
 * `CALLER_SIZED_ITEMS`, so adding an item forces both rules, and dropping one
 * from either side reddens.
 *
 * What this gate proves about that, exactly: the DECLARATION. jsdom runs no
 * layout, so nothing here can show a column collapsing; the assertions say the
 * sheet still carries the override, in every state that reaches 320 px. The
 * rendered proof — the button's real line count in a real 5-column table at
 * 320, 640 and 768 px — is a browser measurement and belongs to the e2e spec.
 * Neither one substitutes for the other: this file catches the deletion, the
 * browser catches the mechanism changing underneath it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(resolve(here, 'components.css'), 'utf8');
/**
 * The token sheet, read so a floor written as `var(--tai-…)` resolves to the
 * length it actually paints. Without it the min-width assertion below could only
 * compare strings, and `min-width: var(--anything)` would satisfy a floor check
 * by spelling rather than by size.
 */
const tokenSheet = readFileSync(resolve(here, 'tokens.css'), 'utf8');

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
 * EVERY value `selector` is given for `property` by a rule that reaches 320 px,
 * in sheet order.
 *
 * This replaced a reader that returned only the CASCADE WINNER — the last rule
 * that reaches 320 px. That is the right question for one cascade and the wrong
 * one for a SAFETY property, which has to hold in every state a 320 px screen
 * can be in. `@media (pointer: coarse)` carries no width condition, so it
 * reaches 320 px, and it re-declares `.tai-segment`'s `min-width`. That shadowed
 * the base declaration completely: mutating the base 28 px floor to `auto`, and
 * again to 200 px, left every assertion here green while a FINE-pointer 320 px
 * screen took the mutated value. A coarse screen and a fine screen are both
 * reachable at this width, so both have to satisfy the floor.
 *
 * The winner-reader is GONE rather than kept beside this one. Every question the
 * file asks — does this strip wrap, does this item break its text, is this
 * surface capped, is this even a row — is a safety property, so every one of
 * them reads the whole list; leaving both readers in place would only invite the
 * next assertion to pick the convenient one. Where a HIGHER-SPECIFICITY rule
 * genuinely overrides a base rule outright (the `.tai-table` descendant group
 * over the bare classes), that arithmetic is written at the call site, where it
 * can be seen, instead of being hidden in a reader that silently returns a tail.
 *
 * The property name is ANCHORED to the start of a declaration. Un-anchored, a
 * `min-width:` sitting above a `width:` shadows it, and `.tai-dialog { width:
 * 900px }` passed the viewport-cap assertion with a decoy in the same block.
 */
function declaredValues(selector: string, property: string): string[] {
  const pattern = new RegExp(String.raw`(?:^|;)\s*${property}\s*:\s*([^;}]+)`, 'g');
  const values: string[] = [];
  for (const rule of blocksFor(selector)) {
    if (!appliesAtNarrow(rule.context)) continue;
    for (const match of rule.body.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (value !== undefined) values.push(value);
    }
  }
  return values;
}

/**
 * The single value the token sheet gives `name`, or `undefined` when it gives
 * none or more than one. A token redefined per theme (every colour is) has no
 * single value and deliberately does not resolve — only geometry does.
 */
function tokenValue(name: string): string | undefined {
  const values = new Set(
    [...tokenSheet.matchAll(new RegExp(String.raw`(?:^|;|\{)\s*${name}\s*:\s*([^;}]+)`, 'g'))].map(
      (match) => match[1]?.trim(),
    ),
  );
  return values.size === 1 ? [...values][0] : undefined;
}

/**
 * `declaration` as a length in px, resolving one level of `var(--token)`.
 * `undefined` when it is not a plain length — `auto`, a `calc()`, a keyword —
 * which is the answer the callers below want: those are not floors.
 */
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

/**
 * The widest pointer target this system defines — the one legitimate reason a
 * caller-sized control carries a non-zero `min-width` (WCAG 2.5.8). It is the
 * CEILING the item contract allows for that floor, read from the token sheet
 * rather than written here, and asserted below to be a small fraction of 320 px
 * so it cannot quietly grow into a licence to push the document.
 */
const COARSE_TARGET_PX = lengthPx('var(--tai-control-height-coarse)');

/**
 * Whether `selector` lays its content out in a ROW in ANY state reachable at
 * 320 px.
 *
 * "Any", not "after every band", because this predicate builds the universe the
 * classification below reconciles against: a rule that is a row in one reachable
 * state can push the document in that state, so missing it would exempt it
 * silently. `.tai-page-header` is still out — the <640 px band makes it a column
 * and nothing makes it a row again at this width — but it is out because the
 * sheet says so in every state, not because one reading of the cascade said so.
 */
function isRowFlex(selector: string): boolean {
  const displays = declaredValues(selector, 'display');
  if (!displays.some((display) => display === 'flex' || display === 'inline-flex')) return false;
  const directions = declaredValues(selector, 'flex-direction');
  return directions.length === 0 || directions.some((direction) => direction !== 'column');
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
 *
 * The last two arrived by DISPROVING their own exemption reasons, which is why
 * a reason is only ever as good as the measurement behind it:
 *
 * - `.tai-segment` was exempted as "its label is visually hidden — the option IS
 *   its 16 px icon — and it holds a 28 px minimum". Both halves were false.
 *   `visuallyHiddenLabel` is opt-in PER OPTION (`radio-group.tsx`), so the API
 *   default paints the caller's own label beside the icon; and a 28 px floor
 *   constrains the control's own box, not the text inside it. Measured
 *   headless, an unbroken label pushed the document from 43/48/53 characters at
 *   320/360/390 px.
 * - `.tai-select-trigger` was exempted as "width: 100% — it takes its width from
 *   the field, not its content". `width: 100%` sizes the BOX; the
 *   `<RadixSelect.Value>` span inside it (`select.tsx`) still reports its own
 *   min-content. Measured headless, a chosen value pushed the document from
 *   35/41/44 characters at 320/360/390 px.
 *
 * DECLARED LIMIT — the one shape this file does not reach. Membership here is
 * measured rather than derived, because "carries text the repo does not own" is
 * a fact about a component's API, not about its CSS, and no reading of the sheet
 * can decide it. The reconciliation below therefore closes over the sheet's
 * row-flex rules: a new caller-sized control that IS a flex row is forced into
 * one of the three lists and cannot be silently exempt, but one that is NOT a
 * flex row — a block-level control whose caller text is its own overflow — never
 * enters the universe and stays outside the contract entirely. Adding such a
 * control means adding it here by hand. That gap is bounded and stated rather
 * than closed; a gate that cannot see a shape should say so rather than imply
 * coverage it does not have.
 */
const CALLER_SIZED_ITEMS = [
  '.tai-btn',
  '.tai-badge',
  '.tai-chip',
  '.tai-choice',
  '.tai-status',
  '.tai-nav-item',
  '.tai-nav-link',
  '.tai-segment',
  '.tai-select-trigger',
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
  '.tai-select-item': 'lives inside the viewport-capped .tai-select-content popover',
  '.tai-select-item-indicator': 'a bare 16 px mark, flex: none, no text',
  '.tai-brand': 'the product name, a constant this repo owns',
  '.tai-topbar': 'justify-content: space-between over two fixed chrome slots',
  '.tai-icon-btn':
    'a fixed square: width and height are both var(--tai-control-height), and its only content is a 16 px icon',
  '.tai-checkbox':
    'a fixed 1rem box with flex: none; its label is a sibling .tai-choice, not content of its own',
  '.tai-radio':
    'a fixed 1rem box with flex: none; its label is a sibling .tai-choice, not content of its own',
};

/**
 * The `.tai-table` override group, read back off the sheet: every
 * `.tai-table <bare class>` rule that touches `overflow-wrap`, which is the
 * declaration the whole hazard turns on.
 *
 * Derived, never listed. The group has to be EXACTLY `CALLER_SIZED_ITEMS`, and
 * an earlier revision of this gate tried to hold a hand-audited "these ones
 * cannot appear in a table" list beside it instead. That list was accurate the
 * day it was written and still wrong: it is a claim nothing re-checks, so it
 * decays the moment someone adds a call site, and the regression it lets
 * through is the one this file is named after. A guard declaration for a control
 * no cell holds today costs one line of CSS and nothing at runtime. The trade is
 * not close.
 */
function tableOverrideGroup(): string[] {
  const scopedItem = /^\.tai-table\s+(\.[\w-]+)$/;
  return [
    ...new Set(
      sheet
        .filter((rule) => /(?:^|;)\s*overflow-wrap\s*:/.test(rule.body))
        .flatMap((rule) => rule.selectors)
        .map((selector) => scopedItem.exec(selector)?.[1])
        .filter((selector): selector is string => selector !== undefined),
    ),
  ];
}

/**
 * What a caller-sized item's `min-width` really is INSIDE a table.
 *
 * The specificity arithmetic, written where it can be seen: `.tai-table .tai-btn`
 * is a descendant selector and outranks the bare class, and the override group
 * sits in no band, so wherever it declares a floor that floor holds in every
 * state. Only where it declares none does the base rule's own list survive —
 * which is `.tai-segment`, deliberately, because its floor is a pointer target
 * the override must not lower.
 */
function tableFloors(selector: string): string[] {
  const scoped = declaredValues(`.tai-table ${selector}`, 'min-width');
  return scoped.length > 0 ? scoped : declaredValues(selector, 'min-width');
}

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

  it('sees a band as well as the base rule, and keeps BOTH', () => {
    // Two defects in one control. The reader before last read only the FIRST
    // rule per selector, so any `@media` override of a gated selector was
    // invisible and the contract was asserted against the base rule alone. The
    // reader after it read only the LAST, so a band that reaches 320 px hid the
    // base rule instead — which is how `.tai-segment`'s mutated 28 px floor
    // stayed green. `declaredValues` keeps both, in sheet order.
    const banded = rules(
      '.x { flex-wrap: wrap } @media (max-width: 639px) { .x { flex-wrap: nowrap } }',
    );
    const values = banded
      .filter((rule) => rule.selectors.includes('.x'))
      .flatMap((rule) => [...rule.body.matchAll(/(?:^|;)\s*flex-wrap\s*:\s*([^;}]+)/g)])
      .map((match) => match[1]?.trim());
    expect(values).toEqual(['wrap', 'nowrap']);
    // …and the real reader agrees on the real sheet: `.tai-segment`'s floor is
    // declared twice — the base 28 px and the coarse-pointer target — and both
    // reach 320 px.
    expect(declaredValues('.tai-segment', 'min-width')).toHaveLength(2);
  });

  it.each(CONTAINER_STRIPS)('%s wraps or scrolls rather than pushing the document', (selector) => {
    expect([selector, isRowFlex(selector)]).toEqual([selector, true]);
    // Every reachable state, not the cascade winner. A base `flex-wrap: nowrap`
    // that a `@media (pointer: coarse)` band later set back to `wrap` would
    // satisfy a winner-reading while a FINE-pointer 320 px screen still pushed —
    // the same shadowing that hid `.tai-segment`'s base floor from this gate.
    const wraps = declaredValues(selector, 'flex-wrap');
    const scrolls = declaredValues(selector, 'overflow-x');
    const alwaysWraps = wraps.length > 0 && wraps.every((value) => value === 'wrap');
    const alwaysScrolls =
      scrolls.length > 0 && scrolls.every((value) => /^(auto|scroll)$/.test(value));
    expect([selector, alwaysWraps || alwaysScrolls]).toEqual([selector, true]);
  });

  it('holds the pointer-target ceiling well below the narrow viewport', () => {
    // The min-width assertion below allows a floor up to this size. That is only
    // safe while the size is a small fraction of 320 px, so the allowance is
    // measured rather than assumed — and the token really resolved.
    expect(COARSE_TARGET_PX).not.toBeUndefined();
    expect(COARSE_TARGET_PX ?? Infinity).toBeLessThan(NARROW_PX / 4);
  });

  it.each(CALLER_SIZED_ITEMS)('%s breaks its own caller text rather than pushing', (selector) => {
    expect([selector, isRowFlex(selector)]).toEqual([selector, true]);
    // `flex-wrap: wrap` is deliberately NOT accepted here — measured no-op.
    //
    // The floor must be DECLARED (a flex item's default `min-width: auto`
    // refuses to shrink below its own content), must not be `auto` spelled out,
    // and must be a length no wider than a pointer target — `0` for most of
    // these, the 28 px / 44 px hit target for `.tai-segment`, and nothing that
    // could hold the control at a width a 320 px screen cannot pay for. EVERY
    // declaration that reaches this width has to clear it, not just the winner:
    // see `declaredValues`.
    const floors = declaredValues(selector, 'min-width');
    expect([selector, floors.length]).not.toEqual([selector, 0]);
    for (const floor of floors) {
      const size = lengthPx(floor);
      expect([selector, floor, size !== undefined && size <= (COARSE_TARGET_PX ?? 0)]).toEqual([
        selector,
        floor,
        true,
      ]);
    }
    const wraps = declaredValues(selector, 'overflow-wrap');
    expect([selector, wraps.length]).not.toEqual([selector, 0]);
    expect([selector, [...new Set(wraps)]]).toEqual([selector, ['anywhere']]);
    // …and nothing may pin the text back together afterwards.
    expect([selector, declaredValues(selector, 'white-space')]).toEqual([selector, []]);
  });

  it.each(CALLER_SIZED_ITEMS)('%s keeps a non-zero minimum inside a .tai-table', (selector) => {
    const scoped = `.tai-table ${selector}`;
    // The hazard half. `overflow-wrap: anywhere` is what collapses a column's
    // min-content to one character, so inside a table not one reachable state
    // may leave it standing. A missing rule reads as the empty set, so this
    // fails on a DROPPED selector exactly as it fails on a changed value.
    expect([scoped, [...new Set(declaredValues(scoped, 'overflow-wrap'))]]).toEqual([
      scoped,
      ['normal'],
    ]);
    // The floor half, asserted as the EFFECT rather than as a spelling. What the
    // control needs back inside a table is a minimum that is not `0` — the
    // eight that carry `min-width: 0` get it from the group's `auto`, and
    // `.tai-segment` already has it in its own 28 px / 44 px pointer target,
    // which the group deliberately does not overwrite (see the sheet). Reading
    // the effect rather than the literal `auto` is what lets that one rule be
    // right instead of uniform.
    const floors = tableFloors(selector);
    expect([scoped, floors.length]).not.toEqual([scoped, 0]);
    for (const floor of floors) {
      const size = lengthPx(floor);
      expect([scoped, floor, floor === 'auto' || (size !== undefined && size > 0)]).toEqual([
        scoped,
        floor,
        true,
      ]);
    }
    // …and an item that already carries a POINTER TARGET must not have it
    // replaced by the group's `auto`. Which item that is comes from the sheet,
    // not from a list here: it is any whose base floor is a positive length,
    // i.e. `.tai-segment` today. The check above cannot catch this on its own —
    // `auto` resolves during layout, so as a string it satisfies "not zero"
    // while painting roughly 26 px for the icon-only option, below the 28 px
    // WCAG 2.5.8 minimum. Overriding it therefore has to be forbidden outright.
    const baseFloors = declaredValues(selector, 'min-width');
    const carriesPointerTarget =
      baseFloors.length > 0 && baseFloors.every((floor) => (lengthPx(floor) ?? 0) > 0);
    if (carriesPointerTarget) {
      expect([scoped, declaredValues(scoped, 'min-width')]).toEqual([scoped, []]);
    }
  });

  it('gives the .tai-table override group exactly the caller-sized items', () => {
    // The reconciliation the hand-audited exemption list could not do. Both
    // directions: a caller-sized item with no override reddens (the regression
    // this file is named after), and an override for a selector that is not a
    // caller-sized item reddens too (it would mean the two lists have drifted).
    //
    // `.tai-table td`, `.tai-table th` and `.tai-table tbody tr:hover` are
    // outside this universe by construction — the pattern wants a CLASS after
    // the descendant combinator, and those are cells and rows, not controls.
    expect(tableOverrideGroup().sort()).toEqual([...CALLER_SIZED_ITEMS].sort());
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
      [...rowFlex].filter((selector) =>
        declaredValues(selector, 'display').includes('inline-flex'),
      ),
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
    // Read through `declaredValues`, which anchors the property name to the start
    // of a declaration. Un-anchored, a `min-width:` above the `width:` shadowed
    // it and `.tai-dialog { width: 900px }` passed with a decoy in the block.
    //
    // EVERY declaration is checked, for the same reason the item contract checks
    // every one: a band that re-sizes one of these surfaces without re-stating
    // the viewport cap uncaps it in that state, and a winner-reading would only
    // notice if the band happened to be last.
    const declarations = declaredValues(selector, property);
    expect([selector, declarations.length]).not.toEqual([selector, 0]);
    for (const declaration of declarations) {
      expect([
        selector,
        declaration,
        declaration.includes('min(') && declaration.includes('100vw'),
      ]).toEqual([selector, declaration, true]);
    }
  });
});
