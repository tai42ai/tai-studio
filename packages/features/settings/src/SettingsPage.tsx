/**
 * The settings surface: a header showing the config source's MODE (and its
 * read-only flag) above a tabbed workbench — the four core tabs (Settings /
 * Environment / API keys / Backup) plus Profiles/Roles when reachable, followed by
 * any settings tabs Studio plugins contributed.
 *
 * The Settings and Environment tabs read the deployment's ADMIN-ONLY `secret` config
 * routes, so they render only when the caller's projection reaches those routes. The
 * config mode read is issued together with those tabs (it feeds the mode card), so it
 * too is skipped for a caller who cannot reach the admin config surface. When a caller
 * does NOT cover the admin config routes, the mode read is skipped, the mode card is
 * dropped, and editing defaults conservatively to read-only so the always-shown API
 * keys tab stays reachable and a scoped mode 403 never walls the page.
 *
 * The deployment-wide `read_only` flag is threaded to every core tab. VISIBILITY is
 * the capability boundary: the Settings, Environment, Backup, Profiles and Roles tabs
 * render only when the caller's projection reaches their backing read route; the API
 * keys tab is an own-key surface the server self-limits, so it is always shown. Each
 * tab owns its own server reads; this container reads only the mode.
 *
 * The route carries no search parameters, so the props are unused; the typed
 * signature keeps this page interchangeable with every other feature the shell mounts.
 */
import type { PageProps } from '@tai42/studio-sdk';
import {
  Badge,
  Card,
  errorMessage,
  ErrorState,
  GuardedTabs,
  PageHeader,
  Skeleton,
  Stack,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';
import { usePluginContributions } from '@tai42/studio-sdk/host';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { configModeKey } from './keys';
import { ReloadConfigButton } from './ReloadConfigButton';
import {
  BACKUP_READ_ROUTE,
  buildSettingsTabs,
  CONFIG_READ_ROUTES,
  coreTabVisible,
  PROFILES_READ_ROUTES,
  ROLES_READ_ROUTE,
} from './settings-tabs';

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

  // Tab VISIBILITY and the mode read share one gate: the Settings/Environment tabs
  // read the deployment's ADMIN-ONLY `secret` config routes, and the mode read is
  // issued alongside them, so a scoped editor/viewer never fires the mode read.
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
    // Ready: config covered → the resolved mode; otherwise `mode` is null, the mode
    // card is dropped, and editing defaults conservatively to read-only.
    const mode = configVisible ? (modeQuery.data ?? null) : null;
    const readOnly = mode?.read_only ?? true;
    const tabs = buildSettingsTabs({
      readOnly,
      configVisible,
      profilesVisible,
      backupVisible,
      rolesVisible,
      pluginStatus: status,
      contributions,
      projection: capabilityState.projection,
    });
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
