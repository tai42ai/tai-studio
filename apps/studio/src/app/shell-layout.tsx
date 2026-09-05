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
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
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
  PageFillProvider,
  PluginIcon,
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
  useNavigationGate,
  usePageFillActive,
  usePluginNavigation,
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
import { pathHasPrefix } from './plugin-page-resolve';
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
  presets: 'Custom nodes',
  extensions: 'Extensions',
  interactions: 'Interactions',
  notifications: 'Notifications',
  conversations: 'Conversations',
  connectors: 'Connectors',
  servedEndpoints: 'Served endpoints',
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

/** The core section labels a plugin nav entry may target. */
const CORE_SECTION_LABELS: ReadonlySet<string> = new Set(NAV_SECTIONS.map((s) => s.label));

/** The label of the single generic section that collects every plugin nav entry
 * naming no core section. Rendered AFTER the core sections; not itself a core
 * section, so it never appears in {@link CORE_SECTION_LABELS}. */
const PLUGINS_SECTION_LABEL = 'Plugins';

/** Plugin id → its version, for the provenance badge. */
type PluginVersions = ReadonlyMap<string, string>;

/**
 * The CORE section a plugin nav entry targets, or `null` when it names none — an absent
 * field, or any value that is not a live core section (a bundle newer than this host).
 * A `null` result renders the entry in the generic {@link PLUGINS_SECTION_LABEL} section.
 * Tolerant by design: the field is a placement hint, not a hard contract.
 */
function coreSectionOf(entry: RegisteredNavEntry): string | null {
  if (entry.section === undefined) return null;
  return CORE_SECTION_LABELS.has(entry.section) ? entry.section : null;
}

/**
 * Nav entries in render order WITHIN a section: ascending `order`, every entry that
 * omits it AFTER the ordered ones, ties broken by registration order. `Array.sort`
 * is stable (ES2019+), so equal keys keep their incoming (registration) order, and a
 * missing `order` sorts as +∞ so it always trails an explicit weight.
 */
function sortNavEntries(entries: readonly RegisteredNavEntry[]): RegisteredNavEntry[] {
  return [...entries].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
}

/**
 * The entries that name no core section, in render order for the single generic
 * {@link PLUGINS_SECTION_LABEL} section: sorted by {@link sortNavEntries} across ALL
 * contributing plugins. Entries from different plugins INTERLEAVE by those same rules —
 * ascending `order`, absent last, ties broken by registration order — because the
 * incoming array is already in registration order and the sort is stable. There is no
 * per-plugin grouping or header: multiple plugins share this one section, so each entry
 * keeps its own self-identifying title and carries its own per-entry provenance badge
 * (the section header cannot name any single plugin).
 */
function pluginSectionEntries(entries: readonly RegisteredNavEntry[]): RegisteredNavEntry[] {
  return sortNavEntries(entries.filter((entry) => coreSectionOf(entry) === null));
}

/**
 * The HOST-APPLIED provenance mark on plugin-contributed nav: a small muted glyph the
 * SHELL renders (a plugin cannot suppress, restyle, or forge it). It links to the
 * marketplace — deep to the plugin's row when the id is a "namespace/name" ref, else to
 * the marketplace Installed tab — names itself "Plugin: <display name> <version>" for hover
 * (title) and assistive tech (aria-label), and knows nothing about any specific plugin.
 * The display name is the plugin's id (the manifest carries no separate display name).
 */
function PluginProvenanceBadge({
  pluginId,
  version,
}: {
  pluginId: string;
  version: string | undefined;
}): ReactNode {
  const label =
    version !== undefined && version !== ''
      ? `Plugin: ${pluginId} ${version}`
      : `Plugin: ${pluginId}`;
  // The marketplace detail deep-link (search.plugin) only resolves a "namespace/name"
  // ref — a bare id renders the detail page's Malformed-reference ErrorState. Studio
  // plugin ids are bare names, so deep-link ONLY when the id is already a marketplace
  // ref; otherwise land on the marketplace Installed tab — the contributing plugin is
  // by definition installed, so it is present in the list the user arrives at.
  const search = pluginId.includes('/') ? { plugin: pluginId } : { tab: 'installed' as const };
  return (
    <AppLink
      to="marketplace"
      search={search}
      className="tai-plugin-badge"
      title={label}
      aria-label={label}
    >
      <PluginIcon />
    </AppLink>
  );
}

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
 * a path outside the token-typed feature contract, so it anchors the router's own
 * `Link` and commits through the SDK's plugin navigation (which consults the armed
 * unsaved-changes guards) rather than the token-typed `AppLink`. The optional icon renders in a
 * fixed, `aria-hidden` box before the title (the accessible name is the title),
 * with the color inherited from the link; a plugin without an icon gets a fixed
 * empty box so its label aligns with the iconned rows.
 */
function PluginNavItem({
  entry,
  active,
  badge,
}: {
  entry: RegisteredNavEntry;
  active: boolean;
  /** The host provenance badge, rendered as a sibling of the link (never nested — two
   * anchors must not nest). Present per-entry for every plugin nav entry — both those
   * injected into a core section and those in the generic Plugins section, whose entries
   * come from different plugins so each carries its own badge. */
  badge?: ReactNode;
}): ReactNode {
  const { navigatePlugin, resolvePluginPath } = usePluginNavigation();
  const href = resolvePluginPath(entry.pluginId, entry.path);
  const Icon = entry.icon;
  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      navigatePlugin(entry.pluginId, entry.path);
    },
    [navigatePlugin, entry.pluginId, entry.path],
  );
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-1)' }}>
      {/* `activeOptions.exact` turns OFF the router Link's own prefix-match highlight
          (which would force `aria-current="page"` on EVERY ancestor entry of a deep
          link); the single winner is chosen once by the parent and passed in `active`. */}
      <Link
        to={href}
        className="tai-nav-link"
        activeOptions={{ exact: true }}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        style={{ flex: 1, minWidth: 0 }}
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
      {badge}
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
 * The primary nav body under a ready projection: the standalone Dashboard row first,
 * then each {@link NAV_SECTIONS} group as an uppercase muted header over its items —
 * the section's core tokens, then any plugin nav entry that targets that section
 * (after the core rows, each carrying a host provenance badge). AFTER the core
 * sections comes the single generic {@link PLUGINS_SECTION_LABEL} section: every entry
 * that names no core section, from any contributing plugin, interleaved by
 * {@link sortNavEntries} under one "Plugins" header, each entry keeping its own
 * self-identifying title and its own per-entry provenance badge. Core rows are
 * capability-filtered by {@link tokenCovered}; the plugin entries arrive already
 * filtered. A section with no visible item renders NOTHING (no empty labelled group —
 * the Plugins section included), and the Dashboard row hides the same way.
 */
function NavSections({
  projection,
  navEntries,
  activeKey,
  pluginVersions,
}: {
  projection: MeProjection;
  navEntries: readonly RegisteredNavEntry[];
  activeKey: string | undefined;
  pluginVersions: PluginVersions;
}): ReactNode {
  // Unique per NavBody instance, so the sidebar's and the drawer's copies of the
  // same sections never share a header id when both are mounted (drawer open).
  const idPrefix = useId();
  const pluginEntries = pluginSectionEntries(navEntries);
  const pluginsHeaderId = sectionHeaderId(idPrefix, PLUGINS_SECTION_LABEL);
  return (
    <div style={navGroupsStyle}>
      {tokenCovered(projection, DASHBOARD_TOKEN) ? (
        <ul style={navListStyle}>
          <NavItem token={DASHBOARD_TOKEN} />
        </ul>
      ) : null}
      {NAV_SECTIONS.map((section) => {
        const tokens = section.tokens.filter((token) => tokenCovered(projection, token));
        const entries = sortNavEntries(
          navEntries.filter((entry) => coreSectionOf(entry) === section.label),
        );
        if (tokens.length === 0 && entries.length === 0) return null;
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
              {entries.map((entry) => {
                const key = navEntryKey(entry);
                return (
                  <PluginNavItem
                    key={key}
                    entry={entry}
                    active={key === activeKey}
                    badge={
                      <PluginProvenanceBadge
                        pluginId={entry.pluginId}
                        version={pluginVersions.get(entry.pluginId)}
                      />
                    }
                  />
                );
              })}
            </ul>
          </div>
        );
      })}
      {pluginEntries.length > 0 ? (
        <div key={PLUGINS_SECTION_LABEL}>
          <div id={pluginsHeaderId} className="tai-nav-section-header">
            {PLUGINS_SECTION_LABEL}
          </div>
          <ul style={navListStyle} aria-labelledby={pluginsHeaderId}>
            {pluginEntries.map((entry) => {
              const key = navEntryKey(entry);
              // Entries here come from different plugins, so each row carries its OWN
              // provenance badge (reusing the same per-entry badge path as a core-section
              // injection) — the shared "Plugins" header names no single plugin.
              return (
                <PluginNavItem
                  key={key}
                  entry={entry}
                  active={key === activeKey}
                  badge={
                    <PluginProvenanceBadge
                      pluginId={entry.pluginId}
                      version={pluginVersions.get(entry.pluginId)}
                    />
                  }
                />
              );
            })}
          </ul>
        </div>
      ) : null}
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

/** The registry key of a nav entry — its owner + page path, unique across plugins. */
function navEntryKey(entry: RegisteredNavEntry): string {
  return `${entry.pluginId}/${entry.path}`;
}

/**
 * The key of the SINGLE nav entry that owns the current pathname, or undefined when
 * none matches. The winner is the entry whose href is the LONGEST prefix of the
 * pathname under the shared `/`-boundary rule ({@link pathHasPrefix}), mirroring the
 * page resolver's longest-prefix single-winner choice. When a plugin registers nested
 * entries that share a prefix (`flows` and `flows/detail`), a deep link under the
 * child highlights only the deepest match, so exactly one row carries
 * `aria-current="page"`; the ordinary single-entry deep link still highlights its one
 * entry.
 */
function activeNavKey(
  entries: readonly RegisteredNavEntry[],
  pathname: string,
): string | undefined {
  let winner: RegisteredNavEntry | undefined;
  let winnerHrefLength = -1;
  for (const entry of entries) {
    const href = `/plugins/${entry.pluginId}/${entry.path}`;
    if (pathHasPrefix(pathname, href) && href.length > winnerHrefLength) {
      winner = entry;
      winnerHrefLength = href.length;
    }
  }
  return winner === undefined ? undefined : navEntryKey(winner);
}

/**
 * The Primary navigation, shared by the sidebar and the mobile drawer. It follows
 * the capability projection's three states; when ready, {@link NavSections} renders
 * the core sections (each carrying the plugin entries that target it) followed by the
 * single generic "Plugins" section. There is no separate "Plugins" navigation
 * LANDMARK — the fallback plugin entries render as one section within this Primary nav.
 */
function NavBody({
  state,
  retry,
  visibleNavEntries,
  pluginVersions,
}: {
  state: CapabilityState;
  retry: () => void;
  visibleNavEntries: readonly RegisteredNavEntry[];
  pluginVersions: PluginVersions;
}): ReactNode {
  // The active plugin nav row is chosen ONCE for the whole list: only the longest
  // matching entry wins, so nested prefix entries never both light up.
  const { pathname } = useLocation();
  const activeKey = activeNavKey(visibleNavEntries, pathname);
  return (
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
        <NavSections
          projection={state.projection}
          navEntries={visibleNavEntries}
          activeKey={activeKey}
          pluginVersions={pluginVersions}
        />
      )}
    </nav>
  );
}

/**
 * Click handler for a chrome link whose target lies outside the route-token map.
 * The router's own `Link` commits a pushState the guard registry never sees, so an
 * armed unsaved-changes guard must be consulted here before the transition — plain
 * modified clicks (new tab/window) are left to the browser.
 */
function useGuardedChromeLink(href: string): (event: MouseEvent<HTMLAnchorElement>) => void {
  const gate = useNavigationGate();
  const router = useRouter();
  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      void gate(href).then((allowed) => {
        if (!allowed) return;
        void router.navigate({ to: href });
      });
    },
    [gate, router, href],
  );
}

/** The brand row: the theme-matched mark plus the wordmark, linking home. The mark
 * is decorative; the label hides in the 72 px rail, so the link carries an explicit
 * accessible name that survives that collapse. */
function Brand(): ReactNode {
  const { theme } = useTheme();
  const onGuardedClick = useGuardedChromeLink('/');
  const src = theme === 'dark' ? '/tai42-logo-icon-dark.png' : '/tai42-logo-icon.png';
  return (
    <Link to="/" className="tai-brand" aria-label="TAI42 Studio home" onClick={onGuardedClick}>
      <img className="tai-brand-mark" src={src} alt="" width={24} height={24} />
      <span className="tai-brand-label">TAI42 Studio</span>
    </Link>
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

/**
 * The routed content column. Reads {@link usePageFillActive} so a page that opted
 * into fill mode gets the viewport-height flex chain (`--fill` modifiers) while
 * every scrolling page keeps the default content-sized `.tai-page`. Lives under
 * the shell's {@link PageFillProvider} so the opt-in a page raises from inside the
 * `<Outlet/>` reaches these class names.
 */
function ShellMain({ integrityEnforced }: { integrityEnforced: boolean }): ReactNode {
  const fill = usePageFillActive();
  return (
    <main
      id="main-content"
      className={fill ? 'tai-shell-main tai-shell-main--fill' : 'tai-shell-main'}
      tabIndex={-1}
    >
      <div className={fill ? 'tai-page tai-page--fill' : 'tai-page'}>
        {integrityEnforced ? null : <IntegrityBanner />}
        <RouteCapabilityBoundary>
          <Outlet />
        </RouteCapabilityBoundary>
      </div>
    </main>
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
  // Plugin id → version, for the host provenance badge. Read from the same load-pass
  // store as `status`; a plugin not yet loaded is simply absent from the map, so the
  // badge names the plugin without a version.
  const loadedPlugins = useStore(loader.store, (s) => s.plugins);
  const pluginVersions = useMemo<PluginVersions>(
    () => new Map(loadedPlugins.map((p) => [p.name, p.version])),
    [loadedPlugins],
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
  //
  // Only a PUSH that CHANGES the pathname arms the focus move. A same-pathname
  // search-only PUSH (a feature screen setting its own `?tool=`/`?tags=`) must NOT
  // arm it — the pathname-keyed consumer below never runs for a same-path change,
  // so a flag set here would STRAND until the next real pathname change (a Back
  // included) wrongly consumed it and yanked focus. The last-focused pathname is
  // tracked in a ref, compared and updated in this same callback.
  //
  // As a second guard, EVERY non-PUSH action explicitly DISARMS any pending flag
  // AND resyncs the ref to the landed pathname. That covers BACK/FORWARD/REPLACE
  // and, critically, GO — the browser history's multi-step traversal (history
  // menu / long-press back / a delta ≥2), which `notify()` fires with `location`
  // already set to the destination. Enumerating a subset would let GO fall through
  // both branches, leaving `lastFocusPathname` stale so the next cross-path PUSH
  // could mis-judge same-vs-cross and skip (or re-strand) the focus move. History
  // traversal and replace-navigation never move focus, and never leave a flag or a
  // stale ref behind.
  const router = useRouter();
  const pendingFocus = useRef(false);
  const lastFocusPathname = useRef(router.history.location.pathname);
  useEffect(() => {
    return router.history.subscribe(({ action, location }) => {
      if (action.type !== 'PUSH') {
        pendingFocus.current = false;
        lastFocusPathname.current = location.pathname;
        return;
      }
      const changedPathname = location.pathname !== lastFocusPathname.current;
      lastFocusPathname.current = location.pathname;
      // A same-pathname PUSH leaves focus to the feature screen; only a
      // cross-pathname PUSH moves it to the destination heading.
      if (changedPathname) pendingFocus.current = true;
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
        <NavBody
          state={state}
          retry={retry}
          visibleNavEntries={visibleNavEntries}
          pluginVersions={pluginVersions}
        />
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
              <NavBody
                state={state}
                retry={retry}
                visibleNavEntries={visibleNavEntries}
                pluginVersions={pluginVersions}
              />
              <div style={{ marginTop: 'var(--tai-space-2)' }}>
                <SignOutButton compact={false} onSignOut={signOut} />
              </div>
            </div>
          </Drawer>
        </div>
      </header>

      <PageFillProvider>
        <ShellMain integrityEnforced={integrityEnforced} />
      </PageFillProvider>

      {interactionsVisible ? <InteractionsBadge /> : null}
    </div>
  );
}
