/**
 * `useTheme` — light/dark theme, token-driven. The active theme stamps
 * `data-theme` on the document root, which the DS token layers key off. Dark
 * mode is required; the default follows `prefers-color-scheme`.
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

export interface ThemeState {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
  readonly toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function systemTheme(): Theme {
  try {
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => systemTheme());

  useEffect(() => {
    globalThis.document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);
  const value = useMemo<ThemeState>(() => ({ theme, setTheme, toggle }), [theme, toggle]);

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (state === null) throw new Error('useTheme must be used within a <ThemeProvider>');
  return state;
}
