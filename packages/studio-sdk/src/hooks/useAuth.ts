/**
 * `useAuth` — the API-key credential, held IN MEMORY by default (lost on reload →
 * re-enter). An explicit "remember on this device" opt-in persists to
 * sessionStorage. localStorage is NEVER written: the README documents the
 * XSS trade-off and why localStorage persistence is not offered.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createElement } from 'react';

const SESSION_KEY = 'tai-studio.apiKey';

export interface AuthState {
  readonly token: string | null;
  readonly isAuthenticated: boolean;
  /** Store the key; `remember` persists to sessionStorage for this device. */
  readonly login: (token: string, remember: boolean) => void;
  readonly logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readSession(): string | null {
  try {
    return globalThis.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seed from sessionStorage (a prior "remember" opt-in) if present.
  const [token, setToken] = useState<string | null>(() => readSession());

  const login = useCallback((next: string, remember: boolean) => {
    setToken(next);
    try {
      if (remember) globalThis.sessionStorage.setItem(SESSION_KEY, next);
      else globalThis.sessionStorage.removeItem(SESSION_KEY);
      // localStorage is intentionally never touched.
    } catch {
      // Storage unavailable (private mode) — the in-memory token still works.
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    try {
      globalThis.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token, isAuthenticated: token !== null, login, logout }),
    [token, login, logout],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (state === null) throw new Error('useAuth must be used within an <AuthProvider>');
  return state;
}
