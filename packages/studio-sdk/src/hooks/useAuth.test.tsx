import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './useAuth';

const SESSION_KEY = 'tai-studio.apiKey';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// Node 22's own (unavailable) localStorage global shadows jsdom's, so it is
// undefined here. Stub a spyable one: the XSS pin asserts `setItem` is NEVER
// called — the credential must never reach localStorage.
const localStorageSetItem = vi.fn();

beforeEach(() => {
  globalThis.sessionStorage.clear();
  localStorageSetItem.mockClear();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: localStorageSetItem,
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAuth', () => {
  it('holds no token by default', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('login without remember stays in memory and does NOT persist', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login('secret', false);
    });
    expect(result.current.token).toBe('secret');
    expect(result.current.isAuthenticated).toBe(true);
    expect(globalThis.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorageSetItem).not.toHaveBeenCalled();
  });

  it('login with remember persists to sessionStorage and survives a re-mount', () => {
    const first = renderHook(() => useAuth(), { wrapper });
    act(() => {
      first.result.current.login('remembered', true);
    });
    expect(globalThis.sessionStorage.getItem(SESSION_KEY)).toBe('remembered');
    first.unmount();

    // A fresh mount seeds from sessionStorage.
    const second = renderHook(() => useAuth(), { wrapper });
    expect(second.result.current.token).toBe('remembered');
    expect(localStorageSetItem).not.toHaveBeenCalled();
  });

  it('logout clears the token and the session copy', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login('remembered', true);
    });
    act(() => {
      result.current.logout();
    });
    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(globalThis.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorageSetItem).not.toHaveBeenCalled();
  });
});
