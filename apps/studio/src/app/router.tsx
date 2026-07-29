/**
 * The SHELL-owned route tree, built code-first. Feature packages export page
 * components + typed search contracts; they never define routes. Every data route
 * lives under a single pathless auth-layout route whose `beforeLoad` redirects to
 * `/login` (capturing the requested location as `redirect`) when unauthenticated —
 * the returnTo pin. `/login` and nothing else is public within the SPA.
 *
 * Studio-plugin pages mount under the shell-owned catch-all `/plugins/$pluginId/$`,
 * resolved from the runtime registry — never part of the compile-time typed tree.
 */
import type { ReactNode } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
  useParams,
  useSearch,
  type RouterHistory,
} from '@tanstack/react-router';
import type { AuthState, RouteSearch } from '@tai42/studio-sdk';
import { ToolsPage } from '@tai42/feature-tools';
import { AgentsPage } from '@tai42/feature-agents';
import { PresetsPage } from '@tai42/feature-presets';
import { ExtensionsPage } from '@tai42/feature-extensions';
import { InteractionsPage } from '@tai42/feature-interactions';
import { NotificationsPage } from '@tai42/feature-notifications';
import { ConnectorsPage } from '@tai42/feature-connectors';
import { HooksPage } from '@tai42/feature-hooks';
import { TemplatesPage } from '@tai42/feature-templates';
import { StoragePage } from '@tai42/feature-storage';
import { ManifestPage } from '@tai42/feature-manifest';
import { SettingsPage } from '@tai42/feature-settings';
import { SystemPage } from '@tai42/feature-system';
import { SchedulingPage } from '@tai42/feature-scheduling';
import { ObservabilityPage } from '@tai42/feature-observability';
import { MarketplacePage } from '@tai42/feature-marketplace';

import { ShellLayout } from './shell-layout';
import { LoginPage } from './login-page';
import { LandingRoute } from './landing-route';
import { PluginPage } from './plugin-page';
import { RouteErrorComponent } from './error-boundary';
import type { PluginLoader } from './plugin-loader';

/**
 * A same-origin internal path safe to redirect to after login. Only an
 * unambiguous root-relative path is accepted: it must start with a single `/` and
 * carry no backslash or control character. A browser folds `\` to `/` and strips
 * tab/newline/CR from a URL before navigating, so a value like `/\evil.com` or
 * `/<tab>/evil.com` would otherwise normalize into a protocol-relative `//host`
 * cross-origin open redirect. Anything ambiguous — protocol-relative `//host`, an
 * absolute URL with a scheme/host, or a value not rooted at `/` — falls back to
 * the root `/`, where the capability-gated landing route picks the destination.
 */
export function safeInternalPath(raw: string | undefined): string {
  if (raw === undefined) return '/';
  // Reject backslashes (browsers fold `\` to `/`) and C0 control chars + DEL
  // (browsers strip tab/newline/CR from URLs), either of which can turn a
  // `/…`-looking value into a protocol-relative `//host` cross-origin redirect.
  // eslint-disable-next-line no-control-regex -- rejecting control chars is the point.
  if (/[\\\x00-\x1f\x7f]/.test(raw)) return '/';
  // Root-relative only, and never protocol-relative (`//host`).
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/** A finite string enum: returns the value only when it is one of `allowed`. */
function parseEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | undefined {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

/** A finite number: coerces strings/numbers via `Number`, dropping NaN and non-finite. */
function parseNumber(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Tags accepted as a JSON string array or a comma-separated list; blanks dropped. */
function parseTags(raw: unknown): string[] | undefined {
  const fromString = (value: string): string[] => {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === 'string');
        }
      } catch {
        // A malformed JSON array falls through to comma-splitting the raw string.
      }
    }
    return trimmed.split(',');
  };
  const values = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : typeof raw === 'string'
      ? fromString(raw)
      : [];
  const tags = values.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  return tags.length > 0 ? tags : undefined;
}

/**
 * Parse the `/observability` URL search into its typed shape. Every field is
 * optional (a bare `/observability` is valid); malformed user-typed values are
 * dropped rather than thrown so a hand-edited URL never breaks navigation.
 */
function parseObservabilitySearch(search: Record<string, unknown>): RouteSearch<'observability'> {
  return {
    tab: parseEnum(search.tab, ['dashboard', 'tracing'] as const),
    from: typeof search.from === 'string' ? search.from : undefined,
    to: typeof search.to === 'string' ? search.to : undefined,
    tags: parseTags(search.tags),
    status: parseEnum(search.status, ['error', 'success'] as const),
    minCost: parseNumber(search.minCost),
    maxCost: parseNumber(search.maxCost),
    minTokens: parseNumber(search.minTokens),
    maxTokens: parseNumber(search.maxTokens),
    minLatencyMs: parseNumber(search.minLatencyMs),
    maxLatencyMs: parseNumber(search.maxLatencyMs),
    sort: parseEnum(search.sort, ['createdAt', 'cost', 'latencyMs', 'totalTokens'] as const),
    dir: parseEnum(search.dir, ['asc', 'desc'] as const),
    trace: typeof search.trace === 'string' ? search.trace : undefined,
  };
}

/**
 * Parse the `/marketplace` URL search into its typed shape. Every field is
 * optional (a bare `/marketplace` is valid); malformed user-typed values are
 * dropped rather than thrown so a hand-edited URL never breaks navigation.
 */
function parseMarketplaceSearch(search: Record<string, unknown>): RouteSearch<'marketplace'> {
  return {
    tab: parseEnum(search.tab, ['browse', 'installed'] as const),
    q: typeof search.q === 'string' ? search.q : undefined,
    kind: typeof search.kind === 'string' ? search.kind : undefined,
    category: typeof search.category === 'string' ? search.category : undefined,
    tags: parseTags(search.tags),
    sort: parseEnum(search.sort, ['downloads', 'updated', 'name', 'relevance'] as const),
    plugin: typeof search.plugin === 'string' ? search.plugin : undefined,
  };
}

export interface BuildRouterOptions {
  readonly plugins: PluginLoader;
  /**
   * The LIVE auth state, read at guard time. A getter (not a value/router context)
   * so `beforeLoad` sees the credential the instant it changes — the composition
   * root mirrors React auth into it synchronously during render, so a post-login
   * navigation is already authenticated when its guard re-evaluates (no redirect
   * loop between /login and the destination).
   */
  readonly getAuth: () => AuthState;
  /** A memory history for tests; defaults to the browser history in production. */
  readonly history?: RouterHistory;
}

export function buildRouter(options: BuildRouterOptions) {
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

  const toolsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/tools',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'tools'> => ({
      tool: typeof search.tool === 'string' ? search.tool : undefined,
      tags: parseTags(search.tags),
    }),
    component: function ToolsRoute(): ReactNode {
      return <ToolsPage search={useSearch({ from: '/authed/tools' })} />;
    },
  });

  const agentsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/agents',
    component: (): ReactNode => <AgentsPage />,
  });

  const presetsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/presets',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'presets'> => ({
      preset: typeof search.preset === 'string' ? search.preset : undefined,
    }),
    component: function PresetsRoute(): ReactNode {
      return <PresetsPage search={useSearch({ from: '/authed/presets' })} />;
    },
  });

  const extensionsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/extensions',
    component: (): ReactNode => <ExtensionsPage search={{}} />,
  });

  const interactionsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/interactions',
    component: (): ReactNode => <InteractionsPage search={{}} />,
  });

  const notificationsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/notifications',
    component: (): ReactNode => <NotificationsPage search={{}} />,
  });

  const connectorsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/connectors',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'connectors'> => ({
      connection: typeof search.connection === 'string' ? search.connection : undefined,
    }),
    component: function ConnectorsRoute(): ReactNode {
      return <ConnectorsPage search={useSearch({ from: '/authed/connectors' })} />;
    },
  });

  const hooksRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/hooks',
    component: (): ReactNode => <HooksPage search={{}} />,
  });

  const templatesRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/templates',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'templates'> => ({
      template: typeof search.template === 'string' ? search.template : undefined,
    }),
    component: function TemplatesRoute(): ReactNode {
      return <TemplatesPage search={useSearch({ from: '/authed/templates' })} />;
    },
  });

  const storageRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/storage',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'storage'> => ({
      filter: typeof search.filter === 'string' ? search.filter : undefined,
    }),
    component: function StorageRoute(): ReactNode {
      return <StoragePage search={useSearch({ from: '/authed/storage' })} />;
    },
  });

  const manifestRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/manifest',
    component: (): ReactNode => <ManifestPage search={{}} />,
  });

  const settingsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/settings',
    component: (): ReactNode => <SettingsPage search={{}} />,
  });

  const systemRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/system',
    component: (): ReactNode => <SystemPage search={{}} />,
  });

  const schedulingRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/scheduling',
    component: (): ReactNode => <SchedulingPage search={{}} />,
  });

  const observabilityRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/observability',
    validateSearch: parseObservabilitySearch,
    component: function ObservabilityRoute(): ReactNode {
      return <ObservabilityPage search={useSearch({ from: '/authed/observability' })} />;
    },
  });

  const marketplaceRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/marketplace',
    validateSearch: parseMarketplaceSearch,
    component: function MarketplaceRoute(): ReactNode {
      return <MarketplacePage search={useSearch({ from: '/authed/marketplace' })} />;
    },
  });

  const pluginRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/plugins/$pluginId/$',
    // Gate ONLY plugin-page resolution on the load pass; core routes never wait.
    loader: () => plugins.ensureLoaded(),
    component: function PluginRoute(): ReactNode {
      const { pluginId, _splat } = useParams({ from: '/authed/plugins/$pluginId/$' });
      return <PluginPage loader={plugins} pluginId={pluginId} path={_splat ?? ''} />;
    },
  });

  const routeTree = rootRoute.addChildren([
    loginRoute,
    authedLayout.addChildren([
      indexRoute,
      toolsRoute,
      agentsRoute,
      presetsRoute,
      extensionsRoute,
      interactionsRoute,
      notificationsRoute,
      connectorsRoute,
      hooksRoute,
      templatesRoute,
      storageRoute,
      manifestRoute,
      settingsRoute,
      systemRoute,
      schedulingRoute,
      observabilityRoute,
      marketplaceRoute,
      pluginRoute,
    ]),
  ]);

  return createRouter({
    routeTree,
    history: options.history,
    defaultPreload: false,
    defaultErrorComponent: RouteErrorComponent,
  });
}

export type AppRouter = ReturnType<typeof buildRouter>;

/**
 * Register the built route tree with TanStack Router so the code-first routes are
 * type-known globally: `useSearch({ from })` / `useParams({ from })` resolve each
 * route's `validateSearch` shape at its `from` path, and `router.navigate` checks
 * its `to`/`search`. This is what lets a route component read its validated search
 * as the exact typed contract instead of an untyped `any`.
 */
declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
