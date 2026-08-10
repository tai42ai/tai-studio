/**
 * `useCapabilities` — the caller's capability projection (`GET /api/auth/me`),
 * fetched once per auth flip and held as SDK state. The UI is a projection of
 * this: nav, pages, and plugin loading filter on what the projection says the
 * caller can reach, and the server stays the sole authority (projection ⊆ gate).
 *
 * A PLAIN fetch state machine (`loading` / `ready` / `failed`), NOT TanStack
 * Query, and for the same reason the login page fetches its methods with plain
 * `fetch`: the shell wipes the query cache around auth flips, so a
 * query-cached projection would be dropped underneath the components that gate
 * on it. This provider owns the projection lifecycle instead.
 *
 * FAILED IS LOUD AND BLOCKING: on a `/me` failure the shell renders an
 * `ErrorState` with `retry` in the nav region — never an optimistic full nav on
 * error. The UI fails closed exactly as the server would.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { MeProjection } from '@tai42/api-client';

import { useApi } from './useApi';
import { useAuth } from './useAuth';
import { useOnUnauthorized } from './useUnauthorized';

export type CapabilityState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly projection: MeProjection }
  | { readonly status: 'failed'; readonly error: unknown };

export interface CapabilityContextValue {
  readonly state: CapabilityState;
  /** Re-fetch the projection (the nav-region `ErrorState`'s retry action). */
  readonly retry: () => void;
}

const CapabilityContext = createContext<CapabilityContextValue | null>(null);

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, token } = useAuth();
  const api = useApi();
  const onUnauthorized = useOnUnauthorized();
  const [state, setState] = useState<CapabilityState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // Re-project when the ACTIVE CREDENTIAL changes, not only on the authenticated
  // flip: a credential swap that stays authenticated (a fresh key pasted over a
  // live session) must drop the prior identity's projection. Track the token via a
  // ref and expose only a monotonic version to the fetch effect, so the raw secret
  // never rides the effect's dependency array.
  const tokenRef = useRef(token);
  const [credentialVersion, setCredentialVersion] = useState(0);
  if (tokenRef.current !== token) {
    tokenRef.current = token;
    setCredentialVersion((v) => v + 1);
  }

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      // No credential → nothing to project. Reset to the neutral `loading` state
      // so the next sign-in re-fetches cleanly; the shell renders the login page
      // (not the capability-gated nav) while unauthenticated.
      setState({ status: 'loading' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    api.getMe(controller.signal).then(
      (projection) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', projection });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // A 401 means the stored credential is dead: route to login through the
        // app's unauthorized handler (the same seam the api-client's 401 path
        // drives) rather than settling into the retryable `failed` state against a
        // known-bad key. Every other error stays a loud, retryable failure.
        if (error instanceof Error && error.name === 'ApiUnauthorizedError') {
          onUnauthorized();
          return;
        }
        setState({ status: 'failed', error });
        console.error(error);
      },
    );
    return () => {
      controller.abort();
    };
  }, [api, isAuthenticated, credentialVersion, attempt, onUnauthorized]);

  const value = useMemo<CapabilityContextValue>(() => ({ state, retry }), [state, retry]);

  return createElement(CapabilityContext.Provider, { value }, children);
}

export function useCapabilities(): CapabilityContextValue {
  const value = useContext(CapabilityContext);
  if (value === null) {
    throw new Error('useCapabilities must be used within a <CapabilityProvider>');
  }
  return value;
}

/**
 * Whether the projection is the synthetic TOTAL projection — the admin session
 * (the condition-free ownerless `"*"` discriminator) and the gate-off local-dev
 * projection alike. This is `projection.admin === true` and NOTHING else: a
 * seeded editor/viewer carries `["*"]` scopes PLUS a jq fence, so keying on `"*"`
 * scopes would hand every editor/viewer the unfiltered nav and a wall of 403s on
 * the admin routes their fence denies. Keying on `admin` makes editor/viewer
 * SCOPED sessions whose nav is filtered by their jq-exact `routes`, which is
 * exactly right — and the gate-off synthetic projection (`admin: true`, empty
 * `routes`) still reads as full, so an AC-disabled deployment shows everything.
 */
export function isFullProjection(projection: MeProjection): boolean {
  return projection.admin;
}

/**
 * Whether a concrete path is `prefix` itself or nested beneath it at a PATH-SEGMENT
 * boundary — the client mirror of the server's segment-aware coverage rule
 * (access_control/settings.py: `a == b or a.startswith(b + '/')`). Matching on a
 * bare `startsWith` would let a sibling route like `/api/tools-schema` satisfy the
 * `/api/tools` token; the boundary keeps them distinct.
 */
function pathUnderPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Whether the projection reaches ANY route under one of `prefixes` — the
 * declarative test behind nav filtering and plugin `requiredCapabilities`. A
 * concrete `routes[].path` covers a prefix when it is that prefix or a
 * segment-nested descendant of it; a dynamic `route_patterns[].pattern` covers a
 * prefix only when it is a simple anchored open-wildcard pattern (`^<literal>.*$`)
 * whose open literal overlaps the prefix at a segment boundary.
 *
 * Under-showing is safe (projection is UX; the server is the authority);
 * over-showing is the bug. So any non-anchored or otherwise complex pattern
 * (alternation, char class, bounded quantifier) is conservatively treated as NOT
 * covering — its matched set is not a clean prefix, so we never infer reach from
 * it.
 */
export function coversAnyRoute(projection: MeProjection, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      projection.routes.some((route) => pathUnderPrefix(route.path, prefix)) ||
      projection.route_patterns.some((entry) => {
        const open = patternOpenPrefix(entry.pattern);
        // The open literal L means "every path starting with L is reachable". That
        // set reaches something under `prefix` when the prefix itself lies in it
        // (`prefix.startsWith(open)`) or when the literal already dives under the
        // prefix at a segment boundary (`pathUnderPrefix(open, prefix)`).
        return open !== null && (prefix.startsWith(open) || pathUnderPrefix(open, prefix));
      }),
  );
}

/**
 * Whether the projection reaches a specific WRITE route — an EXACT `path` whose
 * admitted `methods` include `method`. This is the method-aware companion to
 * {@link coversAnyRoute}: a read/nav surface gates path-only (any method reaching a
 * prefix means the surface is navigable), but an action that issues `method path`
 * must gate on the method too, or a caller whose jq fence admits only GET on `path`
 * would be shown a control that 403s on submit (projection ⊆ gate).
 *
 * Only concrete `routes` are consulted: dynamic `route_patterns` carry no method, so
 * no write capability can be soundly inferred from them, and a synthetic TOTAL
 * (admin) projection carries no concrete `routes` at all — callers short-circuit it
 * with {@link isFullProjection} before reaching here. Under-showing is safe (the
 * server stays the authority); over-showing an action the gate denies is the bug.
 */
export function coversRoute(projection: MeProjection, path: string, method: string): boolean {
  return projection.routes.some((route) => route.path === path && route.methods.includes(method));
}

/**
 * Whether a WRITE control may be shown/enabled for this caller — the fail-closed,
 * method-aware gate the features fold together with any deployment-level read-only flag
 * (the projection ⊆ gate invariant, in one place). It is `true` ONLY once the projection
 * is `ready` AND either it is a full (admin / gate-off) projection or it reaches
 * `method path`. While the projection is loading/failed it is `false` — a write control
 * never enables before the gate is known (fail closed; not-ready ⇒ disabled/read-only).
 *
 * Only concrete `routes` carry methods, so a DYNAMIC (templated) write route — one the
 * projection can represent only as a method-less `route_patterns` row — reads `false` for
 * every non-admin caller and degrades that control to read-only. Under-showing is safe
 * (the server stays the authority); over-showing a write the gate denies is the bug.
 */
export function coversWrite(state: CapabilityState, path: string, method: string): boolean {
  return (
    state.status === 'ready' &&
    (isFullProjection(state.projection) || coversRoute(state.projection, path, method))
  );
}

/**
 * Whether a WRITE control may be shown for the current caller — the single boundary
 * primitive a feature calls to hide a control whose `method path` the caller's
 * projection cannot reach. It reads the live capability state and folds it through
 * {@link coversWrite}: `true` only once the projection is `ready` AND it is a full
 * (admin / gate-off) projection or it reaches `method path`; while the projection is
 * loading/failed it is `false` (fail closed — no write control before the gate is
 * known). `method` defaults to `POST`, the common write verb; pass the exact verb for
 * a PUT/PATCH/DELETE control.
 */
export function useCanWrite(path: string, method = 'POST'): boolean {
  const { state } = useCapabilities();
  return coversWrite(state, path, method);
}

const REGEX_METACHARACTERS = /[.*+?()[\]{}|\\^$]/;

/**
 * The literal prefix of a simple anchored open-wildcard pattern (`^<literal>.*$`,
 * the `$` optional), or `null` when the pattern is not exactly that shape. A
 * returned literal `L` means "every path starting with `L` is reachable"; only
 * that open-wildcard form yields a sound prefix, so a bare literal, an
 * alternation, a char class, or any other construct declines (returns `null`).
 */
function patternOpenPrefix(pattern: string): string | null {
  if (!pattern.startsWith('^')) return null;
  let body = pattern.slice(1);
  if (body.endsWith('$')) body = body.slice(0, -1);
  if (!body.endsWith('.*')) return null;
  body = body.slice(0, -2);
  if (body.length === 0 || REGEX_METACHARACTERS.test(body)) return null;
  return body;
}
