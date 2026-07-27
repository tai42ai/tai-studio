/**
 * The reduced-motion contract, asserted from the stylesheets.
 *
 * `prefers-reduced-motion` is a stated accessibility need, and honouring it is
 * all-or-nothing: one keyframe left running, or one duration token left at
 * 250 ms, and the preference is not honoured. jsdom loads no CSS and matches no
 * media query, so the check is source-level — a rendered assertion would see
 * neither the animation nor the guard.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

/** A stylesheet with its comments removed, so a brace inside prose cannot parse. */
function sheet(name: string): string {
  return readFileSync(resolve(here, name), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '');
}

const tokens = sheet('tokens.css');
const components = sheet('components.css');

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

/** The body of the `prefers-reduced-motion: reduce` query, or a loud failure. */
function reducedMotionBlock(source: string): string {
  const open = source.indexOf('@media (prefers-reduced-motion: reduce)');
  if (open === -1) throw new Error('no prefers-reduced-motion query in the stylesheet');
  return blockAt(source, source.indexOf('{', open));
}

interface Rule {
  readonly selectors: string[];
  readonly body: string;
}

/** Every innermost declaration block in `source`, with its selectors split out. */
function rules(source: string): Rule[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map((match) => ({
    selectors: (match[1] ?? '').split(',').map((one) => one.trim()),
    body: match[2] ?? '',
  }));
}

// Harvested from BOTH sheets: a keyframe declared beside the class that uses it
// is just as real as one in the token file, and would otherwise be invisible here.
const keyframeNames = [tokens, components]
  .flatMap((sheet) => [...sheet.matchAll(/@keyframes\s+([\w-]+)/g)])
  .map((match) => match[1])
  .filter((name): name is string => name !== undefined);
const componentsReduced = reducedMotionBlock(components);
const tokensReduced = reducedMotionBlock(tokens);
/** Every sheet, paired with its own reduced-motion block. */
const SHEETS = [
  ['tokens.css', tokens, tokensReduced],
  ['components.css', components, componentsReduced],
] as const;

describe('reduced motion', () => {
  it('finds the keyframes and the guard (a scan that found nothing would pass)', () => {
    expect(keyframeNames.length).toBeGreaterThan(0);
    expect(componentsReduced.length).toBeGreaterThan(0);
    expect(tokensReduced.length).toBeGreaterThan(0);
  });

  it('stops every animation the design system starts', () => {
    // The name may sit anywhere in the `animation` shorthand — `1s linear
    // tai-shimmer` is as valid as `tai-shimmer 1s linear` — and may arrive
    // through `animation-name` instead, so match the whole declaration value.
    const startsOne = (body: string): boolean =>
      keyframeNames.some((name) =>
        new RegExp(`animation(-name)?\\s*:[^;]*\\b${name}\\b`).test(body),
      );

    // BOTH sheets, on both sides. The keyframe names are already harvested from
    // both, so reading only `components.css` for the animations that USE them
    // left a rule inside `@layer tai-tokens` free to run under `reduce` with
    // this gate green — the token file declares three of the four keyframes, so
    // it is exactly where such a rule would land.
    const stopped = new Set(
      SHEETS.flatMap(([, , reduced]) => rules(reduced))
        .filter((rule) => /animation:\s*none/.test(rule.body))
        .flatMap((rule) => rule.selectors),
    );

    const running = SHEETS.flatMap(([name, source]) =>
      rules(source)
        .filter((rule) => startsOne(rule.body))
        .flatMap((rule) => rule.selectors)
        .filter((selector) => !stopped.has(selector))
        .map((selector) => `${name}: ${selector}`),
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
    const raw = SHEETS.flatMap(([name, source, reduced]) =>
      [...source.replace(reduced, '').matchAll(/transition(?:-duration)?\s*:\s*([^;}]+)/g)]
        .map((match) => match[1] ?? '')
        .filter((value) => RAW_DURATION.test(value))
        .map((value) => `${name}: ${value.replaceAll(/\s+/g, ' ').trim()}`),
    );
    expect(raw).toEqual([]);

    // Positive controls: the scan has to be able to fire, and must not fire on
    // the token-expressed form every current declaration uses.
    expect(RAW_DURATION.test(' transform 800ms ease')).toBe(true);
    expect(RAW_DURATION.test(' opacity 0.15s ease')).toBe(true);
    expect(RAW_DURATION.test(' background-color var(--tai-motion-fast) ease')).toBe(false);
  });

  it('pins every hover lift flat, so nothing moves under the pointer', () => {
    // Guard the guard: `transform: none` is one deletable rule, and losing it
    // leaves the buttons and cards lifting for a reader who asked for stillness.
    // The check is COVERAGE — every selector that MOVES must be named in the
    // reduced block. A translate the viewer sees HAPPEN is one declared on an
    // interaction state and travelling a nonzero distance: `.tai-dialog`'s
    // `translate(-50%, -50%)` is layout rather than motion, and `.tai-btn:active`'s
    // `translateY(0)` is the rest position itself.
    const flattened = new Set(
      rules(componentsReduced)
        .filter((rule) => /transform:\s*none/.test(rule.body))
        .flatMap((rule) => rule.selectors),
    );
    expect(flattened.size).toBeGreaterThan(0);

    const moves = (body: string): boolean => {
      const declaration = /transform:\s*(translate[^;]*)/.exec(body);
      if (declaration === null) return false;
      return (declaration[1]?.match(/-?\d*\.?\d+/g) ?? []).some((number) => Number(number) !== 0);
    };
    const lifting = rules(components)
      .filter((rule) => moves(rule.body))
      .flatMap((rule) => rule.selectors)
      .filter((selector) => /:hover|:focus-within|:active/.test(selector));
    // The selection is the whole gate; one that matched nothing would pass.
    expect(lifting.length).toBeGreaterThan(1);

    expect(lifting.filter((selector) => !flattened.has(selector))).toEqual([]);
  });

  it('zeroes the published duration tokens, which plugins animate against', () => {
    // The tokens are the only handle a plugin has on the viewer's preference:
    // it writes `transition: … var(--tai-motion-fast)` and cannot read the media
    // query itself, so leaving them at their resting values leaves plugin CSS
    // moving on a page that is meant to be still.
    const reduced = reducedMotionBlock(tokens);
    expect(reduced).toMatch(/--tai-motion-fast:\s*0ms/);
    expect(reduced).toMatch(/--tai-motion-base:\s*0ms/);
  });

  it('leaves the parked skeleton a visible block rather than a fade-out', () => {
    // Its resting gradient runs to the page ground at one end, so a skeleton
    // frozen mid-sweep half-disappears instead of standing in for content.
    const skeleton = rules(componentsReduced).find(
      (rule) => rule.selectors.length === 1 && rule.selectors[0] === '.tai-skeleton',
    );
    expect(skeleton?.body).toMatch(/background:\s*var\(--tai-color-[\w-]+\)/);
    expect(skeleton?.body).not.toContain('gradient');
  });

  it('fills the indeterminate track, so a parked bar is not read as a value', () => {
    // The short fill is only legible as "position unknown" while it sweeps.
    // Parked at the left it is a 30 %-wide bar sitting at 30 % — indistinguishable
    // from a determinate reading, which is the "reads as a state it is not"
    // failure this contract exists to prevent. Stopping the animation without
    // widening the fill is therefore a REGRESSION, not a partial fix.
    const fill = rules(componentsReduced).find(
      (rule) =>
        rule.selectors.length === 1 && rule.selectors[0] === '.tai-progress-fill-indeterminate',
    );
    expect(fill, 'the reduced-motion block sets no width on the indeterminate fill').toBeDefined();
    expect(fill?.body).toMatch(/width:\s*100%/);
  });

  it('keeps the shimmer a sweep rather than a fade, so stopping it is what changes', () => {
    // The keyframe named here was an opacity pulse once: it dimmed the block
    // without moving the gradient, so the skeleton read as fading rather than
    // loading. Every check above is satisfied by that defect — it stops an
    // animation just as well — so the sweep itself has to be asserted, or the
    // original bug can be reintroduced under the same name with this suite green.
    const open = tokens.indexOf('@keyframes tai-shimmer');
    expect(open).toBeGreaterThan(-1);
    const body = blockAt(tokens, tokens.indexOf('{', open));
    expect(body).toMatch(/background-position\s*:/);
    expect(body).not.toMatch(/opacity\s*:/);
  });
});
