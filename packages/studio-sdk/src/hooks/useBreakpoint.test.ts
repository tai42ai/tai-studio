import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useBreakpoint } from './useBreakpoint';
import type { BreakpointState } from './useBreakpoint';

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

  it('unsubscribes from every boundary on unmount', () => {
    installMatchMedia(1440);
    const { unmount } = renderBreakpoint();
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.some((list) => list.listeners.size > 0)).toBe(true);

    unmount();
    expect(lists.every((list) => list.listeners.size === 0)).toBe(true);
  });
});
