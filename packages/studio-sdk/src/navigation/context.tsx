import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AriaAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

import type {
  NavigationContextValue,
  NavigationGuardHandler,
  RouteSearch,
  RouteToken,
} from './types';

/** Shell-provided navigation; no default, so use outside {@link NavigationProvider} throws. */
const NavigationContext = createContext<NavigationContextValue | null>(null);

/**
 * One armed navigation guard. The registry holds this exact object (not a
 * snapshot), so flipping `when` or swapping `handler` on re-render takes effect
 * without re-registering.
 */
interface GuardEntry {
  when: boolean;
  handler: NavigationGuardHandler;
}

/**
 * The guards active under one {@link NavigationProvider} — the single registry
 * every SDK-controlled navigation consults, so feature and plugin-page guards
 * compose against the same set. `run` stops at the first veto (at most one confirm
 * dialog); `subscribe` re-evaluates browser-level listeners when the armed set changes.
 */
class NavigationGuardRegistry {
  private readonly guards = new Set<GuardEntry>();
  private readonly listeners = new Set<() => void>();

  /** Register a guard; returns the unregister function. */
  add(entry: GuardEntry): () => void {
    this.guards.add(entry);
    this.emit();
    return () => {
      this.guards.delete(entry);
      this.emit();
    };
  }

  /** Notify subscribers that a guard's `when` may have changed. */
  touch(): void {
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hasArmedGuards(): boolean {
    for (const entry of this.guards) {
      if (entry.when) return true;
    }
    return false;
  }

  /** Resolve `true` only if every armed guard allows the navigation. */
  async run(): Promise<boolean> {
    for (const entry of this.guards) {
      if (!entry.when) continue;
      const allowed = await entry.handler();
      if (!allowed) return false;
    }
    return true;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Carries the provider's guard registry to {@link useNavigationGuard}. Separate from
 * {@link NavigationContext} so the shell-supplied value stays exactly the shell's
 * contract — the registry is SDK-owned.
 */
const GuardRegistryContext = createContext<NavigationGuardRegistry | null>(null);

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
  const committedRef = useRef<{ href: string; state: unknown } | null>(null);

  // Mirror the registry's armed state into React so the browser listeners attach only
  // while at least one guard is armed.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(registry.hasArmedGuards());
    return registry.subscribe(() => {
      setArmed(registry.hasArmedGuards());
    });
  }, [registry]);

  useEffect(() => {
    if (!armed) return;

    // The protected entry (URL + state); a back/forward landing elsewhere is first
    // canceled back to here while the guard is consulted.
    committedRef.current = { href: window.location.href, state: window.history.state };
    // Set while replaying a guard-approved back/forward, so its `popstate` passes
    // through instead of being re-intercepted.
    let bypass = false;
    // Latched while a decision is pending, so a second Back mid-decision keeps canceling
    // without starting a concurrent `registry.run()` — one gesture, one dialog.
    let pending = false;
    // Restore pushes stacked for the pending decision, so an approved replay unwinds
    // exactly that far in one `go(-depth)`. Reset per decision.
    let restores = 0;

    const onPopState = () => {
      if (bypass) {
        bypass = false;
        committedRef.current = { href: window.location.href, state: window.history.state };
        return;
      }
      if (!registry.hasArmedGuards()) {
        committedRef.current = { href: window.location.href, state: window.history.state };
        return;
      }
      const committed = committedRef.current;
      if (committed === null) return;
      // Cancel the browser's move by pushing the committed entry on top of wherever it
      // landed. popstate exposes no direction/distance and the router owns
      // `history.state`, so restore can only push, not delete. A vetoed forward thus
      // strands a stub entry — an accepted limit the next pushState truncates.
      window.history.pushState(committed.state, '', committed.href);
      restores += 1;
      if (pending) return;
      pending = true;
      void registry.run().then((allowed) => {
        pending = false;
        const depth = restores;
        restores = 0;
        if (!allowed) return;
        bypass = true;
        window.history.go(-depth);
      });
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers below the floor (Chrome 108) gate the prompt on a set `returnValue`,
      // not `preventDefault` alone; the string is ignored. Typed deprecated, still required.
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- required beforeunload trigger for the supported browser range.
      event.returnValue = '';
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      committedRef.current = null;
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [armed, registry]);

  // Wrap the shell's transitions so an armed guard is consulted before they commit.
  // With no guard armed the call stays synchronous — identical to the raw shell value.
  const guarded = useMemo<NavigationContextValue>(() => {
    const navigate: NavigationContextValue['navigate'] = (token, search) => {
      if (!registry.hasArmedGuards()) {
        value.navigate(token, search);
        return;
      }
      void registry.run().then((allowed) => {
        if (!allowed) return;
        value.navigate(token, search);
        // Advance the committed entry to the resolved destination (the router may commit
        // async, so `window.location` would be stale). Its router state is unobservable
        // here, hence `state: null`.
        if (committedRef.current !== null) {
          committedRef.current = { href: value.resolvePath(token, search), state: null };
        }
      });
    };
    const navigatePlugin: NavigationContextValue['navigatePlugin'] = (
      pluginId,
      pagePath,
      params,
      search,
    ) => {
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
    return { ...value, navigate, navigatePlugin };
  }, [value, registry]);

  return createElement(
    GuardRegistryContext.Provider,
    { value: registry },
    createElement(NavigationContext.Provider, { value: guarded }, children),
  );
}

function useNavigation(): NavigationContextValue {
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

export interface AppLinkProps<T extends RouteToken> {
  to: T;
  search?: RouteSearch<T>;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  'aria-current'?: AriaAttributes['aria-current'];
}

/**
 * A real anchor (so middle-click / open-in-new-tab keep working) that drives a
 * client-side transition on plain left-click. Modified clicks (new tab/window,
 * download) fall through to the browser's default handling.
 */
export function AppLink<T extends RouteToken>({
  to,
  search,
  children,
  className,
  'aria-label': ariaLabel,
  'aria-current': ariaCurrent,
}: AppLinkProps<T>): ReactNode {
  const { navigate, resolvePath } = useNavigation();
  const href = resolvePath(to, search);
  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      navigate(to, search);
    },
    [navigate, to, search],
  );
  return createElement(
    'a',
    { href, className, 'aria-label': ariaLabel, 'aria-current': ariaCurrent, onClick },
    children,
  );
}
