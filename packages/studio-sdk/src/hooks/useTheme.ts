/**
 * `useTheme` — light/dark theme, token-driven. The active theme stamps
 * `data-theme` on the document root, which the DS token layers key off.
 *
 * A three-state PREFERENCE sits behind the resolved theme: `'light'` and
 * `'dark'` pin it, `'system'` follows `prefers-color-scheme` and tracks OS
 * changes live. The resolved `theme` a consumer reads is always the concrete
 * `'light' | 'dark'` the tokens need — never `'system'`.
 *
 * The preference persists to `localStorage`, but ONLY when the operator sets it
 * explicitly (`setPreference` / `setTheme` / `toggle`). Boot READS the stored
 * value; it never WRITES one, so a session that only ever renders the app leaves
 * storage untouched. A `'system'` preference clears any pinned choice and hands
 * the theme back to the OS.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeState {
  /** The resolved theme the tokens key off — always concrete, never `'system'`. */
  readonly theme: Theme;
  /** The operator's choice: a pinned theme, or `'system'` to follow the OS. */
  readonly preference: ThemePreference;
  /** Set the preference and persist it. The only path that writes storage. */
  readonly setPreference: (preference: ThemePreference) => void;
  /** Pin an explicit theme (persists) — a preference shortcut kept for callers. */
  readonly setTheme: (theme: Theme) => void;
  /** Flip between the two pinned themes off the current resolved theme (persists). */
  readonly toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** Where the explicit preference is stored between sessions. */
const STORAGE_KEY = 'tai-studio.theme-preference';

function systemTheme(): Theme {
  try {
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** The persisted preference, or `'system'` when none is stored or storage is
 * unavailable. A READ only — boot never writes, so an untouched session leaves
 * storage alone (the login flows depend on this). */
function readStoredPreference(): ThemePreference {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // No storage (private mode / non-browser) — the OS preference is the default.
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  // The live OS resolution, kept current by the listener below; it only feeds the
  // resolved theme while the preference is `'system'`.
  const [systemResolved, setSystemResolved] = useState<Theme>(systemTheme);
  const theme: Theme = preference === 'system' ? systemResolved : preference;

  useEffect(() => {
    globalThis.document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Track the OS preference live, but ONLY while following it. The same defensive
  // guard as `systemTheme()` — jsdom has no `matchMedia`, so subscribing is
  // best-effort and its absence simply leaves the last resolved value in place.
  useEffect(() => {
    if (preference !== 'system') return;
    let query: MediaQueryList;
    try {
      query = globalThis.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    setSystemResolved(query.matches ? 'dark' : 'light');
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemResolved(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the choice still applies for this session in memory.
    }
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      setPreference(next);
    },
    [setPreference],
  );

  const toggle = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [setPreference, theme]);

  const value = useMemo<ThemeState>(
    () => ({ theme, preference, setPreference, setTheme, toggle }),
    [theme, preference, setPreference, setTheme, toggle],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (state === null) throw new Error('useTheme must be used within a <ThemeProvider>');
  return state;
}
