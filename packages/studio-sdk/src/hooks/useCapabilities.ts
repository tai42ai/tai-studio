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
import type { MeProjection } from '@tai42/api-client';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createElement } from 'react';

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
 * (the condition-free `"*"` discriminator) and the gate-off local-dev
 * projection alike. This is `projection.admin === true` and NOTHING else: a
 * seeded editor/viewer carries `["*"]` scopes PLUS a jq fence, so keying on `"*"`
 * scopes would hand every editor/viewer the unfiltered nav and a wall of 403s on
 * the admin routes their fence denies. Keying on `admin` makes editor/viewer
 * SCOPED sessions whose nav is filtered by their projected `routes`, which is
 * exactly right — and the gate-off synthetic projection (`admin: true`, empty
 * `routes`) still reads as full, so an AC-disabled deployment shows everything.
 */
export function isFullProjection(projection: MeProjection): boolean {
  return projection.admin;
}

/**
 * Whether a concrete path is `prefix` itself or nested beneath it at a PATH-SEGMENT
 * boundary — the client mirror of the server's segment-aware coverage rule, held to
 * the platform's published path-coverage vectors by the shell's tests. Matching on a
 * bare `startsWith` would let a sibling route like `/api/tools-schema` satisfy the
 * `/api/tools` token; the boundary keeps them distinct.
 */
function pathUnderPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Whether the projection reaches ANY route under one of `prefixes` — the
 * declarative test behind nav filtering and plugin `requiredCapabilities`. A
 * `routes[].path` (a concrete path, or a route template such as `/api/presets/{name}`)
 * covers a prefix when it is that prefix or a segment-nested descendant of it; a dynamic `route_patterns[]` entry covers a
 * prefix through its served `open_prefix` — the literal the server rules every
 * path starting with is reachable — when it overlaps the prefix at a segment
 * boundary. A `null` open prefix (a pattern whose matched set is not a clean
 * prefix) covers nothing by prefix: under-showing is safe, over-showing is the bug.
 */
export function coversAnyRoute(projection: MeProjection, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      projection.routes.some((route) => pathUnderPrefix(route.path, prefix)) ||
      projection.route_patterns.some((entry) => {
        const open = entry.open_prefix;
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
 * admitted `methods` include `method`. A templated route is listed under its template
 * path (`/api/presets/{name}`) with the methods the caller's grant admits on a
 * representative instance of it, so a caller names the template on both sides. This is the method-aware companion to
 * {@link coversAnyRoute}: a read/nav surface gates path-only (any method reaching a
 * prefix means the surface is navigable), but an action that issues `method path`
 * must gate on the method too, or a caller whose jq fence admits only GET on `path`
 * would be shown a control that 403s on submit (projection ⊆ gate).
 *
 * Only `routes` are consulted: dynamic `route_patterns` carry no method, so no write
 * capability can be soundly inferred from them, and a synthetic TOTAL
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
 * A templated write route is gated by its template path: the projection lists it with
 * the methods the caller's grant admits on a representative instance. A credential fenced
 * per instance is decided at the server, which answers 403 on submit where the fence
 * denies that instance. Under-showing is safe (the server stays the authority);
 * over-showing a write the gate denies is the bug.
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

/** The session's own identity, as the execution-key pickers offer it. */
export interface OwnIdentity {
  readonly userId: string;
  /** 'account' when the session is a principal itself (no owner claim, a principal row): the bind check refuses
   * it. 'key' otherwise: an owned api key, or a key with no owner. */
  readonly kind: 'key' | 'account';
  readonly admin: boolean;
}

/** How a form binds the execution key a stored record runs as, read from the session's projection. */
export type ExecutionKeyBinding =
  /** The projection is not ready (loading, or failed: the shell shows its own error); the form cannot submit. */
  | { readonly mode: 'pending' }
  /** Access control is off: no identity is checked, no key field is shown, a blank key is sent as `fillKey`. */
  | { readonly mode: 'unchecked'; readonly fillKey: string }
  /** Access control is on: the key list, plus the session's own identity. */
  | { readonly mode: 'checked'; readonly own: OwnIdentity };

/** The execution-key binding a capability state implies. */
export function executionKeyBindingOf(state: CapabilityState): ExecutionKeyBinding {
  if (state.status !== 'ready') return { mode: 'pending' };
  const { projection } = state;
  if (!projection.access_control_enabled) {
    return { mode: 'unchecked', fillKey: projection.user_id };
  }
  return {
    mode: 'checked',
    own: {
      userId: projection.user_id,
      kind: projection.owner_user_id === null && projection.principal !== null ? 'account' : 'key',
      admin: projection.admin,
    },
  };
}

/** The execution-key binding of the live session. */
export function useExecutionKeyBinding(): ExecutionKeyBinding {
  const { state } = useCapabilities();
  return useMemo(() => executionKeyBindingOf(state), [state]);
}

/** The key a write sends: the form's value; with access control off and a blank value, the fill key. */
export function boundExecutionKey(value: string, binding: ExecutionKeyBinding): string {
  return binding.mode === 'unchecked' && value.trim() === '' ? binding.fillKey : value;
}
