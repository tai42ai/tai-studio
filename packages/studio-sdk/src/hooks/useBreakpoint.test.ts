import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useBreakpoint } from './useBreakpoint';
import type { BreakpointState } from './useBreakpoint';

/** The band edges, spelled once here and cross-read against BOTH halves below. */
const BAND_EDGES = [639, 1023, 1279];

const here = dirname(fileURLToPath(import.meta.url));
const hookSource = readFileSync(resolve(here, 'useBreakpoint.ts'), 'utf8');

/**
 * EVERY stylesheet this package publishes, plus the app sheet that imports them.
 *
 * The scan root used to be the single hard-coded `components.css`, so a band
 * declared in `tokens.css`, in `fonts.css` or in the app's own `styles.css` was
 * invisible to all three assertions even spelled honestly — a surface could
 * restyle at a width the hook cannot tell a feature about, with the gate green.
 */
const SHEET_PATHS = [
  '../components/components.css',
  '../components/tokens.css',
  '../components/fonts.css',
  '../../../../apps/studio/src/styles.css',
];
const sheets = SHEET_PATHS.map((path) => ({
  path,
  text: readFileSync(resolve(here, path), 'utf8'),
}));
const stylesheet = sheets[0]?.text ?? '';

/** px per `em`/`rem`, at the root font size these sheets are written against. */
const ROOT_FONT_PX = 16;

/**
 * Every band edge `source` declares, normalised to the MAX-WIDTH px value it
 * implies — however it is spelled.
 *
 * The gate this replaces recognised exactly one spelling,
 * `(max-width: <integer>px)`. A fourth band written `@media (width <= 767px)`
 * (MQ-4 range syntax), `@media (max-width: 47.9375em)` (= 767 px),
 * `@media (max-width: 1023.98px)`, `@media not all and (min-width: 768px)` or a
 * plain `@media (min-width: 900px)` therefore passed all three assertions, and
 * the gate had no `min-width` concept at all. An edge is an edge in whatever
 * unit and whatever comparison direction it is written; a `min-width: N` band
 * declares the edge at `N - 1`, which is the max-width value it partners.
 */
function declaredBandEdges(source: string): number[] {
  const edges: number[] = [];
  const px = (value: string | undefined, unit: string | undefined): number =>
    Number(value) * (unit === 'px' ? 1 : ROOT_FONT_PX);

  for (const [, feature, value, unit] of source.matchAll(
    /\(\s*(max|min)-width\s*:\s*([\d.]+)(px|r?em)\s*\)/g,
  )) {
    const bound = px(value, unit);
    edges.push(feature === 'max' ? bound : bound - 1);
  }
  for (const [, operator, value, unit] of source.matchAll(
    /\(\s*width\s*(<=|<|>=|>)\s*([\d.]+)(px|r?em)\s*\)/g,
  )) {
    const bound = px(value, unit);
    edges.push(operator === '<=' || operator === '>' ? bound : bound - 1);
  }
  // The mirrored range spelling, `(768px <= width)`.
  for (const [, value, unit, operator] of source.matchAll(
    /\(\s*([\d.]+)(px|r?em)\s*(<=|<|>=|>)\s*width\s*\)/g,
  )) {
    const bound = px(value, unit);
    edges.push(operator === '<=' || operator === '<' ? bound - 1 : bound);
  }
  return [...new Set(edges)].sort((a, b) => a - b);
}

/**
 * A `matchMedia` fake that evaluates `(max-width: Npx)` against a viewport width
 * the test controls, and notifies listeners only when a query's match state
 * FLIPS — the contract `useBreakpoint` relies on to re-render per band, not per
 * resize.
 */
class FakeMediaQueryList {
  matches: boolean;
  readonly listeners = new Set<(event: MediaQueryListEvent) => void>();

  constructor(readonly media: string) {
    this.matches = evaluate(media);
  }

  addEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.delete(listener);
  }
}

let viewportWidth = 1440;
let lists: FakeMediaQueryList[] = [];

function evaluate(query: string): boolean {
  const parsed = /\(max-width:\s*(\d+)px\)/.exec(query);
  if (parsed === null) throw new Error(`unexpected media query: ${query}`);
  const [, bound] = parsed;
  if (bound === undefined) throw new Error(`unexpected media query: ${query}`);
  return viewportWidth <= Number(bound);
}

function installMatchMedia(width: number): void {
  viewportWidth = width;
  lists = [];
  globalThis.matchMedia = ((query: string) => {
    const list = new FakeMediaQueryList(query);
    lists.push(list);
    return list;
  }) as unknown as typeof globalThis.matchMedia;
}

function removeMatchMedia(): void {
  Reflect.deleteProperty(globalThis, 'matchMedia');
  Reflect.deleteProperty(globalThis.window, 'matchMedia');
}

function setViewportWidth(width: number): void {
  viewportWidth = width;
  for (const list of lists) {
    const next = evaluate(list.media);
    if (next === list.matches) continue;
    list.matches = next;
    for (const listener of [...list.listeners]) {
      listener({ matches: next, media: list.media } as MediaQueryListEvent);
    }
  }
}

/** Renders the hook and hands back the latest state it produced. */
function renderBreakpoint(): { state: () => BreakpointState; unmount: () => void } {
  let latest: BreakpointState | undefined;
  function Probe() {
    latest = useBreakpoint();
    return null;
  }
  const { unmount } = render(createElement(Probe));
  return {
    state: () => {
      if (latest === undefined) throw new Error('useBreakpoint produced no state');
      return latest;
    },
    unmount,
  };
}

const originalMatchMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');

afterEach(() => {
  removeMatchMedia();
  if (originalMatchMedia !== undefined) {
    Object.defineProperty(globalThis, 'matchMedia', originalMatchMedia);
  }
  lists = [];
});

describe('useBreakpoint', () => {
  it('resolves to the full band when the environment has no matchMedia', () => {
    removeMatchMedia();
    const { state } = renderBreakpoint();
    expect(state()).toEqual({ band: 'full', isPhone: false, isSinglePane: false });
  });

  it.each([
    [375, 'phone', true, true],
    [639, 'phone', true, true],
    [640, 'compact', false, true],
    [1023, 'compact', false, true],
    [1024, 'medium', false, false],
    [1279, 'medium', false, false],
    [1280, 'full', false, false],
    [1920, 'full', false, false],
  ])('reports %ipx as the %s band', (width, band, isPhone, isSinglePane) => {
    installMatchMedia(width);
    const { state } = renderBreakpoint();
    expect(state()).toEqual({ band, isPhone, isSinglePane });
  });

  it('re-renders when a band boundary is crossed', () => {
    installMatchMedia(1440);
    const { state } = renderBreakpoint();
    expect(state().band).toBe('full');

    act(() => {
      setViewportWidth(500);
    });
    expect(state()).toEqual({ band: 'phone', isPhone: true, isSinglePane: true });

    act(() => {
      setViewportWidth(1100);
    });
    expect(state()).toEqual({ band: 'medium', isPhone: false, isSinglePane: false });
  });

  it('subscribes to EVERY boundary, not merely to one of them', () => {
    // `some(...)` is what the unmount test below can afford to ask; it is not
    // enough here. Dropping a boundary from the subscription leaves the hook
    // blind across that edge while every width case above still passes, because
    // those read the band rather than react to a change.
    installMatchMedia(1440);
    const { unmount } = renderBreakpoint();

    const subscribed = lists.filter((list) => list.listeners.size > 0).map((list) => list.media);
    expect([...new Set(subscribed)].sort()).toEqual(
      BAND_EDGES.map((edge) => `(max-width: ${String(edge)}px)`).sort(),
    );

    unmount();
    expect(lists.every((list) => list.listeners.size === 0)).toBe(true);
  });

  it('unsubscribes from every boundary on unmount', () => {
    installMatchMedia(1440);
    const { unmount } = renderBreakpoint();
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.some((list) => list.listeners.size > 0)).toBe(true);

    unmount();
    expect(lists.every((list) => list.listeners.size === 0)).toBe(true);
  });
});

describe('band edges stay in lockstep with the stylesheet', () => {
  // The hook's docblock claims the boundaries are kept in lockstep with the
  // `max-width` media queries in `components.css`. Nothing enforced that: the two
  // halves held three independent copies of 639/1023/1279 and neither read the
  // other, so drifting either side alone left every suite green.

  it('finds the queries it means to compare', () => {
    // A floor against a silently empty scan on any side — a moved file or a
    // reworded query would otherwise make every set empty and equal.
    expect(declaredBandEdges(hookSource).length).toBe(BAND_EDGES.length);
    expect([...stylesheet.matchAll(/@media\s*\(/g)].length).toBeGreaterThanOrEqual(5);
    // …and every sheet named above really was read.
    for (const sheet of sheets) {
      expect([sheet.path, sheet.text.trim() === '']).toEqual([sheet.path, false]);
    }
    expect(sheets).toHaveLength(SHEET_PATHS.length);
  });

  it('declares the same three edges in the hook and in components.css', () => {
    expect(declaredBandEdges(hookSource)).toEqual(BAND_EDGES);
    expect(declaredBandEdges(stylesheet)).toEqual(BAND_EDGES);
  });

  it('lets NO published stylesheet declare any other band edge, in any spelling', () => {
    // Every width-conditioned media query in every sheet that reaches the browser
    // — not only those inside `components.css`'s "Responsive bands" section, and
    // not only those spelled `(max-width: <integer>px)` — must be one of the three
    // the hook reports, or a surface restyles at a width the hook cannot tell a
    // feature about.
    for (const sheet of sheets) {
      const edges = declaredBandEdges(sheet.text);
      const allowed = edges.every((edge) => BAND_EDGES.includes(edge));
      expect([sheet.path, edges, allowed]).toEqual([sheet.path, edges, true]);
    }
    expect(declaredBandEdges(sheets.map((sheet) => sheet.text).join('\n'))).toEqual(BAND_EDGES);
  });

  it('reads a band edge in every spelling a stylesheet can use', () => {
    // Positive controls on the parser itself. Without them a `declaredBandEdges`
    // that matched nothing would leave every assertion above green.
    expect(declaredBandEdges('@media (max-width: 639px) {}')).toEqual([639]);
    // A FRACTIONAL bound is not the integer edge beside it: a 1023.5 px viewport
    // matches `max-width: 1023.98px` and not `max-width: 1023px`, so the hook
    // would report the wrong band. It is reported as itself and fails the
    // reconciliation, rather than being rounded onto a real edge.
    expect(declaredBandEdges('@media (max-width: 1023.98px) {}')).toEqual([1023.98]);
    expect(declaredBandEdges('@media (max-width: 47.9375em) {}')).toEqual([767]);
    expect(declaredBandEdges('@media (width <= 767px) {}')).toEqual([767]);
    expect(declaredBandEdges('@media (width < 768px) {}')).toEqual([767]);
    expect(declaredBandEdges('@media (min-width: 768px) {}')).toEqual([767]);
    expect(declaredBandEdges('@media not all and (min-width: 768px) {}')).toEqual([767]);
    expect(declaredBandEdges('@media (768px <= width) {}')).toEqual([767]);
    expect(declaredBandEdges('@media (width >= 900px) {}')).toEqual([899]);
    // …and a query with no width condition declares no edge.
    expect(declaredBandEdges('@media (prefers-reduced-motion: reduce) {}')).toEqual([]);
    expect(declaredBandEdges('@media (pointer: coarse) {}')).toEqual([]);
  });
});
