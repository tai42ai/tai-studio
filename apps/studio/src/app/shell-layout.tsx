/**
 * The authenticated shell chrome, wired onto the design-system layout classes:
 * a 232 px sidebar beside the scrolling content column at >=1024, a 72 px labelled
 * icon rail from 640, and a sticky 56 px mobile top bar below 640 whose hamburger
 * opens the navigation in a modal drawer. The routed feature page renders in the
 * `<Outlet/>` inside the centred content column.
 *
 * The nav is a PROJECTION of the caller's capabilities (`useCapabilities`): a full
 * projection shows every token, a scoped session shows only the tokens whose backing
 * routes it can reach, loading shows a skeleton, and a `/me` failure shows a loud
 * retryable ErrorState — never an optimistic full nav (the UI fails closed exactly
 * as the server would). Plugin nav entries + pages gate on their optional
 * `requiredCapabilities` the same way.
 *
 * The three-state theme control (light / dark / system) is rendered ONCE per
 * breakpoint — in the sidebar footer at >=640, in the top bar below 640 — never
 * both in one DOM, decided by `useBreakpoint`. Sign-out lives in the sidebar footer
 * at >=640 and in the drawer footer below 640, where the top bar has no room.
 *
 * A forward navigation (a nav-link activation) moves focus to the new page's `<h1>`;
 * the landing route's replace-navigation and Back/Forward restoration do not, per
 * the SPA route-change convention. A drawer nav-link activation closes the drawer
 * and lets that focus move win; Escape / overlay / close return focus to the
 * hamburger.
 *
 * On mount (post-login, since the auth guard gates this layout) it kicks off the
 * Studio-plugin load pass so contributed tool panels populate before the operator
 * opens a tool — core routes never block on it (only `/plugins/*` gates on the
 * pass via its route loader). The pass is itself gated on the projection: a scoped
 * session that cannot reach the registry route skips it (absence, not error).
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useRouter, useRouterState } from '@tanstack/react-router';
import { useStore } from 'zustand';
import {
  AppLink,
  Button,
  Drawer,
  ErrorState,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  NAV_ICONS,
  RadioGroup,
  SignOutIcon,
  Skeleton,
  SunIcon,
  coversAnyRoute,
  isFullProjection,
  useApi,
  useAuth,
  useBreakpoint,
  useCapabilities,
  useTheme,
  type CapabilityState,
  type RegisteredNavEntry,
  type ThemePreference,
} from '@tai42/studio-sdk';
import { getContributions } from '@tai42/studio-sdk/host';
import { ApiError, type MeProjection } from '@tai42/api-client';
import { InteractionsBadge } from '@tai42/feature-interactions';

import { DASHBOARD_TOKEN, NAV_SECTIONS, PATH, type FeatureToken } from './routes';
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

const navListStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: '2px',
} as const;

/** Vertical rhythm between the Dashboard row and each labelled nav section. */
const navGroupsStyle = {
  display: 'grid',
  gap: 'var(--tai-space-3)',
} as const;

function NavItem({ token }: { token: FeatureToken }): ReactNode {
  const { pathname } = useLocation();
  const isActive = pathname === PATH[token];
  const Icon = NAV_ICONS[token];
  return (
    <li>
      <AppLink to={token} className="tai-nav-link" aria-current={isActive ? 'page' : undefined}>
        <Icon />
        <span>{NAV_LABELS[token]}</span>
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
 * with the color inherited from the link; a plugin without an icon gets a fixed
 * empty box so its label aligns with the iconned rows.
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
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            flex: 'none',
          }}
        >
          {Icon !== undefined ? <Icon /> : null}
        </span>
        <span>{entry.title}</span>
      </Link>
    </li>
  );
}

/** The DOM id of a section's header, so its item list can be `aria-labelledby` it
 * (the list is named by the visible header, not a duplicated `aria-label`). The
 * `prefix` is per-`NavBody`-instance (a `useId()`): the sidebar and the mobile
 * drawer render the SAME sections, and when both are live (drawer open at the
 * phone band) a document-global `nav-section-<label>` id would be duplicated —
 * a WCAG 2.1 SC 4.1.1 / axe `duplicate-id-aria` failure. */
function sectionHeaderId(prefix: string, label: string): string {
  return `${prefix}nav-section-${label.toLowerCase()}`;
}

/**
 * The primary nav body under a ready projection: the standalone Dashboard row
 * first, then each {@link NAV_SECTIONS} group as an uppercase muted header over
 * its items. Every row is capability-filtered by {@link tokenCovered}; a section
 * whose items are ALL filtered out renders NOTHING (no empty labelled group), and
 * the Dashboard row hides the same way.
 */
function NavSections({ projection }: { projection: MeProjection }): ReactNode {
  // Unique per NavBody instance, so the sidebar's and the drawer's copies of the
  // same sections never share a header id when both are mounted (drawer open).
  const idPrefix = useId();
  return (
    <div style={navGroupsStyle}>
      {tokenCovered(projection, DASHBOARD_TOKEN) ? (
        <ul style={navListStyle}>
          <NavItem token={DASHBOARD_TOKEN} />
        </ul>
      ) : null}
      {NAV_SECTIONS.map((section) => {
        const tokens = section.tokens.filter((token) => tokenCovered(projection, token));
        if (tokens.length === 0) return null;
        const headerId = sectionHeaderId(idPrefix, section.label);
        return (
          <div key={section.label}>
            <div id={headerId} className="tai-nav-section-header">
              {section.label}
            </div>
            <ul style={navListStyle} aria-labelledby={headerId}>
              {tokens.map((token) => (
                <NavItem key={token} token={token} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

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

/**
 * The Primary + Plugins navigation, shared by the sidebar and the mobile drawer.
 * The primary nav follows the capability projection's three states; the Plugins
 * nav appears only when a contribution is both loaded and covered.
 */
function NavBody({
  state,
  retry,
  visibleNavEntries,
}: {
  state: CapabilityState;
  retry: () => void;
  visibleNavEntries: readonly RegisteredNavEntry[];
}): ReactNode {
  return (
    <>
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
          <NavSections projection={state.projection} />
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
    </>
  );
}

/** The brand row: the theme-matched mark plus the wordmark. The label hides in the
 * 72 px rail (the mark stands alone there); the mark is decorative, the wordmark is
 * the accessible name where it shows. */
function Brand(): ReactNode {
  const { theme } = useTheme();
  const src = theme === 'dark' ? '/tai42-logo-icon-dark.png' : '/tai42-logo-icon.png';
  return (
    <div className="tai-brand">
      <img className="tai-brand-mark" src={src} alt="" width={24} height={24} />
      <span className="tai-brand-label">TAI42 Studio</span>
    </div>
  );
}

/** The three-state theme control: a segmented radiogroup of light / dark / system,
 * each an icon with a visually-hidden text name. Vertical in the 72 px rail (a
 * horizontal trio does not fit); horizontal elsewhere. */
function ThemeControl({ orientation }: { orientation: 'horizontal' | 'vertical' }): ReactNode {
  const { preference, setPreference } = useTheme();
  return (
    <RadioGroup
      aria-label="Theme"
      variant="segmented"
      orientation={orientation}
      value={preference}
      onValueChange={(value) => {
        setPreference(value as ThemePreference);
      }}
      options={[
        { value: 'light', label: 'Light', icon: <SunIcon />, visuallyHiddenLabel: true },
        { value: 'dark', label: 'Dark', icon: <MoonIcon />, visuallyHiddenLabel: true },
        { value: 'system', label: 'System', icon: <MonitorIcon />, visuallyHiddenLabel: true },
      ]}
    />
  );
}

/** Sign-out. Icon-only in the 72 px rail (a labelled button does not fit), icon +
 * label everywhere else. The accessible name is always "Sign out". */
function SignOutButton({
  compact,
  onSignOut,
}: {
  compact: boolean;
  onSignOut: () => void;
}): ReactNode {
  if (compact) {
    return (
      <button type="button" className="tai-icon-btn" aria-label="Sign out" onClick={onSignOut}>
        <SignOutIcon />
      </button>
    );
  }
  return (
    <Button variant="ghost" onClick={onSignOut}>
      <SignOutIcon />
      Sign out
    </Button>
  );
}

export function ShellLayout({ loader }: { loader: PluginLoader }): ReactNode {
  const { logout } = useAuth();
  const api = useApi();
  const { state, retry } = useCapabilities();
  const { band, isPhone } = useBreakpoint();
  const integrityEnforced = useMemo(() => importMapIntegrityEnforced(), []);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The drawer is a phone-only affordance: its opener (the top-bar hamburger) is
  // hidden at >=640. A drawer left open across a widen would be an orphaned modal
  // and a second VISIBLE "Primary" landmark beside the re-shown sidebar, so close
  // it the moment the band leaves phone. (`setDrawerOpen(false)` while already
  // closed is a no-op React bails out of, so this is inert off the phone band.)
  useEffect(() => {
    if (!isPhone) setDrawerOpen(false);
  }, [isPhone]);

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

  // A FORWARD navigation (a nav-link activation) dismisses the mobile drawer and
  // moves focus to the new page's <h1>. The history action distinguishes that
  // PUSH from the landing route's replace-navigation (REPLACE) and Back/Forward
  // restoration (BACK/FORWARD), so initial load and history traversal do neither.
  // The focus move runs on the next frame, after the route has committed and after
  // a closing drawer has returned focus to its opener, so a drawer nav-click lands
  // on the heading, not the hamburger. (Escape / overlay / close leave this alone
  // and let Radix return focus to the hamburger.)
  const router = useRouter();
  const pendingFocus = useRef(false);
  useEffect(() => {
    return router.history.subscribe(({ action }) => {
      if (action.type !== 'PUSH') return;
      pendingFocus.current = true;
      setDrawerOpen(false);
    });
  }, [router]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    const frame = requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      const heading = main?.querySelector('h1') ?? null;
      const target = heading ?? main;
      if (target === null) return;
      if (heading !== null && !heading.hasAttribute('tabindex')) {
        heading.setAttribute('tabindex', '-1');
      }
      target.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

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
  const signOut = (): void => {
    void handleSignOut();
  };

  return (
    <div className="tai-shell">
      <a href="#main-content" className="tai-skip-link">
        Skip to content
      </a>

      <aside className="tai-shell-sidebar">
        <Brand />
        <NavBody state={state} retry={retry} visibleNavEntries={visibleNavEntries} />
        {isPhone ? null : (
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--tai-space-3)',
            }}
          >
            <ThemeControl orientation={band === 'compact' ? 'vertical' : 'horizontal'} />
            <SignOutButton compact={band === 'compact'} onSignOut={signOut} />
          </div>
        )}
      </aside>

      <header className="tai-topbar">
        <Brand />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
          {isPhone ? <ThemeControl orientation="horizontal" /> : null}
          <Drawer
            title="Navigation"
            side="left"
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            trigger={
              <button type="button" className="tai-icon-btn" aria-label="Open navigation">
                <MenuIcon />
              </button>
            }
          >
            <div className="tai-stack">
              <NavBody state={state} retry={retry} visibleNavEntries={visibleNavEntries} />
              <div style={{ marginTop: 'var(--tai-space-2)' }}>
                <SignOutButton compact={false} onSignOut={signOut} />
              </div>
            </div>
          </Drawer>
        </div>
      </header>

      <main id="main-content" className="tai-shell-main" tabIndex={-1}>
        <div className="tai-page">
          {integrityEnforced ? null : <IntegrityBanner />}
          <RouteCapabilityBoundary>
            <Outlet />
          </RouteCapabilityBoundary>
        </div>
      </main>

      {interactionsVisible ? <InteractionsBadge /> : null}
    </div>
  );
}
