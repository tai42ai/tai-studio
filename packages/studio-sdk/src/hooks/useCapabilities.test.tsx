import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiClient, MeProjection } from '@tai42/api-client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiProvider } from './useApi';
import { AuthProvider, useAuth } from './useAuth';
import { UnauthorizedProvider } from './useUnauthorized';
import {
  CapabilityProvider,
  coversAnyRoute,
  coversRoute,
  coversWrite,
  isFullProjection,
  useCanWrite,
  useCapabilities,
} from './useCapabilities';

function projection(overrides: Partial<MeProjection> = {}): MeProjection {
  return {
    user_id: 'u',
    owner_user_id: null,
    admin: false,
    scopes: [],
    routes: [],
    route_patterns: [],
    sub_mcp: [],
    tools: [],
    agents: [],
    mintable: false,
    ...overrides,
  };
}

// -- isFullProjection --------------------------------------------------------

describe('isFullProjection', () => {
  it('is true ONLY when admin === true (the total/admin projection)', () => {
    expect(isFullProjection(projection({ admin: true }))).toBe(true);
    expect(isFullProjection(projection({ admin: false }))).toBe(false);
  });

  it('is false for a scoped session that carries ["*"] scopes but a jq fence', () => {
    // A seeded editor/viewer holds `["*"]` scopes PLUS a jq condition, so `admin`
    // is false and it is SCOPED — keying on `"*"` scopes would wrongly hand it the
    // unfiltered nav.
    expect(isFullProjection(projection({ admin: false, scopes: ['*'] }))).toBe(false);
  });

  it('is true for the gate-off synthetic projection (admin, empty routes)', () => {
    expect(isFullProjection(projection({ admin: true, scopes: ['*'], routes: [] }))).toBe(true);
  });
});

// -- coversAnyRoute ----------------------------------------------------------

describe('coversAnyRoute — concrete routes', () => {
  const p = projection({
    routes: [
      { path: '/api/tools', methods: ['GET'] },
      { path: '/api/tools/tags', methods: ['GET'] },
    ],
  });

  it('covers a prefix a concrete route starts with', () => {
    expect(coversAnyRoute(p, ['/api/tools'])).toBe(true);
  });

  it('covers a parent prefix via startsWith (a nested route counts)', () => {
    expect(
      coversAnyRoute(projection({ routes: [{ path: '/api/tools/tags', methods: ['GET'] }] }), [
        '/api/tools',
      ]),
    ).toBe(true);
  });

  it('does not cover an unrelated prefix', () => {
    expect(coversAnyRoute(p, ['/api/agents'])).toBe(false);
  });

  it('matches on a segment boundary: a sibling route does NOT satisfy a shorter token', () => {
    // `/api/tools-schema` is a real sibling of the `/api/tools` surface — a bare
    // `startsWith` would wrongly let it satisfy the `/api/tools` token.
    const sibling = projection({ routes: [{ path: '/api/tools-schema', methods: ['GET'] }] });
    expect(coversAnyRoute(sibling, ['/api/tools'])).toBe(false);
    // The exact route and a true nested descendant still count.
    expect(coversAnyRoute(sibling, ['/api/tools-schema'])).toBe(true);
    expect(
      coversAnyRoute(projection({ routes: [{ path: '/api/tools', methods: ['GET'] }] }), [
        '/api/tools',
      ]),
    ).toBe(true);
  });

  it('is anyOf across the prefixes (one hit is enough)', () => {
    expect(coversAnyRoute(p, ['/api/agents', '/api/tools'])).toBe(true);
  });

  it('is false for an empty prefix list', () => {
    expect(coversAnyRoute(p, [])).toBe(false);
  });
});

describe('coversAnyRoute — dynamic patterns', () => {
  const p = projection({ route_patterns: [{ pattern: '^/app/slug/.*$', scope_id: 'app' }] });

  it('covers a prefix the open-wildcard literal starts with', () => {
    expect(coversAnyRoute(p, ['/app/slug'])).toBe(true);
    expect(coversAnyRoute(p, ['/app'])).toBe(true);
  });

  it('covers a deeper prefix that lives under the pattern (prefix starts with literal)', () => {
    expect(coversAnyRoute(p, ['/app/slug/deep'])).toBe(true);
  });

  it('does not cover an unrelated prefix', () => {
    expect(coversAnyRoute(p, ['/other'])).toBe(false);
  });

  it('conservatively declines a complex (alternation) pattern — under-showing is safe', () => {
    const complex = projection({ route_patterns: [{ pattern: '^/app/(a|b)$', scope_id: 'app' }] });
    expect(coversAnyRoute(complex, ['/app'])).toBe(false);
  });

  it('conservatively declines a non-anchored pattern', () => {
    const loose = projection({ route_patterns: [{ pattern: '/app/.*', scope_id: 'app' }] });
    expect(coversAnyRoute(loose, ['/app'])).toBe(false);
  });

  it('conservatively declines a bare literal with no open wildcard tail', () => {
    const exact = projection({ route_patterns: [{ pattern: '^/app/slug$', scope_id: 'app' }] });
    expect(coversAnyRoute(exact, ['/app/slug'])).toBe(false);
  });
});

// -- coversRoute (method-aware write gate) -----------------------------------

describe('coversRoute', () => {
  it('covers an exact path whose admitted methods include the required method', () => {
    const p = projection({ routes: [{ path: '/api/presets', methods: ['GET', 'POST'] }] });
    expect(coversRoute(p, '/api/presets', 'POST')).toBe(true);
  });

  it('does NOT cover a path whose methods lack the required one (a read-only route)', () => {
    // A VIEWER's jq fence admits only GET/HEAD/OPTIONS on the route; the write gate
    // must reject it even though the path is present.
    const p = projection({ routes: [{ path: '/api/presets', methods: ['GET'] }] });
    expect(coversRoute(p, '/api/presets', 'POST')).toBe(false);
  });

  it('does NOT cover an absent path', () => {
    const p = projection({ routes: [{ path: '/api/agents', methods: ['GET', 'POST'] }] });
    expect(coversRoute(p, '/api/presets', 'POST')).toBe(false);
  });

  it('requires an EXACT path — a nested write route does not satisfy the collection path', () => {
    // `POST /api/presets/foo/rollback` is a different endpoint from `POST /api/presets`;
    // a write gate must not conflate them, so path matching is exact (never a prefix).
    const p = projection({ routes: [{ path: '/api/presets/foo/rollback', methods: ['POST'] }] });
    expect(coversRoute(p, '/api/presets', 'POST')).toBe(false);
  });

  it('does NOT special-case the total (admin) projection — callers short-circuit isFullProjection', () => {
    // The synthetic total projection carries no concrete `routes`, so this pure
    // route+method primitive returns false; the isFullProjection short-circuit in the
    // caller is what shows the action for an admin session.
    const admin = projection({ admin: true, scopes: ['*'], routes: [] });
    expect(coversRoute(admin, '/api/presets', 'POST')).toBe(false);
    expect(isFullProjection(admin)).toBe(true);
  });
});

// -- coversWrite (fail-closed, method-aware write gate) ----------------------

describe('coversWrite', () => {
  it('is true for a full (admin) projection', () => {
    const state = { status: 'ready', projection: projection({ admin: true }) } as const;
    expect(coversWrite(state, '/api/presets', 'POST')).toBe(true);
  });

  it('is true for a scoped projection that reaches the write method', () => {
    const state = {
      status: 'ready',
      projection: projection({ routes: [{ path: '/api/presets', methods: ['GET', 'POST'] }] }),
    } as const;
    expect(coversWrite(state, '/api/presets', 'POST')).toBe(true);
  });

  it('is false for a scoped projection that reaches the path but not the method', () => {
    const state = {
      status: 'ready',
      projection: projection({ routes: [{ path: '/api/presets', methods: ['GET'] }] }),
    } as const;
    expect(coversWrite(state, '/api/presets', 'POST')).toBe(false);
  });

  it('is false for a dynamic (templated) write route the projection cannot express', () => {
    const state = {
      status: 'ready',
      projection: projection({
        route_patterns: [{ pattern: '^/api/presets/.*$', scope_id: 's' }],
      }),
    } as const;
    expect(coversWrite(state, '/api/presets/{name}', 'DELETE')).toBe(false);
  });

  it('FAILS CLOSED while loading — no write control enables before the gate is known', () => {
    expect(coversWrite({ status: 'loading' }, '/api/presets', 'POST')).toBe(false);
  });

  it('FAILS CLOSED on a failed projection', () => {
    expect(coversWrite({ status: 'failed', error: new Error('x') }, '/api/presets', 'POST')).toBe(
      false,
    );
  });
});

// -- useCanWrite (the boundary primitive over coversWrite) -------------------

describe('useCanWrite', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear();
  });

  it('fails closed while loading, then reads the projection once ready', async () => {
    const d = deferred();
    const { result } = renderHook(
      () => ({ auth: useAuth(), can: useCanWrite('/api/presets', 'POST') }),
      { wrapper: makeWrapper(vi.fn(() => d.promise)) },
    );

    // Unauthenticated → loading → fail closed.
    expect(result.current.can).toBe(false);

    act(() => {
      result.current.auth.login('k', false);
    });
    // Still loading until getMe resolves → fail closed.
    expect(result.current.can).toBe(false);

    await act(async () => {
      d.resolve(projection({ routes: [{ path: '/api/presets', methods: ['GET', 'POST'] }] }));
      await d.promise;
    });
    expect(result.current.can).toBe(true);
  });

  it('defaults the method to POST', async () => {
    const d = deferred();
    const { result } = renderHook(() => ({ auth: useAuth(), can: useCanWrite('/api/presets') }), {
      wrapper: makeWrapper(vi.fn(() => d.promise)),
    });

    act(() => {
      result.current.auth.login('k', false);
    });
    await act(async () => {
      d.resolve(projection({ routes: [{ path: '/api/presets', methods: ['POST'] }] }));
      await d.promise;
    });
    expect(result.current.can).toBe(true);
  });
});

// -- CapabilityProvider state machine ----------------------------------------

interface Deferred {
  promise: Promise<MeProjection>;
  resolve: (value: MeProjection) => void;
  reject: (reason: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (value: MeProjection) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<MeProjection>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeWrapper(getMe: ApiClient['getMe'], onUnauthorized: () => void = () => undefined) {
  const client = { getMe } as unknown as ApiClient;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider value={client}>
        <UnauthorizedProvider value={onUnauthorized}>
          <AuthProvider>
            <CapabilityProvider>{children}</CapabilityProvider>
          </AuthProvider>
        </UnauthorizedProvider>
      </ApiProvider>
    );
  };
}

function renderProvider(getMe: ApiClient['getMe'], onUnauthorized?: () => void) {
  return renderHook(() => ({ auth: useAuth(), caps: useCapabilities() }), {
    wrapper: makeWrapper(getMe, onUnauthorized),
  });
}

describe('CapabilityProvider', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    globalThis.sessionStorage.clear();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useCapabilities())).toThrow(/must be used within/i);
  });

  it('stays loading and does not fetch while unauthenticated', () => {
    const getMe = vi.fn();
    const { result } = renderProvider(getMe);
    expect(result.current.caps.state).toEqual({ status: 'loading' });
    expect(getMe).not.toHaveBeenCalled();
  });

  it('fetches on the auth flip and resolves to ready(projection)', async () => {
    const d = deferred();
    const getMe = vi.fn(() => d.promise);
    const { result } = renderProvider(getMe);

    act(() => {
      result.current.auth.login('k', false);
    });
    expect(result.current.caps.state.status).toBe('loading');
    expect(getMe).toHaveBeenCalledTimes(1);

    const proj = projection({ admin: true });
    await act(async () => {
      d.resolve(proj);
    });
    await waitFor(() => {
      expect(result.current.caps.state.status).toBe('ready');
    });
    expect(result.current.caps.state).toEqual({ status: 'ready', projection: proj });
  });

  it('surfaces a /me failure loudly as failed(error) + console.error', async () => {
    const d = deferred();
    const getMe = vi.fn(() => d.promise);
    const { result } = renderProvider(getMe);

    act(() => {
      result.current.auth.login('k', false);
    });
    const boom = new Error('boom');
    await act(async () => {
      d.reject(boom);
    });
    await waitFor(() => {
      expect(result.current.caps.state.status).toBe('failed');
    });
    expect(result.current.caps.state).toEqual({ status: 'failed', error: boom });
    expect(consoleError).toHaveBeenCalledWith(boom);
  });

  it('retry() re-fetches after a failure', async () => {
    let call = 0;
    const first = deferred();
    const second = deferred();
    const getMe = vi.fn(() => (call++ === 0 ? first.promise : second.promise));
    const { result } = renderProvider(getMe);

    act(() => {
      result.current.auth.login('k', false);
    });
    await act(async () => {
      first.reject(new Error('boom'));
    });
    await waitFor(() => {
      expect(result.current.caps.state.status).toBe('failed');
    });

    act(() => {
      result.current.caps.retry();
    });
    expect(result.current.caps.state.status).toBe('loading');
    const proj = projection({ admin: true });
    await act(async () => {
      second.resolve(proj);
    });
    await waitFor(() => {
      expect(result.current.caps.state.status).toBe('ready');
    });
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it('routes a 401 from /me to the unauthorized handler, NOT the failed state', async () => {
    const d = deferred();
    const getMe = vi.fn(() => d.promise);
    const onUnauthorized = vi.fn();
    const { result } = renderProvider(getMe, onUnauthorized);

    act(() => {
      result.current.auth.login('k', false);
    });
    // The SDK stays api-client-leaf: it recognizes a 401 by `error.name` (the same
    // check `useSse` uses), never an `instanceof` of the api-client class. Mirror
    // that here rather than importing the error type at runtime.
    const unauthorized = Object.assign(new Error('unauthorized'), {
      name: 'ApiUnauthorizedError',
    });
    await act(async () => {
      d.reject(unauthorized);
    });
    await waitFor(() => {
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });
    // A dead credential routes to login; it never settles into the retryable
    // `failed` state against a known-bad key, and it is not logged as an error.
    expect(result.current.caps.state.status).not.toBe('failed');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('re-fetches when the active credential changes while staying authenticated', async () => {
    let call = 0;
    const first = deferred();
    const second = deferred();
    const getMe = vi.fn(() => (call++ === 0 ? first.promise : second.promise));
    const { result } = renderProvider(getMe);

    act(() => {
      result.current.auth.login('k1', false);
    });
    await act(async () => {
      first.resolve(projection({ admin: true }));
    });
    await waitFor(() => {
      expect(result.current.caps.state.status).toBe('ready');
    });
    expect(getMe).toHaveBeenCalledTimes(1);

    // A fresh credential over a still-authenticated session must re-project — the
    // prior identity's projection is stale.
    act(() => {
      result.current.auth.login('k2', false);
    });
    expect(result.current.caps.state.status).toBe('loading');
    const proj = projection({ admin: false, tools: ['echo'] });
    await act(async () => {
      second.resolve(proj);
    });
    await waitFor(() => {
      expect(result.current.caps.state).toEqual({ status: 'ready', projection: proj });
    });
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it('resets to loading on sign-out (auth flips false)', async () => {
    const d = deferred();
    const getMe = vi.fn(() => d.promise);
    const { result } = renderProvider(getMe);

    act(() => {
      result.current.auth.login('k', false);
    });
    await act(async () => {
      d.resolve(projection({ admin: true }));
    });
    await waitFor(() => {
      expect(result.current.caps.state.status).toBe('ready');
    });

    act(() => {
      result.current.auth.logout();
    });
    expect(result.current.caps.state).toEqual({ status: 'loading' });
  });
});
