/**
 * The shell's mobile navigation drawer renders the SAME `NavBody` markup the
 * always-mounted sidebar does, so at the phone band two copies of the primary nav
 * can be live at once (sidebar hidden by CSS, drawer open). Two invariants that
 * situation must hold, neither reachable through the jsdom-`full`-band default the
 * other shell suites run under:
 *
 *   1. The section-group header ids stay UNIQUE across the document even when both
 *      copies are mounted — duplicate ids referenced by `aria-labelledby` are a
 *      WCAG 2.1 SC 4.1.1 failure (axe `duplicate-id-aria`).
 *   2. The drawer CLOSES when the viewport leaves the phone band. Its opener — the
 *      top-bar hamburger — is hidden at >=640, so a drawer left open across a widen
 *      is an orphaned modal AND a second VISIBLE "Primary" landmark beside the
 *      re-shown sidebar.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { installServer, renderStudio, server } from './test-harness';

installServer();

/**
 * A viewport-driven `matchMedia` fake — the same contract `useBreakpoint` relies
 * on (notify a query's listeners only when its match state FLIPS). jsdom ships no
 * `matchMedia`, so without this `useBreakpoint` is pinned at the `full` band and
 * the phone-only drawer path is unreachable.
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
  if (parsed?.[1] === undefined) {
    throw new Error(`unexpected media query: ${query}`);
  }
  return viewportWidth <= Number(parsed[1]);
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

const okPlugins = http.get('*/api/plugins', () => HttpResponse.json({ data: [] }));
// The Interactions page mounts a channels-catalog card; an empty list satisfies the
// strict unhandled-request guard while the SSE stream (harness) stays empty.
const okChannels = http.get('*/api/channels', () => HttpResponse.json({ data: { channels: [] } }));

afterEach(() => {
  removeMatchMedia();
  lists = [];
});

describe('the shell navigation drawer', () => {
  it('keeps section-group header ids unique when the drawer is open beside the sidebar', async () => {
    const user = userEvent.setup();
    server.use(okPlugins, okChannels);
    // No matchMedia => `full` band: the sidebar NavBody is mounted; opening the
    // drawer mounts a SECOND NavBody of the same sections in the same document.
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-drawer-ids' });
    await screen.findByRole('navigation', { name: 'Primary' });

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('dialog', { name: 'Navigation' });

    const ids = Array.from(document.querySelectorAll('.tai-nav-section-header')).map((el) => el.id);
    // Both copies are mounted, so there is more than one section header on screen.
    expect(ids.length).toBeGreaterThan(1);
    expect(ids.every((id) => id !== '')).toBe(true);
    // …yet every id is unique — the two copies do not collide.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('closes the drawer when the viewport leaves the phone band', async () => {
    const user = userEvent.setup();
    installMatchMedia(375);
    server.use(okPlugins, okChannels);
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-drawer-band' });

    await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
    expect(await screen.findByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();

    // Widen past the 639px phone edge — the band leaves phone.
    act(() => {
      setViewportWidth(800);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
    });
  });
});
