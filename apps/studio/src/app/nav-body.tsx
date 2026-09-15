/**
 * The Primary navigation body, shared by the sidebar and the mobile drawer. It
 * follows the capability projection's three states; when ready it renders the core
 * {@link NAV_SECTIONS} groups (each carrying the plugin entries that target it)
 * followed by the single generic "Plugins" section. Core rows are capability-filtered;
 * plugin entries arrive already filtered. A section with no visible item renders nothing.
 */
import type { MeProjection } from '@tai42/api-client';
import {
  AppLink,
  type CapabilityState,
  ErrorState,
  NAV_ICONS,
  PluginIcon,
  type RegisteredNavEntry,
  Skeleton,
  usePluginNavigation,
} from '@tai42/studio-sdk';
import { Link, useLocation } from '@tanstack/react-router';
import { type MouseEvent, type ReactNode, useCallback, useId } from 'react';

import {
  activeNavKey,
  coreSectionOf,
  navEntryKey,
  PLUGINS_SECTION_LABEL,
  pluginSectionEntries,
  type PluginVersions,
  sortNavEntries,
} from './nav-entries';
import { DASHBOARD_TOKEN, type FeatureToken, NAV_SECTIONS, PATH } from './routes';
import { tokenCovered } from './token-requirements';

const NAV_LABELS: Record<FeatureToken, string> = {
  tools: 'Tools',
  agents: 'Agents',
  presets: 'Presets',
  states: 'States',
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

/** One plugin nav row with its host provenance badge. */
function pluginNavRow(
  entry: RegisteredNavEntry,
  activeKey: string | undefined,
  pluginVersions: PluginVersions,
): ReactNode {
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
}

/**
 * The primary nav body under a ready projection: the standalone Dashboard row first,
 * then each {@link NAV_SECTIONS} group as an uppercase muted header over its items —
 * the section's core tokens, then any plugin nav entry that targets that section.
 * AFTER the core sections comes the single generic {@link PLUGINS_SECTION_LABEL}
 * section: every entry that names no core section, interleaved by {@link sortNavEntries}.
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
              {entries.map((entry) => pluginNavRow(entry, activeKey, pluginVersions))}
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
            {pluginEntries.map((entry) => pluginNavRow(entry, activeKey, pluginVersions))}
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

/**
 * The Primary navigation, shared by the sidebar and the mobile drawer. It follows the
 * capability projection's three states; when ready, {@link NavSections} renders the
 * core sections followed by the single generic "Plugins" section. There is no separate
 * "Plugins" navigation LANDMARK — the fallback plugin entries render as one section
 * within this Primary nav.
 */
export function NavBody({
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
