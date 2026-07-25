/**
 * The shell's {@link NavigationContextValue} implementation: the runtime
 * resolution of opaque route TOKENS the SDK's `NavigationProvider` hands to every
 * feature. `navigate` drives a client-side transition; `resolvePath` produces the
 * href an `AppLink` anchor points at. Both go through {@link PATH} — the single
 * token→path binding — and the router.
 */
import type { NavigationContextValue, RouteSearch, RouteToken } from '@tai42/studio-sdk';

import { PATH } from './routes';
import type { AppRouter } from './router';

type NavigateArg = Parameters<AppRouter['navigate']>[0];
type BuildArg = Parameters<AppRouter['buildLocation']>[0];

export function createNavigation(router: AppRouter): NavigationContextValue {
  return {
    navigate: <T extends RouteToken>(token: T, search?: RouteSearch<T>): void => {
      // Tokens resolve to paths at runtime via PATH, so the literal-path typing of
      // `router.navigate` cannot express the destination; the option object is
      // asserted to the router's own parameter type (no `any`).
      void router.navigate({ to: PATH[token], search: search ?? {} } as NavigateArg);
    },
    resolvePath: <T extends RouteToken>(token: T, search?: RouteSearch<T>): string => {
      return router.buildLocation({ to: PATH[token], search: search ?? {} } as BuildArg).href;
    },
  };
}
