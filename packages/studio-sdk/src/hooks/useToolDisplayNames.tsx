/**
 * `useToolDisplayNames` — the tool-meta display-name overlay (`GET /api/tool-meta`),
 * fetched once per auth flip and held as SDK state, so every tool picker across the
 * app labels a raw tool name with its human display name from ONE shared read rather
 * than each picker refetching the overlay.
 *
 * A PLAIN fetch state machine (`loading` / `ready` / `failed`), NOT TanStack Query:
 * the SDK is the shared leaf across the plugin boundary and holds no query context,
 * exactly as `useSystemKinds` and `useCapabilities` do. It is DELIBERATELY
 * non-blocking — the map reads empty until the overlay is `ready`, and a failed fetch
 * settles into `failed` QUIETLY (no unauthorized routing, no loud error) because a
 * display name is cosmetic: a picker with an empty map falls back to the bare raw
 * name, never a hard-failed page.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ToolMetaOverlay } from '@tai42/api-client';

import { useApi } from './useApi';
import { useAuth } from './useAuth';

export type ToolDisplayNamesState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly names: Readonly<Record<string, string>> }
  | { readonly status: 'failed'; readonly error: unknown };

export interface ToolDisplayNamesContextValue {
  readonly state: ToolDisplayNamesState;
  /** Re-fetch the overlay (drives the app-level refresh after a display-name edit). */
  readonly reload: () => void;
}

const ToolDisplayNamesContext = createContext<ToolDisplayNamesContextValue | null>(null);

/** The shared empty map returned while loading/failed or with no provider mounted. */
const EMPTY_NAMES: Readonly<Record<string, string>> = Object.freeze({});

/** Build the raw-name → display-name map from the overlay rows with a truthy `display_name`. */
function buildNames(overlay: ToolMetaOverlay): Readonly<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const row of overlay.meta) {
    if (row.display_name !== null && row.display_name !== '') {
      names[row.tool_name] = row.display_name;
    }
  }
  return names;
}

/**
 * Fetch the tool-meta overlay once the caller is authenticated and hold its
 * display-name map as SDK state. Gated on `isAuthenticated` (the overlay is an authed
 * read), so the login screen never fires a doomed request; a fetch failure settles
 * into `failed` QUIETLY, because the consuming pickers fall back to the bare raw name.
 * `reload` re-fetches on demand, so an app-level display-name write refreshes every
 * picker without a remount.
 */
export function ToolDisplayNamesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const api = useApi();
  const [state, setState] = useState<ToolDisplayNamesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      // No credential → nothing to read. Reset to the neutral `loading` state so the
      // next sign-in re-fetches cleanly; every picker reads the empty map meanwhile.
      setState({ status: 'loading' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    api.listToolMeta(controller.signal).then(
      (overlay) => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', names: buildNames(overlay) });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'failed', error });
      },
    );
    return () => {
      controller.abort();
    };
  }, [api, isAuthenticated, attempt]);

  const value = useMemo<ToolDisplayNamesContextValue>(() => ({ state, reload }), [state, reload]);

  return createElement(ToolDisplayNamesContext.Provider, { value }, children);
}

/**
 * The live raw-name → display-name map — `{}` while the overlay is loading/failed, no
 * provider is mounted, or no row carries a display name. A tool picker folds this into
 * its option labels; an unmapped name reads the bare raw name.
 */
export function useToolDisplayNames(): Readonly<Record<string, string>> {
  const value = useContext(ToolDisplayNamesContext);
  if (value?.state.status !== 'ready') return EMPTY_NAMES;
  return value.state.names;
}

/**
 * Re-fetch the display-name overlay. A surface that writes a display name calls this
 * so the app-level provider — and every picker reading it — refreshes alongside the
 * surface's own list invalidation. A no-op when no provider is mounted.
 */
export function useReloadToolDisplayNames(): () => void {
  const value = useContext(ToolDisplayNamesContext);
  return value?.reload ?? (() => undefined);
}

/**
 * The option label for a raw tool name under a display-name map: `Display (raw)` when
 * a display name maps the name and is non-empty AND differs from the raw name, else
 * the bare raw name. Shared so every tool picker labels identically.
 *
 * @param names - the raw-name → display-name map (from {@link useToolDisplayNames}).
 * @param rawName - the raw tool name to label.
 * @returns `Display (raw)` for a distinct non-empty display name, else `rawName`.
 */
export function toolDisplayLabel(names: Readonly<Record<string, string>>, rawName: string): string {
  const display = names[rawName];
  return display !== undefined && display !== '' && display !== rawName
    ? `${display} (${rawName})`
    : rawName;
}

/**
 * Serve a FIXED display-name map — the test seam for a consumer that renders a tool
 * picker without a live fetch. `reload` defaults to a no-op; a test that exercises the
 * reload wiring passes a spy. Re-exported from the testing entry.
 */
export function StaticToolDisplayNamesProvider({
  names,
  reload = () => undefined,
  children,
}: {
  readonly names: Readonly<Record<string, string>>;
  readonly reload?: () => void;
  readonly children: ReactNode;
}) {
  const value = useMemo<ToolDisplayNamesContextValue>(
    () => ({ state: { status: 'ready', names }, reload }),
    [names, reload],
  );
  return createElement(ToolDisplayNamesContext.Provider, { value }, children);
}
