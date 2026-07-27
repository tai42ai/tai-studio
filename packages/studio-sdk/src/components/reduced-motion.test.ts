/**
 * The reduced-motion contract, asserted from the stylesheets.
 *
 * `prefers-reduced-motion` is a stated accessibility need, and honouring it is
 * all-or-nothing: one keyframe left running, or one duration token left at
 * 250 ms, and the preference is not honoured. jsdom loads no CSS and matches no
 * media query, so the check is source-level — a rendered assertion would see
 * neither the animation nor the guard.
 *
 * EVERY stylesheet the repository publishes or serves is read, DISCOVERED rather
 * than listed. Reading `tokens.css` and `components.css` alone left the shell's
 * own `apps/studio/src/styles.css` — a sheet in this changeset, loaded on every
 * page, and unlayered so it outranks the design system — able to declare a
 * keyframe, a raw-duration transition or a hover lift that no assertion here
 * could see. A sheet that carries no reduced-motion block of its own is still
 * read for OFFENCES; the remedies are unioned across the sheets, so it does not
 * matter which sheet holds the one that covers it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

/** Where a stylesheet that reaches a browser can live. `dist` is build output. */
const SHEET_ROOTS = ['packages', 'apps'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'build']);

/**
 * `source` with every brace inside a quoted value replaced by a space.
 *
 * Everything below parses by counting braces, and a brace is legal inside a CSS
 * string: one `content: '}'` desynchronises the walk from there to the end of
 * the file, so every block after it is read at the wrong depth and the at-rule
 * context each rule reports is wrong. Only the braces are neutralised, at the
 * same offsets — the quotes themselves stay, because a selector like
 * `[data-theme='dark']` is read as written elsewhere.
 */
function neutraliseQuotedBraces(source: string): string {
  let out = '';
  let quote: string | undefined;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    if (quote !== undefined) {
      if (character === '\\') {
        out += source.slice(index, index + 2);
        index += 1;
        continue;
      }
      if (character === quote) quote = undefined;
      out += character === '{' || character === '}' ? ' ' : character;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    out += character;
  }
  return out;
}

/** Stylesheet text as this file parses it: no comments, no brace inside a string. */
function sheetText(source: string): string {
  return neutraliseQuotedBraces(source.replaceAll(/\/\*[\s\S]*?\*\//g, ''));
}

/** Every `.css` file below `directory`, recursively. */
function stylesheetsWithin(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name))
        found.push(...stylesheetsWithin(join(directory, entry.name)));
    } else if (entry.name.endsWith('.css')) {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

/** The text of the block opened at `openIndex`, matched by brace depth. */
function blockAt(source: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}') {
      depth--;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  throw new Error('unterminated block');
}

/**
 * The body of the `prefers-reduced-motion: reduce` query, or `''` when the sheet
 * declares none.
 *
 * The query itself must reach every screen. Nested inside a width band it still
 * parses, still contains every declaration this file asserts, and flattens
 * nothing outside that band — so its own context is checked here rather than
 * left to the per-rule filter, which cannot see a wrapper outside the block it
 * is handed. An ABSENT block is not an error: most sheets start no motion, and
 * the assertions below union the remedies across every sheet.
 */
function reducedMotionBlock(source: string): string {
  const open = source.indexOf('@media (prefers-reduced-motion: reduce)');
  if (open === -1) return '';
  const context = contextAt(source, open);
  if (!appliesAtEveryWidth(context))
    throw new Error(`the reduced-motion query is confined to ${context.join(' > ')}`);
  return blockAt(source, source.indexOf('{', open));
}

interface Rule {
  readonly selectors: string[];
  readonly body: string;
  /** The at-rule preludes this rule is nested inside, outermost first. */
  readonly context: string[];
}

/**
 * The at-rule preludes enclosing `offset`, outermost first.
 *
 * The scraper below matches a selector and a body wherever they appear and, on
 * its own, never asks which at-rule encloses them. That is not a nuance: wrapping
 * this sheet's entire reduce block in
 * `@media (min-width: 2000px)` leaves every rule PRESENT to a context-free
 * scraper while no real screen ever applies it — the whole contract switched off
 * with the gate green. Blocks that are not at-rules are pushed as `''` so the
 * stack stays balanced and a rule nested two levels deep is still reached.
 */
function contextAt(source: string, offset: number): string[] {
  const stack: string[] = [];
  let prelude = '';
  for (let index = 0; index < offset; index++) {
    const character = source[index];
    if (character === '{') {
      const head = prelude.trim();
      prelude = '';
      stack.push(head.startsWith('@') ? head : '');
    } else if (character === '}') {
      stack.pop();
      prelude = '';
    } else {
      prelude += character ?? '';
    }
  }
  return stack.filter((head) => head !== '');
}

/**
 * A media query keyed on viewport WIDTH — a rule that does not apply everywhere.
 *
 * Every spelling CSS accepts, because a rule is banded whichever way the band is
 * written. Matching only `(max-width:`/`(min-width:` — which this did first —
 * left MEDIA QUERIES LEVEL 4 RANGE SYNTAX (`@media (width <= 639px)`,
 * `@media (400px < width)`) unrecognised, so a rule confined to one band was
 * read as applying at every width: the whole reduce block could be banded away
 * above every real screen with this file green.
 */
const WIDTH_CONDITIONED =
  /\(\s*(?:(?:max|min)-width\s*:|width\s*[<>=]|[\d.]+(?:px|r?em|ch|ex|vw|vh|vmin|vmax)\s*[<>=])/;

/** Whether a rule at this context applies at EVERY viewport width. */
function appliesAtEveryWidth(context: readonly string[]): boolean {
  return !context.some((at) => WIDTH_CONDITIONED.test(at));
}

/**
 * Every innermost declaration block in `source` that applies at EVERY viewport
 * width, with its selectors split out. A rule confined to a width band is
 * DROPPED: a reduce block that only exists above 2000 px flattens nothing on any
 * real screen, so counting it would let the guard be banded away silently.
 */
function rules(source: string): Rule[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map((match) => ({
    selectors: (match[1] ?? '').split(',').map((one) => one.trim()),
    body: match[2] ?? '',
    context: contextAt(source, match.index),
  }));
}

/**
 * The rules that apply at EVERY viewport width.
 *
 * This is the right universe for a PRESENCE assertion — "a remedy exists",
 * "something is flattened" — because a rule that only applies above 2000 px is
 * exactly as absent as no rule at all.
 *
 * It is the WRONG universe for an OFFENCE hunt, and the filter used to sit in the
 * reader itself, which silently applied it to both: a banded `outline: none` on a
 * ring bearer, or a banded hover lift, became invisible. A rule that only applies
 * below 640 px is not absent — it is present on every phone, which is the band
 * this sheet spends seventeen rules restyling. Offence scans therefore read the
 * UNFILTERED set and this filter is applied per assertion.
 */
function everywhere<T extends { readonly context: readonly string[] }>(rules: T[]): T[] {
  return rules.filter((rule) => appliesAtEveryWidth(rule.context));
}

interface Sheet {
  /** The path relative to the repository root, for a legible failure. */
  readonly name: string;
  readonly source: string;
  /** This sheet's own reduced-motion block, or `''` when it declares none. */
  readonly reduced: string;
}

/** Every stylesheet the repository publishes or serves, paired with its reduce block. */
const SHEETS: readonly Sheet[] = SHEET_ROOTS.flatMap((root) =>
  stylesheetsWithin(resolve(repoRoot, root)),
)
  .sort()
  .map((path) => {
    const source = sheetText(readFileSync(path, 'utf8'));
    return { name: relative(repoRoot, path), source, reduced: reducedMotionBlock(source) };
  });

/** The sheet at a repo-relative path, or a loud failure if it has moved. */
function sheetNamed(name: string): Sheet {
  const found = SHEETS.find((sheet) => sheet.name === name);
  if (found === undefined) throw new Error(`no ${name} among the scanned stylesheets`);
  return found;
}

const tokens = sheetNamed('packages/studio-sdk/src/components/tokens.css');
const components = sheetNamed('packages/studio-sdk/src/components/components.css');

// Harvested from EVERY sheet: a keyframe declared beside the class that uses it
// is just as real as one in the token file, and would otherwise be invisible here.
const keyframeNames = SHEETS.flatMap((sheet) => [
  ...sheet.source.matchAll(/@keyframes\s+([\w-]+)/g),
])
  .map((match) => match[1])
  .filter((name): name is string => name !== undefined);

/**
 * A transform-family declaration: the `transform` shorthand and the independent
 * `translate` / `scale` / `rotate` longhands.
 *
 * All four are read because they are four different ways to move the same
 * element, and they do not cancel each other: `transform: none` does NOT reset a
 * `translate:` longhand, so a lift written as `translate: 0 -2px` was both
 * invisible to a `transform:`-only reader and unaffected by the flattening rule
 * that reader was checking for. The leading `[^\w-]` keeps `text-transform` out.
 */
const TRANSFORM_DECLARATION = /(?:^|[^\w-])(transform|translate|scale|rotate)\s*:\s*([^;}]+)/g;

/** Whether a transform function's arguments leave the element where it was. */
function isIdentity(fn: string, args: string): boolean {
  const numbers = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  // `scale` rests at 1 and everything else — translate, rotate, skew — rests at 0.
  return fn.startsWith('scale')
    ? numbers.every((number) => number === 1)
    : numbers.every((number) => number === 0);
}

/** Whether a transform-family declaration takes the element off its rest position. */
function movesElement(property: string, value: string): boolean {
  const text = value.trim();
  if (text === 'none') return false;
  // A token-valued transform is opaque to a source scan, so it is treated as
  // motion rather than guessed at: the alternative fails open on one `var()`.
  if (text.includes('var(')) return true;
  if (property !== 'transform') return !isIdentity(property, text);
  return [...text.matchAll(/([a-zA-Z]+)\(([^()]*)\)/g)].some(
    ([, fn, args]) => !isIdentity(fn ?? '', args ?? ''),
  );
}

/** The transform-family properties a body MOVES on, and those it leaves at rest. */
function transformProperties(body: string): { moving: string[]; resting: string[] } {
  const moving: string[] = [];
  const resting: string[] = [];
  for (const [, property, value] of body.matchAll(TRANSFORM_DECLARATION)) {
    (movesElement(property ?? '', value ?? '') ? moving : resting).push(property ?? '');
  }
  return { moving, resting };
}

/**
 * Whether a selector only matches while the element is in some STATE.
 *
 * This is what decides that a movement is MOTION the viewer watches happen,
 * rather than a static layout offset: `.tai-dialog`'s `translate(-50%, -50%)` is
 * where the dialog sits, while anything keyed on a state is a transition into
 * it. The question is asked of the SELECTOR's shape rather than of a list of
 * pseudo-classes — the list read `:hover`, `:focus-within` and `:active` only,
 * so a lift on `:focus-visible`, on `[data-highlighted]` or on
 * `[data-state='open']`, all of which this design system's Radix parts stamp,
 * was never required to be flattened. A pseudo-ELEMENT is not a state, so it is
 * removed first.
 */
function isStateConditioned(selector: string): boolean {
  return /:[\w-]|\[/.test(selector.replaceAll(/::[\w-]+(?:\([^()]*\))?/g, ''));
}

describe('reduced motion', () => {
  it('reads BOTH directions of a width band, and filters only for presence', () => {
    // The two-way control. A rule confined ABOVE every real screen is absent for a
    // PRESENCE assertion; a rule confined to the phone band is present on every
    // phone and must still be caught by an OFFENCE hunt. A reader that filtered
    // for both — which is what closing the first hole did — traded a fail-open in
    // one direction for a fail-open in the other.
    const sample = rules(
      '.a { color: red } @media (min-width: 2000px) { .b { color: red } } @media (max-width: 639px) { .c { color: red } }',
    );
    expect(sample).toHaveLength(3);
    expect(everywhere(sample)).toHaveLength(1);

    // Every spelling of a band, including the range syntax an integer-px pattern
    // never saw. A band it cannot read is a band it reports as applying to every
    // screen, which is a fail-open in the presence direction.
    for (const query of [
      '@media (max-width: 639px)',
      '@media (min-width: 640px)',
      '@media (width <= 639px)',
      '@media (width < 640px)',
      '@media (width >= 40rem)',
      '@media (640px <= width)',
      '@media screen and (max-width: 47.9375em)',
    ]) {
      expect([query, appliesAtEveryWidth([query])]).toEqual([query, false]);
    }
    for (const query of [
      '@media (prefers-reduced-motion: reduce)',
      '@media (pointer: coarse)',
      '@layer tai-components',
      '@supports (height: 100dvh)',
    ]) {
      expect([query, appliesAtEveryWidth([query])]).toEqual([query, true]);
    }
  });

  it('parses a brace inside a quoted value without losing the walk', () => {
    // A brace is legal inside a CSS string. Left in, it desynchronises every
    // brace count from that point on, so each following rule reports the wrong
    // at-rule context — and a banded offence reads as applying everywhere, or an
    // unbanded remedy reads as banded away. The sheets are neutralised on read;
    // this is the control that the neutralising works and changes nothing else.
    const sample = sheetText(
      ".a::after { content: '}' } @media (min-width: 2000px) { .b { color: red } }",
    );
    const parsed = rules(sample);
    expect(parsed.map((rule) => rule.selectors.join())).toEqual(['.a::after', '.b']);
    expect(everywhere(parsed).map((rule) => rule.selectors.join())).toEqual(['.a::after']);
    // The quotes themselves survive, because selectors are read as written.
    expect(sheetText(".x[data-state='open'] { color: red }")).toContain("[data-state='open']");
  });

  it('reads every stylesheet the repository serves, not only the design system', () => {
    // The floor on the widening. A sheet outside this list can declare a
    // keyframe, a raw duration or a hover lift that no assertion here can see.
    const names = SHEETS.map((sheet) => sheet.name);
    expect(names).toContain('packages/studio-sdk/src/components/tokens.css');
    expect(names).toContain('packages/studio-sdk/src/components/components.css');
    expect(names).toContain('apps/studio/src/styles.css');
    expect(names.length).toBeGreaterThanOrEqual(4);
    const empty = SHEETS.filter((sheet) => sheet.source.trim() === '');
    expect(empty.map((sheet) => sheet.name)).toEqual([]);
  });

  it('finds the keyframes and the guard (a scan that found nothing would pass)', () => {
    expect(keyframeNames.length).toBeGreaterThan(0);
    expect(components.reduced.length).toBeGreaterThan(0);
    expect(tokens.reduced.length).toBeGreaterThan(0);
  });

  it('stops every animation the design system starts', () => {
    // The name may sit anywhere in the `animation` shorthand — `1s linear
    // tai-shimmer` is as valid as `tai-shimmer 1s linear` — and may arrive
    // through `animation-name` instead, so match the whole declaration value.
    const startsOne = (body: string): boolean =>
      keyframeNames.some((name) =>
        new RegExp(`animation(-name)?\\s*:[^;]*\\b${name}\\b`).test(body),
      );

    // EVERY sheet, on both sides. The keyframe names are already harvested from
    // all of them, so reading only `components.css` for the animations that USE
    // them left a rule inside `@layer tai-tokens` free to run under `reduce` with
    // this gate green — the token file declares three of the four keyframes, so
    // it is exactly where such a rule would land.
    const stopped = new Set(
      SHEETS.flatMap((sheet) => everywhere(rules(sheet.reduced)))
        .filter((rule) => /animation:\s*none/.test(rule.body))
        .flatMap((rule) => rule.selectors),
    );

    const running = SHEETS.flatMap((sheet) =>
      rules(sheet.source)
        .filter((rule) => startsOne(rule.body))
        .flatMap((rule) => rule.selectors)
        .filter((selector) => !stopped.has(selector))
        .map((selector) => `${sheet.name}: ${selector}`),
    );

    expect(running).toEqual([]);
  });

  it('spells every transition duration as a token, so zeroing them is enough', () => {
    // The rule above zeroes `--tai-motion-fast` / `--tai-motion-base`, which is
    // the whole mechanism — but only for durations WRITTEN as those tokens. A
    // single `transition: transform 800ms ease` bypasses it silently and keeps
    // moving on a page meant to be still, and nothing else here would notice.
    // The reduced block itself is cut out first: `transition: none` is the fix,
    // not a violation.
    const RAW_DURATION = /\b\d+(?:\.\d+)?m?s\b/;
    const raw = SHEETS.flatMap((sheet) =>
      [
        ...(sheet.reduced === '' ? sheet.source : sheet.source.replace(sheet.reduced, '')).matchAll(
          /transition(?:-duration)?\s*:\s*([^;}]+)/g,
        ),
      ]
        .map((match) => match[1] ?? '')
        .filter((value) => RAW_DURATION.test(value))
        .map((value) => `${sheet.name}: ${value.replaceAll(/\s+/g, ' ').trim()}`),
    );
    expect(raw).toEqual([]);

    // Positive controls: the scan has to be able to fire, and must not fire on
    // the token-expressed form every current declaration uses.
    expect(RAW_DURATION.test(' transform 800ms ease')).toBe(true);
    expect(RAW_DURATION.test(' opacity 0.15s ease')).toBe(true);
    expect(RAW_DURATION.test(' background-color var(--tai-motion-fast) ease')).toBe(false);
  });

  it('pins every state-driven movement flat, so nothing moves under the pointer', () => {
    // Guard the guard: `transform: none` is one deletable rule, and losing it
    // leaves the buttons and cards lifting for a reader who asked for stillness.
    // The check is COVERAGE — every selector that MOVES in a state must be named
    // in a reduced block, and named on the SAME property, because the four
    // transform-family properties do not reset one another. A movement the viewer
    // sees HAPPEN is one declared on a state-conditioned selector and travelling
    // a nonzero distance: `.tai-dialog`'s `translate(-50%, -50%)` is layout rather
    // than motion, and `.tai-btn:active`'s `translateY(0)` is the rest position
    // itself.
    const flattened = new Map<string, Set<string>>();
    for (const sheet of SHEETS) {
      for (const rule of everywhere(rules(sheet.reduced))) {
        for (const selector of rule.selectors) {
          const already = flattened.get(selector) ?? new Set<string>();
          for (const property of transformProperties(rule.body).resting) already.add(property);
          flattened.set(selector, already);
        }
      }
    }
    expect(flattened.size).toBeGreaterThan(0);

    const lifting: string[] = [];
    const unflattened: string[] = [];
    for (const sheet of SHEETS) {
      for (const rule of rules(sheet.source)) {
        const { moving } = transformProperties(rule.body);
        if (moving.length === 0) continue;
        for (const selector of rule.selectors.filter(isStateConditioned)) {
          lifting.push(`${sheet.name}: ${selector}`);
          const flat = flattened.get(selector) ?? new Set<string>();
          for (const property of moving.filter((one) => !flat.has(one))) {
            unflattened.push(`${sheet.name}: ${selector} still sets ${property}`);
          }
        }
      }
    }
    // The selection is the whole gate; one that matched nothing would pass.
    expect(lifting.length).toBeGreaterThan(1);
    expect(unflattened).toEqual([]);
  });

  it('reads a movement in every spelling, and a rest position as rest', () => {
    // Positive controls on the decoder. It reads the transform FUNCTIONS rather
    // than the first one that happens to be a `translate(`, and it reads the
    // independent longhands, because each of them moves the element on its own.
    for (const [property, value] of [
      ['transform', 'translateY(-2px)'],
      ['transform', 'scale(1.05)'],
      ['transform', 'rotate(3deg)'],
      ['transform', 'translateY(0) scale(1.05)'],
      ['transform', 'translateY(var(--tai-space-1))'],
      ['translate', '0 -2px'],
      ['scale', '1.05'],
      ['rotate', '3deg'],
    ] as const) {
      expect([property, value, movesElement(property, value)]).toEqual([property, value, true]);
    }
    for (const [property, value] of [
      ['transform', 'none'],
      ['transform', 'translateY(0)'],
      ['transform', 'scale(1)'],
      ['translate', 'none'],
      ['translate', '0 0'],
      ['scale', '1'],
      ['rotate', '0deg'],
    ] as const) {
      expect([property, value, movesElement(property, value)]).toEqual([property, value, false]);
    }
    // …and the property reader must not mistake `text-transform` for a transform.
    expect(transformProperties('text-transform: uppercase;').moving).toEqual([]);
    expect(transformProperties('transform: translateY(-2px); scale: 1.05;').moving).toEqual([
      'transform',
      'scale',
    ]);

    // A state is any condition the element enters, not the three pseudo-classes
    // somebody remembered: every one of these is stamped by a Radix part in this
    // design system, and a lift on one used to be exempt from the whole rule.
    for (const selector of [
      '.tai-btn:hover',
      '.tai-card-interactive:focus-within',
      '.tai-btn:active',
      '.tai-select-item:focus-visible',
      '.tai-select-item[data-highlighted]',
      ".tai-drawer[data-state='open']",
      '.tai-chip:not(:disabled)',
    ]) {
      expect([selector, isStateConditioned(selector)]).toEqual([selector, true]);
    }
    for (const selector of ['.tai-dialog', '.tai-skeleton::after', 'from', 'to', '100%']) {
      expect([selector, isStateConditioned(selector)]).toEqual([selector, false]);
    }
  });

  it('zeroes the published duration tokens, which plugins animate against', () => {
    // The tokens are the only handle a plugin has on the viewer's preference:
    // it writes `transition: … var(--tai-motion-fast)` and cannot read the media
    // query itself, so leaving them at their resting values leaves plugin CSS
    // moving on a page that is meant to be still.
    expect(tokens.reduced).toMatch(/--tai-motion-fast:\s*0ms/);
    expect(tokens.reduced).toMatch(/--tai-motion-base:\s*0ms/);
  });

  it('leaves the parked skeleton a visible block rather than a fade-out', () => {
    // The band is an overlay over a flat block. Two things keep the parked state
    // legible, and each is one deletable declaration: the block underneath must
    // carry a flat tone of its own (a gradient there would half-disappear the
    // moment the sweep stopped), and the overlay must be REMOVED rather than
    // stopped, or the band freezes across the middle of the placeholder.
    const block = rules(components.source).find(
      (rule) => rule.selectors.length === 1 && rule.selectors[0] === '.tai-skeleton',
    );
    expect(block, 'no .tai-skeleton rule in components.css').toBeDefined();
    expect(block?.body).toMatch(/background:\s*var\(--tai-color-[\w-]+\)\s*;/);
    expect(block?.body).not.toContain('gradient');

    const parkedOverlay = rules(components.reduced).find((rule) =>
      rule.selectors.includes('.tai-skeleton::after'),
    );
    expect(
      parkedOverlay,
      'the reduced-motion block never names .tai-skeleton::after',
    ).toBeDefined();
    expect(
      rules(components.reduced)
        .filter((rule) => rule.selectors.includes('.tai-skeleton::after'))
        .map((rule) => rule.body)
        .join(''),
    ).toMatch(/display:\s*none/);
  });

  it('fills the indeterminate track, so a parked bar is not read as a value', () => {
    // The short fill is only legible as "position unknown" while it sweeps.
    // Parked at the left it is a 30 %-wide bar sitting at 30 % — indistinguishable
    // from a determinate reading, which is the "reads as a state it is not"
    // failure this contract exists to prevent. Stopping the animation without
    // widening the fill is therefore a REGRESSION, not a partial fix.
    const fill = rules(components.reduced).find(
      (rule) =>
        rule.selectors.length === 1 && rule.selectors[0] === '.tai-progress-fill-indeterminate',
    );
    expect(fill, 'the reduced-motion block sets no width on the indeterminate fill').toBeDefined();
    expect(fill?.body).toMatch(/width:\s*100%/);
  });

  it('keeps the shimmer a sweep rather than a fade, so stopping it is what changes', () => {
    // The keyframe named here was an opacity pulse once: it dimmed the block
    // without moving the band, so the skeleton read as fading rather than
    // loading. Every check above is satisfied by that defect — it stops an
    // animation just as well — so the sweep itself has to be asserted, or the
    // original bug can be reintroduced under the same name with this suite green.
    const open = tokens.source.indexOf('@keyframes tai-shimmer');
    expect(open).toBeGreaterThan(-1);
    const body = blockAt(tokens.source, tokens.source.indexOf('{', open));
    expect(body).not.toMatch(/opacity\s*:/);

    // A sweep TRAVELS: both stops translate, and to opposite sides, or the band
    // sits still while claiming to move.
    const offsets = [...body.matchAll(/transform:\s*translateX\(\s*(-?\d*\.?\d+)%\s*\)/g)].map(
      (match) => Number(match[1]),
    );
    expect(offsets).toHaveLength(2);
    expect(Math.min(...offsets)).toBeLessThan(0);
    expect(Math.max(...offsets)).toBeGreaterThan(0);
  });

  it('moves the band and not the block, and clips it to the block', () => {
    // `tai-shimmer` translates whatever runs it. Run on `.tai-skeleton` itself
    // the placeholder slides out of its own layout box — the block leaves the
    // page instead of a band crossing it — and every assertion above still
    // passes, because it is still an animation that reduced motion stops. So the
    // three declarations that make the sweep an OVERLAY are pinned here: the
    // animation belongs to a pseudo-element, that pseudo-element is taken out of
    // flow, and the block clips it.
    const runners = rules(components.source)
      .filter((rule) => /animation(-name)?\s*:[^;]*\btai-shimmer\b/.test(rule.body))
      .flatMap((rule) => rule.selectors);
    expect(runners.length).toBeGreaterThan(0);
    expect(runners.filter((selector) => !/::(after|before)$/.test(selector))).toEqual([]);

    const overlay = rules(components.source).find(
      (rule) => rule.selectors.length === 1 && rule.selectors[0] === '.tai-skeleton::after',
    );
    expect(overlay?.body).toMatch(/position:\s*absolute/);

    const block = rules(components.source).find(
      (rule) => rule.selectors.length === 1 && rule.selectors[0] === '.tai-skeleton',
    );
    expect(block?.body).toMatch(/position:\s*relative/);
    expect(block?.body).toMatch(/overflow:\s*hidden/);
  });
});
