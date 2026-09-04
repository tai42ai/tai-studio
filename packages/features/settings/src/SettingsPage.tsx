/**
 * The settings surface: a header showing the config source's MODE (and its
 * read-only flag) above a tabbed workbench — the four core tabs (Settings /
 * Environment / API keys / Backup) followed by any settings tabs Studio plugins
 * contributed.
 *
 * The Settings and Environment tabs read the deployment's ADMIN-ONLY `secret` config
 * routes (`GET /api/config/settings-schema` and `GET /api/config/env`), so they render
 * only when the caller's projection reaches those routes — a scoped editor/viewer, who
 * can reach the plain `GET /api/config/mode` read but NOT the secret routes, never opens
 * a tab whose reads would 403. The config mode read is issued together with those tabs
 * (it feeds the mode card shown above them), so it too is skipped for a caller who cannot
 * reach the admin config surface. When that surface is covered the page follows the shared
 * state convention: a <Skeleton> while the mode is loading, a loud <ErrorState> on any
 * failure (a rejected request or a zod mismatch is always a visible error, never a silent
 * render), and the tabbed content with the mode card otherwise. When a caller does NOT
 * cover the admin config routes, the mode read is skipped entirely and the shell renders
 * with a conservative read-only default and no mode card, so the always-shown API keys tab
 * stays reachable and a scoped mode 403 never walls the page.
 *
 * The deployment-wide `read_only` flag is threaded to every core tab so editing is
 * disabled identically across the surface. VISIBILITY is the capability boundary:
 * the Settings, Environment, and Backup tabs render only when the caller's projection
 * reaches their backing read route (the admin-only `GET /api/config/settings-schema` /
 * `GET /api/config/env`, and `/api/backup`), so a scoped session never opens a tab whose
 * reads would 403; the API keys tab is an own-key
 * surface the server self-limits, so it is always shown. A full (admin / gate-off)
 * projection shows every tab. Each tab owns its own server reads; this container
 * reads only the mode.
 *
 * Plugin tabs appear once the plugin load pass is `ready` — sorted after the core
 * tabs by `(pluginId, title)`, each keyed on a `plugin:{pluginId}:{id}` value that
 * cannot collide with a core tab or between plugins. Every plugin tab's content is
 * wrapped in an {@link ErrorBoundary}, so a plugin that throws at render shows a
 * loud, contained error in its own tab without taking down the Settings page. The
 * core tabs stay unwrapped. The effective read-only flows to core tabs only — a
 * settings tab's contract is `{ pluginId }`.
 *
 * The route carries no search parameters, so the props are unused; the typed
 * signature keeps this page interchangeable with every other feature the shell
 * mounts.
 */
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  Badge,
  Card,
  ErrorBoundary,
  ErrorState,
  GuardedTabs,
  PageHeader,
  Skeleton,
  Stack,
  coversAnyRoute,
  errorMessage,
  isFullProjection,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';
import type { CapabilityState, PageProps, RequiredCapabilities, TabItem } from '@tai42/studio-sdk';
import type { MeProjection } from '@tai42/api-client';
import { usePluginContributions } from '@tai42/studio-sdk/host';

import { ReloadConfigButton } from './ReloadConfigButton';
import { SettingsTab } from './SettingsTab';
import { EnvironmentTab } from './EnvironmentTab';
import { ApiKeysTab } from './ApiKeysTab';
import { BackupTab } from './BackupTab';
import { RolesTab } from './RolesTab';
import { ProfilesTab } from './ProfilesTab';
import { configModeKey } from './keys';

/**
 * The read routes the core tabs load, matched by prefix to decide tab VISIBILITY.
 * The Settings and Environment tabs read the deployment's ADMIN-ONLY `secret` config
 * routes (`GET /api/config/settings-schema` and `GET /api/config/env`); a caller whose
 * projection cannot reach them — a scoped editor/viewer, who reaches only the sibling
 * plain `GET /api/config/mode` read — never sees either tab, so their admin-only reads
 * never 403-wall the surface. Gating on the bare `/api/config` prefix (which the plain
 * `mode` read also satisfies) would over-show both tabs to editors. The Backup tab reads
 * `GET /api/backup/sections`.
 */
const CONFIG_READ_ROUTES = ['/api/config/settings-schema', '/api/config/env'] as const;
const BACKUP_READ_ROUTE = '/api/backup';
/**
 * The Profiles tab reads only the `action=read` profiles LIST route. It is its OWN
 * gate, deliberately NOT folded into `CONFIG_READ_ROUTES`: those are the two admin-only
 * `secret` routes, and adding the list route to them would make `configVisible` true for
 * a scoped editor who can list profiles but not read env/settings-schema — over-showing
 * the Settings and Environment tabs into a 403 wall. An editor who reaches the list route
 * sees the Profiles tab alone; the tab's own secret/fenced controls stay admin-gated
 * server-side and are hidden when the projection is not full.
 */
const PROFILES_READ_ROUTES = ['/api/config/profiles'] as const;
/**
 * The Roles tab reads `GET /api/auth/roles` — an admin-only `secret` route. A caller
 * whose projection cannot reach it (a scoped editor/viewer) never sees the tab, so
 * its admin-only reads never 403-wall the surface; a full (admin) projection shows it.
 */
const ROLES_READ_ROUTE = '/api/auth/roles';

/**
 * Whether a core tab whose reads live under `prefixes` is visible to this caller. A
 * full (admin / gate-off) projection shows every tab; a scoped session shows the tab
 * only when its projection reaches one of the tab's read routes. Fails closed while
 * the projection is not ready — no tab renders before the gate is known.
 */
function coreTabVisible(state: CapabilityState, prefixes: readonly string[]): boolean {
  if (state.status !== 'ready') return false;
  return isFullProjection(state.projection) || coversAnyRoute(state.projection, prefixes);
}

/**
 * Whether a plugin settings tab is visible under a projection — the same anyOf
 * evaluator the shell applies to every plugin contribution. A full projection
 * shows every tab; an ABSENT capability renders only for a full projection
 * (safe-by-default for existing plugins); a declared requirement renders when the
 * projection reaches at least one of its routes.
 */
function settingsTabCovered(
  projection: MeProjection,
  required: RequiredCapabilities | undefined,
): boolean {
  if (isFullProjection(projection)) return true;
  if (required === undefined) return false;
  return coversAnyRoute(projection, required.routes);
}

/** The loading placeholder: a skeleton stand-in for the mode card. */
function SettingsLoading(): ReactNode {
  return (
    <div className="tai-stack" data-testid="settings-loading">
      <Card>
        <Stack gap={3}>
          <Skeleton width="20%" height={18} />
          <Skeleton width="35%" />
        </Stack>
      </Card>
    </div>
  );
}

export function SettingsPage(props: PageProps<'settings'>): ReactNode {
  // The settings route carries no search parameters; the props are part of the
  // shared page contract but there is nothing to read from them here.
  void props;
  const api = useApi();
  const { status, contributions } = usePluginContributions();
  const { state: capabilityState } = useCapabilities();

  // Tab VISIBILITY and the mode read share one gate. The Settings/Environment tabs read
  // the deployment's ADMIN-ONLY `secret` config routes; the mode read feeds the card shown
  // above them and is issued alongside them. `coreTabVisible` is true ONLY once the
  // projection is ready and reaches one of those secret routes, so a scoped editor/viewer —
  // who can reach the plain `/api/config/mode` read but NOT the secret routes — never opens
  // the Settings/Environment tabs (whose reads would 403) and never fires the mode read.
  // Backup lives behind `/api/backup`.
  const configVisible = coreTabVisible(capabilityState, CONFIG_READ_ROUTES);
  const backupVisible = coreTabVisible(capabilityState, [BACKUP_READ_ROUTE]);
  const rolesVisible = coreTabVisible(capabilityState, [ROLES_READ_ROUTE]);
  const profilesVisible = coreTabVisible(capabilityState, PROFILES_READ_ROUTES);

  const modeQuery = useQuery({
    queryKey: configModeKey,
    queryFn: ({ signal }) => api.getConfigMode(signal),
    enabled: configVisible,
  });

  let body: ReactNode;
  if (capabilityState.status !== 'ready') {
    // Fail closed while the gate is unknown — never read the mode or open a tab before
    // the projection resolves (the shell shows this same placeholder via its boundary).
    body = <SettingsLoading />;
  } else if (configVisible && modeQuery.isError) {
    body = (
      <ErrorState
        message={errorMessage(modeQuery.error)}
        onRetry={() => {
          void modeQuery.refetch();
        }}
      />
    );
  } else if (configVisible && modeQuery.isPending) {
    body = <SettingsLoading />;
  } else {
    // Ready: config covered → the resolved mode; otherwise (a scoped session that cannot
    // reach the admin config routes) `mode` is null, the mode card is dropped, and editing
    // defaults conservatively to read-only so the always-shown API keys tab stays usable.
    const mode = configVisible ? (modeQuery.data ?? null) : null;
    const readOnly = mode?.read_only ?? true;
    // Tab VISIBILITY is the capability boundary; the deployment `read_only` flag alone
    // governs each visible tab's write controls (the API keys tab runs its own
    // method-aware mint gate internally). The Settings/Environment tabs read the
    // admin-only `secret` config routes, Backup reads `/api/backup`; a scoped session that
    // cannot reach those reads never sees the tab. The API keys tab is always shown.
    const tabs: TabItem[] = [];
    if (configVisible) {
      tabs.push(
        { value: 'settings', label: 'Settings', content: <SettingsTab readOnly={readOnly} /> },
        {
          value: 'environment',
          label: 'Environment',
          content: <EnvironmentTab readOnly={readOnly} />,
        },
      );
    }
    // The Profiles tab has its OWN gate (the profiles list route), so a scoped editor
    // who can list profiles sees it without the Settings/Environment tabs.
    if (profilesVisible) {
      tabs.push({
        value: 'profiles',
        label: 'Profiles',
        content: <ProfilesTab readOnly={readOnly} />,
      });
    }
    tabs.push({
      value: 'api-keys',
      label: 'API keys',
      content: <ApiKeysTab readOnly={readOnly} />,
    });
    if (backupVisible) {
      tabs.push({ value: 'backup', label: 'Backup', content: <BackupTab readOnly={readOnly} /> });
    }
    if (rolesVisible) {
      tabs.push({ value: 'roles', label: 'Roles', content: <RolesTab readOnly={readOnly} /> });
    }
    // Plugin tabs appear only once the load pass has committed them; until then the
    // tab bar is exactly the core tabs (no churn). Each tab is gated on its optional
    // `requiredCapabilities` — a tab whose requirement the projection does not cover is
    // hidden (absent ⇒ full projection only), so a scoped session never sees a tab it
    // cannot use. The projection is `ready` here (the not-ready branch returned above).
    // They sort after the core tabs by (pluginId, title), each carrying a namespaced
    // value that cannot collide.
    if (status === 'ready') {
      const visible = contributions.settingsTabs.filter((registered) =>
        settingsTabCovered(capabilityState.projection, registered.requiredCapabilities),
      );
      const pluginTabs = [...visible]
        .sort((a, b) => a.pluginId.localeCompare(b.pluginId) || a.title.localeCompare(b.title))
        .map((registered): TabItem => {
          const TabComponent = registered.component;
          return {
            value: `plugin:${registered.pluginId}:${registered.id}`,
            label: registered.title,
            content: (
              <ErrorBoundary label={registered.pluginId}>
                <TabComponent pluginId={registered.pluginId} />
              </ErrorBoundary>
            ),
          };
        });
      tabs.push(...pluginTabs);
    }
    body = (
      <>
        {mode !== null ? (
          <Card>
            <Stack gap={3}>
              <h2 className="tai-card-title">Configuration</h2>
              <div className="tai-row">
                <span className="tai-muted">Mode</span>
                <Badge variant="primary">{mode.config_mode}</Badge>
                {readOnly ? <Badge variant="warning">Read-only</Badge> : null}
              </div>
              {/* The local soft-restart action: re-read env + re-init from the manifest,
                  admin-fenced (self-hidden for a caller who cannot reach the door). */}
              <ReloadConfigButton />
            </Stack>
          </Card>
        ) : null}
        {/* GuardedTabs (not the bare SDK Tabs): switching away from a dirty env
            editor first confirms the discard, since the panel unmounts on switch. */}
        <GuardedTabs items={tabs} defaultValue={tabs[0]?.value} />
      </>
    );
  }

  return (
    <Stack>
      <PageHeader eyebrow="Administration" title="Settings" id="settings-heading" />
      {body}
    </Stack>
  );
}
