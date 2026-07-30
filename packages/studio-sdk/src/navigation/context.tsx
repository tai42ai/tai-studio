import {
  createContext,
  createElement,
  useCallback,
  useContext,
  type AriaAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

import type { NavigationContextValue, RouteSearch, RouteToken } from './types';

/**
 * Shell-provided navigation. The context has no default: a feature rendered
 * outside the shell's {@link NavigationProvider} is a wiring bug, so
 * {@link useNavigation} raises loudly rather than silently no-op'ing a
 * transition.
 */
const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  value,
  children,
}: {
  value: NavigationContextValue;
  children: ReactNode;
}): ReactNode {
  return createElement(NavigationContext.Provider, { value }, children);
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
