import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { NavigationGuardRegistry, type GuardEntry } from './guard-registry';
import { buildGuardedNavigation, type CommittedEntry } from './guarded-navigation';
import { useBackForwardGuard } from './use-back-forward-guard';
import type { NavigationContextValue, NavigationGuardHandler } from './types';

/** Shell-provided navigation; no default, so use outside {@link NavigationProvider} throws. */
const NavigationContext = createContext<NavigationContextValue | null>(null);

/**
 * Carries the provider's guard registry to {@link useNavigationGuard}. Separate from
 * {@link NavigationContext} so the shell-supplied value stays exactly the shell's
 * contract — the registry is SDK-owned.
 */
const GuardRegistryContext = createContext<NavigationGuardRegistry | null>(null);

/** Records an approved raw-path transition as the committed history entry, so a later
 * back/forward restores to it exactly as it does after a token navigation. */
const CommitHrefContext = createContext<((href: string) => void) | null>(null);

function useGuardRegistry(): NavigationGuardRegistry {
  const registry = useContext(GuardRegistryContext);
  if (registry === null) {
    throw new Error(
      'useNavigationGuard must be used within a <NavigationProvider> (the shell provides it).',
    );
  }
  return registry;
}

export function NavigationProvider({
  value,
  children,
}: {
  value: NavigationContextValue;
  children: ReactNode;
}): ReactNode {
  const registryRef = useRef<NavigationGuardRegistry | null>(null);
  registryRef.current ??= new NavigationGuardRegistry();
  const registry = registryRef.current;

  // The last committed history entry the SDK observed (URL + `history.state`): what a
  // canceled back/forward restores to. URL changes made outside the SDK's navigate
  // entry points are unobservable by design at this layer.
  const committedRef = useRef<CommittedEntry | null>(null);

  useBackForwardGuard(registry, committedRef);

  // Wrap the shell's transitions so an armed guard is consulted before they commit.
  // With no guard armed the call stays synchronous — identical to the raw shell value.
  const guarded = useMemo<NavigationContextValue>(
    () => buildGuardedNavigation(value, registry, committedRef),
    [value, registry],
  );

  const commitHref = useCallback((href: string) => {
    if (committedRef.current !== null) committedRef.current = { href, state: null };
  }, []);

  return createElement(
    GuardRegistryContext.Provider,
    { value: registry },
    createElement(
      CommitHrefContext.Provider,
      { value: commitHref },
      createElement(NavigationContext.Provider, { value: guarded }, children),
    ),
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (ctx === null) {
    throw new Error(
      'useNavigation must be used within a <NavigationProvider> (the shell provides it).',
    );
  }
  return ctx;
}

/** Imperative navigation to a shell route token with its typed search params. */
export function useAppNavigate(): NavigationContextValue['navigate'] {
  return useNavigation().navigate;
}

/** Resolve a token + search to the href the shell would route to. */
export function useResolvePath(): NavigationContextValue['resolvePath'] {
  return useNavigation().resolvePath;
}

/**
 * Block navigation away from the current page while `when` is true. `handler` is
 * consulted before any SDK-controlled navigation commits — a route-token navigate,
 * a plugin navigate, or a browser back/forward — and the navigation proceeds only if
 * it resolves `true`; a promise lets the handler drive a confirm dialog. A full-page
 * unload (tab close / refresh) is additionally covered by a native `beforeunload`
 * prompt that fires whenever any guard is armed.
 *
 * Guards compose against the provider's shared registry: a feature and a plugin page
 * may each arm one, and any veto blocks.
 */
export function useNavigationGuard(when: boolean, handler: NavigationGuardHandler): void {
  const registry = useGuardRegistry();
  const entryRef = useRef<GuardEntry>({ when, handler });
  // Keep the registered entry pointing at the latest inputs without re-registering.
  entryRef.current.when = when;
  entryRef.current.handler = handler;

  useEffect(() => registry.add(entryRef.current), [registry]);
  useEffect(() => {
    registry.touch();
  }, [registry, when]);
}

/**
 * Consult the armed navigation guards before a transition the shell drives itself
 * (a chrome link whose target is outside the route-token map). Resolves `true` when
 * the navigation may proceed. Token and plugin navigations already run this gate
 * inside {@link NavigationProvider}; this is the escape hatch for the shell's own
 * raw-path links, without which such a link would bypass every armed guard.
 */
export function useNavigationGate(): (href: string) => Promise<boolean> {
  const registry = useGuardRegistry();
  const commitHref = useContext(CommitHrefContext);
  return useCallback(
    async (href: string) => {
      if (registry.hasArmedGuards() && !(await registry.run())) return false;
      commitHref?.(href);
      return true;
    },
    [registry, commitHref],
  );
}

/**
 * Plugin-page navigation: `navigatePlugin` drives a client-side transition to a
 * runtime plugin path, `resolvePluginPath` yields its href. These are the ONLY
 * navigation methods a plugin page uses to reach its own deep-linkable sub-paths —
 * the token-typed {@link useAppNavigate}/{@link useResolvePath} address the shell's
 * compile-time routes and know nothing of plugin paths.
 */
export function usePluginNavigation(): Pick<
  NavigationContextValue,
  'navigatePlugin' | 'resolvePluginPath'
> {
  const { navigatePlugin, resolvePluginPath } = useNavigation();
  return { navigatePlugin, resolvePluginPath };
}

/**
 * Plugin-page navigation WITH the per-history-entry state channel:
 * `navigatePluginWithOptions` navigates and writes a per-entry state slot, and
 * `updatePluginEntryState` checkpoints the CURRENT entry's slot in place (no
 * navigation). Both require a host that provides the channel; on an OLDER host that
 * predates it, this hook THROWS a loud, descriptive error rather than silently
 * degrading — the plugin then knows to fall back or the deployment knows to update the
 * host. A plugin that only navigates without carrying state should keep using
 * {@link usePluginNavigation}, which every host supports.
 */
export function usePluginEntryNavigation(): {
  navigatePluginWithOptions: NonNullable<NavigationContextValue['navigatePluginWithOptions']>;
  updatePluginEntryState: NonNullable<NavigationContextValue['updatePluginEntryState']>;
} {
  const { navigatePluginWithOptions, updatePluginEntryState } = useNavigation();
  if (navigatePluginWithOptions === undefined || updatePluginEntryState === undefined) {
    throw new Error(
      'usePluginEntryNavigation requires a Studio host that provides the per-history-entry ' +
        'state channel (navigatePluginWithOptions + updatePluginEntryState). This host predates ' +
        'the SDK entry-state feature — rebuild the host against a newer @tai42/studio-sdk, or use ' +
        'usePluginNavigation for stateless plugin navigation.',
    );
  }
  return { navigatePluginWithOptions, updatePluginEntryState };
}
