import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme, type ThemePreference } from './useTheme';

/** The persistence key the provider uses — asserted here so the write contract is
 * pinned. Kept in lockstep with the constant in `useTheme.ts`. */
const STORAGE_KEY = 'tai-studio.theme-preference';

function ThemeConsumer() {
  const { theme, preference, setPreference, toggle } = useTheme();
  return (
    <div>
      <button type="button" data-testid="toggle" onClick={toggle}>
        {theme}
      </button>
      <span data-testid="preference">{preference}</span>
      {(['light', 'dark', 'system'] as const).map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`set-${option}`}
          onClick={() => {
            setPreference(option);
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * A `matchMedia` fake for a single controllable `(prefers-color-scheme: dark)`
 * query: it reports `matches` and notifies its `change` listeners when the test
 * flips the OS preference.
 */
class FakeMediaQueryList {
  matches: boolean;
  readonly media = '(prefers-color-scheme: dark)';
  readonly listeners = new Set<(event: MediaQueryListEvent) => void>();
  constructor(matches: boolean) {
    this.matches = matches;
  }
  addEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    this.listeners.delete(listener);
  }
}

let mediaList: FakeMediaQueryList | null = null;

function installMatchMedia(darkMatches: boolean): void {
  mediaList = new FakeMediaQueryList(darkMatches);
  globalThis.matchMedia = ((_query: string) =>
    mediaList) as unknown as typeof globalThis.matchMedia;
}

/** Flip the OS preference and notify subscribers, inside `act`. */
function setOsDark(dark: boolean): void {
  const list = mediaList;
  if (list === null) throw new Error('installMatchMedia first');
  list.matches = dark;
  act(() => {
    for (const listener of [...list.listeners]) {
      listener({ matches: dark, media: list.media } as MediaQueryListEvent);
    }
  });
}

const originalMatchMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  globalThis.localStorage.clear();
  mediaList = null;
  if (originalMatchMedia) Object.defineProperty(globalThis, 'matchMedia', originalMatchMedia);
  else Reflect.deleteProperty(globalThis, 'matchMedia');
});

describe('useTheme', () => {
  it('stamps data-theme on the root and flips it light<->dark on toggle', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    const root = document.documentElement;
    // jsdom has no matchMedia, so the system default resolves to light.
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(screen.getByTestId('toggle')).toHaveTextContent('light');
    expect(screen.getByTestId('preference')).toHaveTextContent('system');

    await user.click(screen.getByTestId('toggle'));
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('toggle')).toHaveTextContent('dark');
    // Toggling pins an explicit preference off the resolved theme.
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');

    await user.click(screen.getByTestId('toggle'));
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
  });

  it('throws when used outside a ThemeProvider', () => {
    expect(() => render(<ThemeConsumer />)).toThrow(/ThemeProvider/);
  });

  it('boots from the persisted preference without writing storage', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, 'dark');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    // Boot reads the stored value; it must never write one.
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('persists only when the preference is set explicitly', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(setItem).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('set-dark'));
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, 'dark');
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('dark');
    setItem.mockRestore();
  });

  it('follows the OS while preference is "system", and tracks live changes', () => {
    installMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    // Default preference is "system"; the OS currently reports light.
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // The OS flips to dark — a "system" theme tracks it without any user action.
    setOsDark(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    setOsDark(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('stops tracking the OS once an explicit preference pins the theme', async () => {
    installMatchMedia(false);
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    await user.click(screen.getByTestId('set-dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // The listener has been torn down; an OS flip no longer moves a pinned theme.
    expect(mediaList?.listeners.size ?? 0).toBe(0);
    setOsDark(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Returning to "system" re-subscribes and resyncs to the OS.
    await user.click(screen.getByTestId('set-system'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    setOsDark(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

// A compile-time check that the union stays exactly the three documented values.
const _preferences: ThemePreference[] = ['light', 'dark', 'system'];
void _preferences;
