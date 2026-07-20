/**
 * The authenticated shell chrome: a sidebar of `AppLink`s to the mounted feature
 * routes, a theme toggle, the globally-surfaced interactions floating badge, and
 * the loud integrity-unsupported banner. The routed feature page renders in the
 * `<Outlet/>`.
 *
 * The nav is a PROJECTION of the caller's capabilities (`useCapabilities`): a full
 * projection shows every token (today's nav), a scoped session shows only the
 * tokens whose backing routes it can reach, loading shows a skeleton, and a `/me`
 * failure shows a loud retryable ErrorState — never an optimistic full nav (the
 * UI fails closed exactly as the server would). Plugin nav entries + pages gate on
 * their optional `requiredCapabilities` the same way.
 *
 * On mount (post-login, since the auth guard gates this layout) it kicks off the
 * Studio-plugin load pass so contributed tool panels populate before the operator
 * opens a tool — core routes never block on it (only `/plugins/*` gates on the
 * pass via its route loader). The pass is itself gated on the projection: a scoped
 * session that cannot reach the registry route skips it (absence, not error).
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { useStore } from 'zustand';
import {
  AppLink,
  Button,
  ErrorState,
  Skeleton,
  coversAnyRoute,
  isFullProjection,
  useApi,
  useAuth,
  useCapabilities,
  useTheme,
  type RegisteredNavEntry,
} from '@tai42/studio-sdk';
import { getContributions } from '@tai42/studio-sdk/host';
import { ApiError } from '@tai42/api-client';
import { InteractionsBadge } from '@tai42/feature-interactions';

import { FEATURE_TOKENS, PATH, type FeatureToken } from './routes';
import { contributionCovered, tokenCovered } from './token-requirements';
import { RouteCapabilityBoundary } from './route-capability-boundary';
import { SIGN_OUT_NOTICE_KEY } from './login-page';
import { IntegrityBanner, importMapIntegrityEnforced } from './integrity';
import type { PluginLoader } from './plugin-loader';

/** The authed plugin-registry read route the load pass fetches; a scoped session
 * loads plugins only when its projection reaches it. */
const PLUGIN_REGISTRY_ROUTE = '/api/plugins';

/** The interactions surface the floating badge subscribes to over SSE; a scoped
 * session mounts the badge only when its projection reaches it (fail closed — an
 * uncovered session would otherwise open a stream the server 403s). */
const INTERACTIONS_ROUTE = '/api/interactions';

const NAV_LABELS: Record<FeatureToken, string> = {
  tools: 'Tools',
  agents: 'Agents',
  presets: 'Presets',
  extensions: 'Extensions',
  interactions: 'Interactions',
  notifications: 'Notifications',
  connectors: 'Connectors',
  hooks: 'Hooks',
  templates: 'Templates',
  storage: 'Storage',
  manifest: 'Manifest',
  settings: 'Settings',
  system: 'System',
  scheduling: 'Scheduling',
  observability: 'Dashboard',
  marketplace: 'Marketplace',
};

function NavItem({ token }: { token: FeatureToken }): ReactNode {
  const { pathname } = useLocation();
  const isActive = pathname === PATH[token];
  return (
    <li>
      <AppLink to={token} className="tai-nav-link" aria-current={isActive ? 'page' : undefined}>
        {NAV_LABELS[token]}
      </AppLink>
    </li>
  );
}

/**
 * A sidebar link a plugin contributed via `registerNavEntry`. It targets the
 * plugin's own page under the shell's catch-all (`/plugins/{pluginId}/{path}`) —
 * a path outside the token-typed feature contract, so it uses the router's own
 * `Link` rather than the token-typed `AppLink`. The optional icon renders in a
 * fixed, `aria-hidden` box before the title (the accessible name is the title),
 * with the color inherited from the link.
 */
function PluginNavItem({ entry }: { entry: RegisteredNavEntry }): ReactNode {
  const { pathname } = useLocation();
  const href = `/plugins/${entry.pluginId}/${entry.path}`;
  const Icon = entry.icon;
  return (
    <li>
      <Link
        to={href}
        className="tai-nav-link"
        aria-current={pathname === href ? 'page' : undefined}
      >
        {Icon !== undefined ? (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              width: '1em',
              height: '1em',
              marginRight: 'var(--tai-space-2)',
              verticalAlign: '-0.125em',
            }}
          >
            <Icon />
          </span>
        ) : null}
        {entry.title}
      </Link>
    </li>
  );
}

const navListStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: '2px',
} as const;

/** Placeholder nav rows shown while the capability projection loads, so the
 * sidebar reserves its space instead of flashing an empty or full nav. */
function NavSkeleton(): ReactNode {
  return (
    <ul aria-hidden="true" style={navListStyle}>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <li key={row} style={{ padding: 'var(--tai-space-2) 0' }}>
          <Skeleton height={16} />
        </li>
      ))}
    </ul>
  );
}

export function ShellLayout({ loader }: { loader: PluginLoader }): ReactNode {
  const { theme, toggle } = useTheme();
  const { logout } = useAuth();
  const api = useApi();
  const { state, retry } = useCapabilities();
  const integrityEnforced = useMemo(() => importMapIntegrityEnforced(), []);

  // Plugin nav entries are read only once the load pass has committed them; the
  // status subscription re-renders this section when the pass completes. Core nav
  // never waits on the pass, so the primary nav below renders immediately.
  const status = useStore(loader.store, (s) => s.status);
  const navEntries = useMemo(
    () => (status === 'ready' ? getContributions().navEntries : []),
    [status],
  );
  // A plugin nav entry shows only when the projection covers its declared
  // `requiredCapabilities` (absent ⇒ full projection only); the whole Plugins nav
  // is hidden until the projection is ready.
  const visibleNavEntries = useMemo(
    () =>
      state.status === 'ready'
        ? navEntries.filter((entry) =>
            contributionCovered(state.projection, entry.requiredCapabilities),
          )
        : [],
    [navEntries, state],
  );

  // The globally-mounted interactions badge opens an SSE the instant it mounts, so
  // it must gate on the projection like the nav does: a scoped session without
  // interactions access never mounts it (never opens a stream the server denies).
  // While loading/failed it stays absent — no SSE before the projection is known.
  const interactionsVisible =
    state.status === 'ready' &&
    (isFullProjection(state.projection) || coversAnyRoute(state.projection, [INTERACTIONS_ROUTE]));

  useEffect(() => {
    // Eager post-login load so contributed tool panels are ready; loud plugin
    // errors surface on `/plugins/*`, and a 401 here redirects to /login. The pass
    // is gated on the capability projection: a full projection always loads;
    // a scoped session loads only when it can reach the registry route, else it
    // skips with no plugin nav and no error card (absence is the correct rendering
    // of "not yours"). On `failed`/`loading` it defers — the nav ErrorState
    // surfaces a `/me` failure, and loading simply waits.
    if (state.status !== 'ready') return;
    const projection = state.projection;
    if (isFullProjection(projection) || coversAnyRoute(projection, [PLUGIN_REGISTRY_ROUTE])) {
      void loader.ensureLoaded();
    } else {
      console.info(
        'Studio plugins are outside this session’s capabilities; skipping the load pass.',
      );
    }
  }, [loader, state]);

  // Sign-out revokes the server-side session BEFORE clearing the local credential
  // (the revoke call needs it), then clears UNCONDITIONALLY so a dead server never
  // traps the user signed in. A 404 is the expected answer for a plain API key
  // (nothing to revoke) and stays quiet; any other failure may mean a real
  // accounts session did NOT revoke — the exact leak this closes — so it surfaces
  // loudly (console.error) AND threads a one-shot notice onto the /login screen the
  // sign-out redirects to, giving the operator a non-blocking user-visible signal.
  async function handleSignOut(): Promise<void> {
    try {
      await api.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        console.error(error);
        try {
          globalThis.sessionStorage.setItem(SIGN_OUT_NOTICE_KEY, '1');
        } catch {
          // Storage unavailable — the console.error above stays the loud signal.
        }
      }
    } finally {
      logout();
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex' }}>
      <a href="#main-content" className="tai-skip-link">
        Skip to content
      </a>
      <aside
        style={{
          width: '15rem',
          flex: '0 0 auto',
          borderRight: '1px solid var(--tai-color-border)',
          background: 'var(--tai-color-surface-raised)',
          padding: 'var(--tai-space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--tai-space-4)',
        }}
      >
        <div style={{ font: 'var(--tai-text-lg) var(--tai-font-sans)', fontWeight: 600 }}>
          TAI42 Studio
        </div>
        <nav aria-label="Primary">
          {state.status === 'loading' ? (
            <NavSkeleton />
          ) : state.status === 'failed' ? (
            // Fail closed and loud: never an optimistic full nav on a `/me` error.
            <ErrorState
              message="Your access could not be loaded. Retry to reload the navigation."
              onRetry={retry}
            />
          ) : (
            <ul style={navListStyle}>
              {FEATURE_TOKENS.filter((token) => tokenCovered(state.projection, token)).map(
                (token) => (
                  <NavItem key={token} token={token} />
                ),
              )}
            </ul>
          )}
        </nav>
        {visibleNavEntries.length > 0 ? (
          <nav aria-label="Plugins">
            <ul style={navListStyle}>
              {visibleNavEntries.map((entry) => (
                <PluginNavItem key={`${entry.pluginId}/${entry.path}`} entry={entry} />
              ))}
            </ul>
          </nav>
        ) : null}
        <div style={{ marginTop: 'auto', display: 'grid', gap: 'var(--tai-space-2)' }}>
          <Button
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </Button>
          <Button onClick={() => void handleSignOut()} aria-label="Sign out">
            Sign out
          </Button>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} style={{ flex: '1 1 auto', minWidth: 0 }}>
        {integrityEnforced ? null : <IntegrityBanner />}
        <div style={{ padding: 'var(--tai-space-6)' }}>
          <RouteCapabilityBoundary>
            <Outlet />
          </RouteCapabilityBoundary>
        </div>
      </main>
      {interactionsVisible ? <InteractionsBadge /> : null}
    </div>
  );
}
