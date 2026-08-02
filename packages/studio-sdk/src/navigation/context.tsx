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

/**
 * Shell-provided navigation. The context has no default: a feature rendered
 * outside the shell's {@link NavigationProvider} is a wiring bug, so
 * {@link useNavigation} raises loudly rather than silently no-op'ing a
 * transition.
 */
const NavigationContext = createContext<NavigationContextValue | null>(null);

/**
 * One armed navigation guard. Both fields are read live at decision time (the
 * registry holds this exact object, not a snapshot), so a consumer that flips
 * `when` or swaps its `handler` on re-render is reflected without re-registering.
 */
interface GuardEntry {
  when: boolean;
  handler: NavigationGuardHandler;
}

/**
 * The set of guards active under one {@link NavigationProvider}. It is the single
 * point every SDK-controlled navigation consults, so guards registered by a feature
 * and by a plugin page compose against the SAME registry — the guard boundary
 * crosses the plugin boundary exactly where navigation itself does.
 *
 * `run` walks the guards in registration order and stops at the first veto, so at
 * most one confirm dialog is shown even when several guards are armed. `subscribe`
 * lets the provider re-evaluate its browser-level listeners whenever the armed set
 * changes.
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
 * {@link NavigationContext} so the shell-supplied navigation value stays exactly the
 * contract the shell implements — the registry is SDK-owned and needs no shell code.
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

  // The last committed history entry the SDK observed (URL plus `window.history.state`).
  // It is what a canceled back/forward is restored to and what a browser-level guard
  // decision consults. Router-internal URL changes made OUTSIDE the SDK's navigate entry
  // points (an internal redirect / replaceState) are unobservable by design at this layer.
  const committedRef = useRef<{ href: string; state: unknown } | null>(null);

  // Mirror the registry's armed state into React so the browser-level listeners are
  // attached only while at least one guard is armed and are torn down otherwise.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(registry.hasArmedGuards());
    return registry.subscribe(() => {
      setArmed(registry.hasArmedGuards());
    });
  }, [registry]);

  useEffect(() => {
    if (!armed) return;

    // The entry a guard protects, captured URL + state together. Any back/forward that
    // lands elsewhere is first canceled back to here, so the user stays put — and the
    // router's own entry state survives — while the guard is consulted.
    committedRef.current = { href: window.location.href, state: window.history.state };
    // Set while replaying a guard-approved back/forward, so the `popstate` it triggers
    // is passed through instead of being re-intercepted.
    let bypass = false;
    // Latched while a guard decision for the current gesture is pending, so a second Back
    // fired mid-decision keeps canceling (re-pushing the restore) without starting a
    // concurrent `registry.run()` — one gesture, one dialog.
    let pending = false;
    // How many restore pushes we have stacked for the pending decision, so an approved
    // replay unwinds exactly that far in one `go(-depth)`. Reset per decision.
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
      // The browser has already moved in history; cancel it by restoring the committed
      // entry (URL and state) on top of wherever it landed. popstate exposes neither
      // direction nor distance, and this layer must not stamp a position marker into
      // history.state (the router owns that channel), so the restore can only push a new
      // entry — it cannot delete the ones the browser walked past. A vetoed BACK
      // round-trips cleanly ([B,A] -> [B,A']). A vetoed FORWARD necessarily strands the
      // forward target behind the restore ([B,A,C] + Forward + veto -> [B,A,C,A']; Back
      // then reaches C, not B); that residue is an accepted, self-healing limit — the
      // next pushState navigation truncates the stubs.
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
      // Browsers below the package floor (Chrome 108) still gate the native prompt on a
      // set `returnValue` rather than on `preventDefault` alone; the string is ignored
      // (browsers show their own copy). The property is typed deprecated but remains the
      // required trigger across that supported range.
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
        // Advance the committed entry to the page we just moved to, resolved through the
        // shell (the router may commit asynchronously, so `window.location` would be
        // stale). The new entry's router state is unobservable here, hence `state: null`.
        // A no-op if the guard disarmed between the allow and this call.
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
 * Guards compose against the provider's shared registry, so a feature and a plugin
 * page may each arm one and ANY veto blocks. Available to plugin pages for the same
 * reason navigation is: it flows through the shared {@link NavigationProvider}.
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
