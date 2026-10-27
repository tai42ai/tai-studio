/**
 * `useFeatureOff` — the PROACTIVE read of a DB-backed feature's OFF state, off the
 * system kind-status table (`GET /api/system/kinds`), fetched once per auth flip and
 * held as SDK state.
 *
 * A deployment leaves a database-backed feature cleanly OFF by configuring no store
 * for it; the kind-status table then reports that kind's `state` as `off` (rather
 * than `active` / `default`). A write affordance for an OFF feature reads this and
 * hides itself BEFORE the user acts, instead of learning OFF only from a write's 501
 * refusal. A write's 501 refusal is the backstop for a stale table: the surface that
 * saw it reports it through `useReportFeatureOff`, and the provider then reads that
 * kind as OFF for every surface in the app, with the refusal's own message.
 *
 * A PLAIN fetch state machine (`loading` / `ready` / `failed`), NOT TanStack Query:
 * the SDK is the shared leaf across the plugin boundary and holds no query context,
 * exactly as `useCapabilities` does. It is DELIBERATELY non-blocking — a kind counts
 * as not-off until the table is `ready`, and a failed fetch leaves every kind not-off
 * so the surface falls back to its reactive 501 handling, never a hard-failed page.
 */
import type { KindStatus } from '@tai42/api-client';
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useApi } from './useApi';
import { useAuth } from './useAuth';

export type SystemKindsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly kinds: readonly KindStatus[] }
  | { readonly status: 'failed'; readonly error: unknown };

interface SystemKindsContextValue {
  readonly state: SystemKindsState;
  /** Kinds a write refusal revealed OFF, each with the refusal's message. */
  readonly refusedOff: ReadonlyMap<string, string>;
  readonly reportOff: (kind: string, message: string) => void;
}

const SystemKindsContext = createContext<SystemKindsContextValue | null>(null);

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
  const [refusedOff, setRefusedOff] = useState<ReadonlyMap<string, string>>(() => new Map());

  useEffect(() => {
    // A sign-in, a sign-out or a new API client starts from the table alone: what
    // refusals revealed for an earlier session or another client is not carried over.
    setRefusedOff(new Map());
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

  const reportOff = useCallback((kind: string, message: string) => {
    setRefusedOff((current) => {
      if (current.get(kind) === message) return current;
      const next = new Map(current);
      next.set(kind, message);
      return next;
    });
  }, []);

  const value = useMemo<SystemKindsContextValue>(
    () => ({ state, refusedOff, reportOff }),
    [state, refusedOff, reportOff],
  );
  return createElement(SystemKindsContext.Provider, { value }, children);
}

const NO_REFUSALS: ReadonlyMap<string, string> = new Map();

/**
 * The live kind-status state. Falls back to `loading` when no provider is mounted, so
 * a consumer rendered outside the shell reads every kind as not-off rather than
 * throwing — the fail-open default this proactive-hiding idiom relies on.
 */
export function useSystemKinds(): SystemKindsState {
  return useContext(SystemKindsContext)?.state ?? { status: 'loading' };
}

/** The kinds a write refusal revealed OFF in this session (none without a provider). */
function useRefusedOff(): ReadonlyMap<string, string> {
  return useContext(SystemKindsContext)?.refusedOff ?? NO_REFUSALS;
}

/**
 * Record that a write refusal revealed `kind` OFF, with the refusal's own `message`,
 * so every surface's `useFeatureOff(kind)` reads OFF from then on. Calling the
 * returned function with no `SystemKindsProvider` mounted throws: the refusal would
 * otherwise reach no other surface.
 */
export function useReportFeatureOff(): (kind: string, message: string) => void {
  const context = useContext(SystemKindsContext);
  return useCallback(
    (kind: string, message: string) => {
      if (context === null) {
        throw new Error(
          `A ${kind} refusal was reported with no <SystemKindsProvider> mounted to hold it.`,
        );
      }
      context.reportOff(kind, message);
    },
    [context],
  );
}

/**
 * Whether `kind` is OFF — the single predicate a write affordance folds in to hide
 * itself before a doomed write. It is `true` once the table is `ready` AND that kind's
 * row carries `state: 'off'`, or once a write refusal revealed the kind OFF
 * ({@link useReportFeatureOff}). Otherwise — the table loading/failed, no provider
 * mounted, the kind unknown — it is `false` (not-off until known: under-hiding is
 * safe, a write's 501 refusal still reveals a genuinely-off feature).
 */
export function useFeatureOff(kind: string): boolean {
  const state = useSystemKinds();
  const refused = useRefusedOff().has(kind);
  if (refused) return true;
  if (state.status !== 'ready') return false;
  return state.kinds.some((row) => row.kind === kind && row.state === 'off');
}

/**
 * The OFF row's server `detail` for `kind` — the proactive counterpart to a write
 * refusal's message, so a proactively-hidden surface shows the SERVER's own
 * remediation line rather than a client-composed env-var string; for a kind only a
 * write refusal revealed OFF, that refusal's message. `null` whenever the kind is not
 * OFF, mirroring `useFeatureOff`'s not-off-until-known default.
 */
export function useFeatureOffMessage(kind: string): string | null {
  const state = useSystemKinds();
  const refused = useRefusedOff().get(kind);
  if (state.status === 'ready') {
    const row = state.kinds.find((entry) => entry.kind === kind && entry.state === 'off');
    if (row) return row.detail;
  }
  return refused ?? null;
}
