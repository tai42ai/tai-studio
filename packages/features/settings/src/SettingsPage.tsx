/**
 * The settings surface: a header showing the config source's MODE (and its
 * read-only flag) above a tabbed workbench — the four core tabs (Settings /
 * Environment / API keys / Backup) followed by any settings tabs Studio plugins
 * contributed.
 *
 * The config mode read (`GET /api/config/mode`) lives behind `/api/config`, so it
 * is issued only once the projection is known to reach that surface — the same
 * coverage check that gates the Settings/Environment sub-tabs. When config is
 * covered the page follows the shared state convention: a <Skeleton> while the mode
 * is loading, a loud <ErrorState> on any failure (a rejected request or a zod
 * mismatch is always a visible error, never a silent render), and the tabbed content
 * with the mode card otherwise. When a scoped session does NOT cover `/api/config`,
 * the mode read is skipped entirely and the shell renders with a conservative
 * read-only default and no mode card, so the always-shown API keys tab stays
 * reachable and a scoped mode 403 never walls the page.
 *
 * The deployment-wide `read_only` flag is threaded to every core tab so editing is
 * disabled identically across the surface. VISIBILITY is the capability boundary:
 * the Settings, Environment, and Backup tabs render only when the caller's projection
 * reaches their backing read route (`/api/config` and `/api/backup`), so a scoped
 * session never opens a tab whose reads would 403; the API keys tab is an own-key
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
import type { CSSProperties, ReactNode } from 'react';

import {
  Badge,
  Card,
  ErrorBoundary,
  ErrorState,
  Skeleton,
  Tabs,
  coversAnyRoute,
  errorMessage,
  isFullProjection,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';
import type { CapabilityState, PageProps, RequiredCapabilities, TabItem } from '@tai42/studio-sdk';
import type { MeProjection } from '@tai42/api-client';
import { usePluginContributions } from '@tai42/studio-sdk/host';

import { SettingsTab } from './SettingsTab';
import { EnvironmentTab } from './EnvironmentTab';
import { ApiKeysTab } from './ApiKeysTab';
import { BackupTab } from './BackupTab';
import { configModeKey } from './keys';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const pageHeadingStyle: CSSProperties = {
  margin: 0,
  font: 'var(--tai-text-xl, var(--tai-text-lg)) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
};

const sectionHeadingStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

const modeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-3)',
};

const modeLabelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

/**
 * The read routes the core tabs load, matched by prefix to decide tab VISIBILITY.
 * The Settings and Environment tabs both read `GET /api/config/*` (settings-schema
 * and the env config); the Backup tab reads `GET /api/backup/sections`. A scoped
 * session that cannot reach a tab's reads never sees the tab.
 */
const CONFIG_READ_ROUTE = '/api/config';
const BACKUP_READ_ROUTE = '/api/backup';

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
    <div style={pageStyle} data-testid="settings-loading">
      <Card>
        <Skeleton width="20%" height={18} />
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <Skeleton width="35%" />
        </div>
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

  // Tab VISIBILITY and the mode read share one gate: the Settings/Environment tabs
  // and the mode read all live behind `/api/config`, Backup behind `/api/backup`.
  // `coreTabVisible` is true ONLY once the projection is ready and covers the route,
  // so the mode read is issued only then — a scoped session that cannot reach
  // `/api/config` never fires it (it would 403 and wall the always-shown API keys tab).
  const configVisible = coreTabVisible(capabilityState, [CONFIG_READ_ROUTE]);
  const backupVisible = coreTabVisible(capabilityState, [BACKUP_READ_ROUTE]);

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
    // Ready: config covered → the resolved mode; otherwise (a scoped session that
    // cannot reach `/api/config`) `mode` is null, the mode card is dropped, and editing
    // defaults conservatively to read-only so the always-shown API keys tab stays usable.
    const mode = configVisible ? (modeQuery.data ?? null) : null;
    const readOnly = mode?.read_only ?? true;
    // Tab VISIBILITY is the capability boundary; the deployment `read_only` flag alone
    // governs each visible tab's write controls (the API keys tab runs its own
    // method-aware mint gate internally). The Settings/Environment tabs read
    // `/api/config`, Backup reads `/api/backup`; a scoped session that cannot reach
    // those reads never sees the tab. The API keys tab is always shown.
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
    tabs.push({
      value: 'api-keys',
      label: 'API keys',
      content: <ApiKeysTab readOnly={readOnly} />,
    });
    if (backupVisible) {
      tabs.push({ value: 'backup', label: 'Backup', content: <BackupTab readOnly={readOnly} /> });
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
            <h2 style={sectionHeadingStyle}>Configuration</h2>
            <div style={modeRowStyle}>
              <span style={modeLabelStyle}>Mode</span>
              <Badge variant="primary">{mode.config_mode}</Badge>
              {readOnly ? <Badge variant="warning">Read-only</Badge> : null}
            </div>
          </Card>
        ) : null}
        <Tabs items={tabs} defaultValue={tabs[0]?.value} />
      </>
    );
  }

  return (
    <section style={pageStyle} aria-labelledby="settings-heading">
      <h1 id="settings-heading" style={pageHeadingStyle}>
        Settings
      </h1>
      {body}
    </section>
  );
}
