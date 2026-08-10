/**
 * `useFeatureOff` — the PROACTIVE read of a DB-backed feature's OFF state, off the
 * system kind-status table (`GET /api/system/kinds`), fetched once per auth flip and
 * held as SDK state.
 *
 * A deployment leaves a database-backed feature cleanly OFF by configuring no store
 * for it; the kind-status table then reports that kind's `state` as `off` (rather
 * than `active` / `default`). A write affordance for an OFF feature reads this and
 * hides itself BEFORE the user acts, instead of learning OFF only from a write's 501
 * refusal — the reactive `isFeatureDisabled` swallow stays as the backstop for a
 * stale table.
 *
 * A PLAIN fetch state machine (`loading` / `ready` / `failed`), NOT TanStack Query:
 * the SDK is the shared leaf across the plugin boundary and holds no query context,
 * exactly as `useCapabilities` does. It is DELIBERATELY non-blocking — a kind counts
 * as not-off until the table is `ready`, and a failed fetch leaves every kind not-off
 * so the surface falls back to its reactive 501 handling, never a hard-failed page.
 */
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { KindStatus } from '@tai42/api-client';

import { useApi } from './useApi';
import { useAuth } from './useAuth';

export type SystemKindsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly kinds: readonly KindStatus[] }
  | { readonly status: 'failed'; readonly error: unknown };

const SystemKindsContext = createContext<SystemKindsState | null>(null);

/**
 * Fetch the kind-status table once the caller is authenticated and hold it as SDK
 * state. Gated on `isAuthenticated` (the table is an authed read), so the login
 * screen never fires a doomed request; a fetch failure settles into `failed`
 * QUIETLY — no unauthorized routing, no loud error — because the consuming
 * affordance falls back to its reactive OFF handling.
 */
export function SystemKindsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const api = useApi();
  const [state, setState] = useState<SystemKindsState>({ status: 'loading' });

  useEffect(() => {
    if (!isAuthenticated) {
      // No credential → nothing to read. Reset to the neutral `loading` state so the
      // next sign-in re-fetches cleanly; every kind reads not-off meanwhile.
      setState({ status: 'loading' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    api.getSystemKinds(controller.signal).then(
      (kinds) => {
        if (!controller.signal.aborted) setState({ status: 'ready', kinds });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'failed', error });
      },
    );
    return () => {
      controller.abort();
    };
  }, [api, isAuthenticated]);

  return createElement(SystemKindsContext.Provider, { value: state }, children);
}

/**
 * The live kind-status state. Falls back to `loading` when no provider is mounted, so
 * a consumer rendered outside the shell reads every kind as not-off rather than
 * throwing — the fail-open default this proactive-hiding idiom relies on.
 */
export function useSystemKinds(): SystemKindsState {
  return useContext(SystemKindsContext) ?? { status: 'loading' };
}

/**
 * Whether `kind` is reported OFF by the kind-status table — the single proactive
 * predicate a write affordance folds in to hide itself before a doomed write. It is
 * `true` ONLY once the table is `ready` AND that kind's row carries `state: 'off'`;
 * while the table is loading/failed, no provider is mounted, or the kind is unknown,
 * it is `false` (treat as not-off until known — under-hiding is safe, the reactive
 * 501 backstop still catches a genuinely-off feature).
 */
export function useFeatureOff(kind: string): boolean {
  const state = useSystemKinds();
  if (state.status !== 'ready') return false;
  return state.kinds.some((row) => row.kind === kind && row.state === 'off');
}

/**
 * The OFF row's server `detail` for `kind` — the proactive counterpart to a write
 * refusal's message, so a proactively-hidden surface shows the SERVER's own
 * remediation line rather than a client-composed env-var string. `null` whenever the
 * kind is not reported OFF (table loading/failed, no provider, unknown kind, or the
 * kind is on), mirroring `useFeatureOff`'s not-off-until-known default.
 */
export function useFeatureOffMessage(kind: string): string | null {
  const state = useSystemKinds();
  if (state.status !== 'ready') return null;
  const row = state.kinds.find((entry) => entry.kind === kind && entry.state === 'off');
  return row ? row.detail : null;
}
