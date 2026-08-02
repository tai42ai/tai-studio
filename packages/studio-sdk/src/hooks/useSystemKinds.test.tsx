import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiClient, KindStatus } from '@tai42/api-client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiProvider } from './useApi';
import { AuthProvider, useAuth } from './useAuth';
import { SystemKindsProvider, useFeatureOff, useSystemKinds } from './useSystemKinds';

function kind(over: Partial<KindStatus> = {}): KindStatus {
  return { kind: 'tool_meta', state: 'off', plugin: null, detail: '', ...over };
}

interface Deferred {
  readonly promise: Promise<KindStatus[]>;
  readonly resolve: (value: KindStatus[]) => void;
  readonly reject: (reason: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (value: KindStatus[]) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<KindStatus[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeWrapper(getSystemKinds: ApiClient['getSystemKinds']) {
  const client = { getSystemKinds } as unknown as ApiClient;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider value={client}>
        <AuthProvider>
          <SystemKindsProvider>{children}</SystemKindsProvider>
        </AuthProvider>
      </ApiProvider>
    );
  };
}

function renderProvider(getSystemKinds: ApiClient['getSystemKinds']) {
  return renderHook(
    () => ({ auth: useAuth(), state: useSystemKinds(), toolMetaOff: useFeatureOff('tool_meta') }),
    { wrapper: makeWrapper(getSystemKinds) },
  );
}

describe('useFeatureOff (no provider)', () => {
  it('reads not-off when no SystemKindsProvider is mounted', () => {
    const { result } = renderHook(() => useFeatureOff('tool_meta'));
    expect(result.current).toBe(false);
  });
});

describe('SystemKindsProvider', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear();
  });
  afterEach(() => {
    globalThis.sessionStorage.clear();
  });

  it('stays loading and does not fetch while unauthenticated (every kind not-off)', () => {
    const getSystemKinds = vi.fn();
    const { result } = renderProvider(getSystemKinds);
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(result.current.toolMetaOff).toBe(false);
    expect(getSystemKinds).not.toHaveBeenCalled();
  });

  it('fetches on the auth flip and reports a kind OFF once ready', async () => {
    const d = deferred();
    const getSystemKinds = vi.fn(() => d.promise);
    const { result } = renderProvider(getSystemKinds);

    act(() => {
      result.current.auth.login('k', false);
    });
    // Loading until the table resolves → still not-off (the fail-open default).
    expect(result.current.state.status).toBe('loading');
    expect(result.current.toolMetaOff).toBe(false);
    expect(getSystemKinds).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve([kind({ kind: 'tool_meta', state: 'off' })]);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.toolMetaOff).toBe(true);
  });

  it('reports NOT off for a kind whose state is active or default', async () => {
    const { result } = renderProvider(() =>
      Promise.resolve([
        kind({ kind: 'tool_meta', state: 'active', plugin: 'overlay' }),
        kind({ kind: 'versioning', state: 'default' }),
      ]),
    );
    act(() => {
      result.current.auth.login('k', false);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.toolMetaOff).toBe(false);
  });

  it('reports NOT off for a kind absent from the table', async () => {
    const { result } = renderProvider(() =>
      Promise.resolve([kind({ kind: 'versioning', state: 'off' })]),
    );
    act(() => {
      result.current.auth.login('k', false);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    // `tool_meta` is not in the table → not-off, even though another kind is off.
    expect(result.current.toolMetaOff).toBe(false);
  });

  it('settles into failed QUIETLY on a fetch error, leaving every kind not-off', async () => {
    const d = deferred();
    const { result } = renderProvider(() => d.promise);
    act(() => {
      result.current.auth.login('k', false);
    });
    await act(async () => {
      d.reject(new Error('boom'));
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed');
    });
    // A failed table never hides an affordance — the reactive 501 backstop takes over.
    expect(result.current.toolMetaOff).toBe(false);
  });
});
