/**
 * The shell's structural routes: the root, the public `/login`, the pathless authed
 * layout whose `beforeLoad` redirects to `/login` when unauthenticated (the returnTo
 * pin), and the capability-gated landing index. The feature routes hang off the
 * returned `authedLayout` (see `feature-routes`).
 */
import type { ReactNode } from 'react';
import { createRootRoute, createRoute, redirect, Outlet, useSearch } from '@tanstack/react-router';
import type { AuthState } from '@tai42/studio-sdk';

import { ShellLayout } from './shell-layout';
import { LoginPage } from './login-page';
import { LandingRoute } from './landing-route';
import { safeInternalPath } from './route-search';
import type { PluginLoader } from './plugin-loader';

export interface ShellRoutesOptions {
  readonly plugins: PluginLoader;
  readonly getAuth: () => AuthState;
}

export function buildShellRoutes(options: ShellRoutesOptions) {
  const { plugins, getAuth } = options;

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    validateSearch: (
      search: Record<string, unknown>,
    ): { redirect?: string; sso?: string; invite?: string } => ({
      redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
      // The one-time SSO hand-back code and the invite token pass through to the
      // login renderer; both are optional.
      sso: typeof search.sso === 'string' ? search.sso : undefined,
      invite: typeof search.invite === 'string' ? search.invite : undefined,
    }),
    component: function LoginRoute(): ReactNode {
      const search = useSearch({ from: '/login' });
      return (
        <LoginPage
          returnTo={safeInternalPath(search.redirect)}
          ssoCode={search.sso}
          inviteToken={search.invite}
        />
      );
    },
  });

  const authedLayout = createRoute({
    getParentRoute: () => rootRoute,
    id: 'authed',
    beforeLoad: ({ location }) => {
      if (!getAuth().isAuthenticated) {
        // TanStack's redirect() is a control-flow signal designed to be thrown from
        // beforeLoad — it is not an Error object.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw redirect({ to: '/login', search: { redirect: location.href } });
      }
    },
    component: (): ReactNode => <ShellLayout loader={plugins} />,
  });

  const indexRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/',
    // No fixed redirect: capabilities are unknowable until the projection loads,
    // so the landing route renders inside the shell and navigates to the first
    // covered feature entry once it resolves.
    component: (): ReactNode => <LandingRoute />,
  });

  return { rootRoute, loginRoute, authedLayout, indexRoute };
}

/** The pathless authed layout route the feature routes parent onto. */
export type AuthedLayoutRoute = ReturnType<typeof buildShellRoutes>['authedLayout'];
