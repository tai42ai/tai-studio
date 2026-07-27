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

describe('reduced motion', () => {
  it('finds the keyframes and the guard (a scan that found nothing would pass)', () => {
    expect(keyframeNames.length).toBeGreaterThan(0);
    expect(componentsReduced.length).toBeGreaterThan(0);
  });

  it('stops every animation the design system starts', () => {
    // The name may sit anywhere in the `animation` shorthand — `1s linear
    // tai-shimmer` is as valid as `tai-shimmer 1s linear` — and may arrive
    // through `animation-name` instead, so match the whole declaration value.
    const startsOne = (body: string): boolean =>
      keyframeNames.some((name) =>
        new RegExp(`animation(-name)?\\s*:[^;]*\\b${name}\\b`).test(body),
      );

    const stopped = new Set(
      rules(componentsReduced)
        .filter((rule) => /animation:\s*none/.test(rule.body))
        .flatMap((rule) => rule.selectors),
    );

    const running = rules(components)
      .filter((rule) => startsOne(rule.body))
      .flatMap((rule) => rule.selectors)
      .filter((selector) => !stopped.has(selector));

    expect(running).toEqual([]);
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
});
