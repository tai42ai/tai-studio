/**
 * The plugin host-readiness store: a host-driven mirror of the plugin load pass's
 * public state that feature pages subscribe to. The app shell's loader is the
 * single driver — it calls {@link setPluginHostState} on every transition — and a
 * feature page reads the current status plus the committed contributions through
 * {@link usePluginContributions}, without importing the app shell (the dependency
 * points the other way).
 *
 * This module reads the contribution registry ({@link getContributions}), so it is
 * part of the HOST-ONLY surface (`@tai42/studio-sdk/host`), never the plugin surface:
 * a served plugin bundle can neither drive this store nor enumerate the registry
 * through it. See SECURITY.md for the trust boundary.
 */
import { useSyncExternalStore } from 'react';

import type { PluginContributions } from './types';
import { getContributions } from './registry';

/**
 * The plugin load pass's public state, mirrored for feature pages to read. It is
 * the shape the app shell's loader store already exposes: `status` gates when the
 * contributions are complete, and the error fields carry the loud failures.
 */
export interface PluginLoaderState {
  /** `idle` before the first pass, `loading` while it runs, `ready` once done. */
  readonly status: 'idle' | 'loading' | 'ready';
  /** Names of plugins whose bundle imported and registered successfully. */
  readonly loaded: readonly string[];
  /** Plugin name → loud error message (version mismatch / load failure). */
  readonly errors: Readonly<Record<string, string>>;
  /** A registry-listing failure that is NOT a 401 (surfaced loudly, never hidden). */
  readonly registryError: string | null;
}

const INITIAL_HOST_STATE: PluginLoaderState = {
  status: 'idle',
  loaded: [],
  errors: {},
  registryError: null,
};

let hostState: PluginLoaderState = INITIAL_HOST_STATE;
const listeners = new Set<() => void>();

/**
 * The host loader pushes every load-pass transition here (it stays the single
 * driver); every subscriber is notified so feature pages re-render off it.
 */
export function setPluginHostState(state: PluginLoaderState): void {
  hostState = state;
  for (const listener of listeners) listener();
}

/** The current mirrored host state — the snapshot {@link usePluginContributions} reads. */
export function getPluginHostState(): PluginLoaderState {
  return hostState;
}

/**
 * Subscribe to host-state transitions; returns the unsubscribe function
 * `useSyncExternalStore` requires so a subscriber detaches on unmount.
 */
export function subscribePluginHost(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests reset the module-level host state between cases. */
export function __resetPluginHostState(): void {
  hostState = INITIAL_HOST_STATE;
  listeners.clear();
}

/** What {@link usePluginContributions} returns: the load status and the registry. */
export interface PluginContributionsSnapshot {
  /** The load pass's status; contributions are only complete once it is `'ready'`. */
  readonly status: PluginLoaderState['status'];
  /** The committed contributions, meaningful only when `status === 'ready'`. */
  readonly contributions: PluginContributions;
}

/**
 * Subscribe to the plugin host state and read the committed contributions. The
 * status drives re-renders as the load pass advances; `contributions` is only
 * meaningful once `status === 'ready'` (before then the pass has committed
 * nothing, so callers render their non-plugin content).
 */
export function usePluginContributions(): PluginContributionsSnapshot {
  const status = useSyncExternalStore(subscribePluginHost, () => getPluginHostState().status);
  return { status, contributions: getContributions() };
}
