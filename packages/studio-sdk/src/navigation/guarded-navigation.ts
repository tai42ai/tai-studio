/**
 * Wrap a shell-supplied {@link NavigationContextValue} so every SDK-controlled
 * transition consults the armed guards before it commits, and — on approval —
 * advances the committed-entry mirror to the resolved destination. With no guard
 * armed each call stays synchronous, identical to the raw shell value.
 */
import type { RefObject } from 'react';

import { mergeEntryState, reconstructEntryState } from './entry-state';
import type { NavigationGuardRegistry } from './guard-registry';
import type { NavigationContextValue } from './types';

/** The last committed history entry the SDK observed: what a canceled back/forward restores to. */
export interface CommittedEntry {
  href: string;
  state: unknown;
}

type CommittedRef = RefObject<CommittedEntry | null>;

// navigate: forwarded as a REST tuple so the shell's `navigate` is called with
// exactly the arguments the caller passed — a caller wanting the default history
// behaviour never turns into one that passed an explicit `undefined` for it.
function buildNavigate(
  value: NavigationContextValue,
  registry: NavigationGuardRegistry,
  committedRef: CommittedRef,
): NavigationContextValue['navigate'] {
  return (...args) => {
    const [token, search] = args;
    if (!registry.hasArmedGuards()) {
      value.navigate(...args);
      return;
    }
    void registry.run().then((allowed) => {
      if (!allowed) return;
      value.navigate(...args);
      // Advance the committed entry to the resolved destination (the router may commit
      // async, so `window.location` would be stale). Router state is unobservable here.
      if (committedRef.current !== null) {
        committedRef.current = { href: value.resolvePath(token, search), state: null };
      }
    });
  };
}

function buildNavigatePlugin(
  value: NavigationContextValue,
  registry: NavigationGuardRegistry,
  committedRef: CommittedRef,
): NavigationContextValue['navigatePlugin'] {
  return (pluginId, pagePath, params, search) => {
    if (!registry.hasArmedGuards()) {
      value.navigatePlugin(pluginId, pagePath, params, search);
      return;
    }
    void registry.run().then((allowed) => {
      if (!allowed) return;
      value.navigatePlugin(pluginId, pagePath, params, search);
      if (committedRef.current !== null) {
        committedRef.current = {
          href: value.resolvePluginPath(pluginId, pagePath, params, search),
          state: null,
        };
      }
    });
  };
}

// navigatePluginWithOptions: guard-gated exactly like navigatePlugin (a veto never
// reaches the host member). On approval, refresh the committed entry with the
// reconstructed state bag so a subsequent vetoed Back restores the slot this
// navigation just wrote, not null.
function buildNavigateWithOptions(
  hostNavigateWithOptions: NonNullable<NavigationContextValue['navigatePluginWithOptions']>,
  value: NavigationContextValue,
  registry: NavigationGuardRegistry,
  committedRef: CommittedRef,
): NonNullable<NavigationContextValue['navigatePluginWithOptions']> {
  return (pluginId, pagePath, params, search, options) => {
    if (!registry.hasArmedGuards()) {
      hostNavigateWithOptions(pluginId, pagePath, params, search, options);
      return;
    }
    void registry.run().then((allowed) => {
      if (!allowed) return;
      hostNavigateWithOptions(pluginId, pagePath, params, search, options);
      if (committedRef.current !== null) {
        committedRef.current = {
          href: value.resolvePluginPath(pluginId, pagePath, params, search),
          state:
            options?.state !== undefined ? reconstructEntryState(pluginId, options.state) : null,
        };
      }
    });
  };
}

// updatePluginEntryState: guard-FREE — rewriting the current entry's state is not a
// navigation away. The SDK still wraps it to refresh the committed entry with the
// merged slot, so a later vetoed Back restores the UPDATED state. URL is unchanged.
function buildUpdateEntryState(
  hostUpdateEntryState: NonNullable<NavigationContextValue['updatePluginEntryState']>,
  committedRef: CommittedRef,
): NonNullable<NavigationContextValue['updatePluginEntryState']> {
  return (pluginId, state) => {
    hostUpdateEntryState(pluginId, state);
    if (committedRef.current !== null) {
      committedRef.current = {
        href: committedRef.current.href,
        state: mergeEntryState(committedRef.current.state, pluginId, state),
      };
    }
  };
}

/**
 * Build the guarded navigation value. The two host-optional members
 * (`navigatePluginWithOptions`, `updatePluginEntryState`) are wrapped only when the
 * host provides them; an older host leaves them undefined and the plugin-facing hook
 * throws loudly.
 */
export function buildGuardedNavigation(
  value: NavigationContextValue,
  registry: NavigationGuardRegistry,
  committedRef: CommittedRef,
): NavigationContextValue {
  const result: NavigationContextValue = {
    ...value,
    navigate: buildNavigate(value, registry, committedRef),
    navigatePlugin: buildNavigatePlugin(value, registry, committedRef),
  };
  const hostNavigateWithOptions = value.navigatePluginWithOptions;
  if (hostNavigateWithOptions !== undefined) {
    result.navigatePluginWithOptions = buildNavigateWithOptions(
      hostNavigateWithOptions,
      value,
      registry,
      committedRef,
    );
  }
  const hostUpdateEntryState = value.updatePluginEntryState;
  if (hostUpdateEntryState !== undefined) {
    result.updatePluginEntryState = buildUpdateEntryState(hostUpdateEntryState, committedRef);
  }
  return result;
}
