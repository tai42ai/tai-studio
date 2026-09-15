/**
 * The settings workbench's tab set: which core tabs a caller's projection makes
 * visible, and the assembled (core + plugin) `TabItem[]` the page renders. Kept out
 * of the page shell so the visibility gating and the ordering are testable and the
 * page component stays thin.
 */
import type { MeProjection } from '@tai42/api-client';
import {
  type CapabilityState,
  coversAnyRoute,
  ErrorBoundary,
  isFullProjection,
  type RequiredCapabilities,
  type TabItem,
} from '@tai42/studio-sdk';
import type { usePluginContributions } from '@tai42/studio-sdk/host';
import type { ReactNode } from 'react';

import { ApiKeysTab } from './ApiKeysTab';
import { BackupTab } from './BackupTab';
import { EnvironmentTab } from './EnvironmentTab';
import { ProfilesTab } from './ProfilesTab';
import { RolesTab } from './RolesTab';
import { SettingsTab } from './SettingsTab';

type PluginContributions = ReturnType<typeof usePluginContributions>;

/**
 * The read routes the Settings + Environment tabs load — the deployment's ADMIN-ONLY
 * `secret` config routes. A caller whose projection reaches only the sibling plain
 * `GET /api/config/mode` never sees either tab, so their admin-only reads never
 * 403-wall the surface.
 */
export const CONFIG_READ_ROUTES = ['/api/config/settings-schema', '/api/config/env'] as const;
export const BACKUP_READ_ROUTE = '/api/backup';
/**
 * The Profiles tab reads only the `action=read` profiles LIST route — its OWN gate,
 * deliberately NOT folded into `CONFIG_READ_ROUTES`, so a scoped editor who can list
 * profiles but not read env/settings-schema sees the Profiles tab alone.
 */
export const PROFILES_READ_ROUTES = ['/api/config/profiles'] as const;
/** The Roles tab reads `GET /api/auth/roles` — an admin-only `secret` route. */
export const ROLES_READ_ROUTE = '/api/auth/roles';

/**
 * Whether a core tab whose reads live under `prefixes` is visible to this caller. A
 * full (admin / gate-off) projection shows every tab; a scoped session shows the tab
 * only when its projection reaches one of the tab's read routes. Fails closed while
 * the projection is not ready.
 */
export function coreTabVisible(state: CapabilityState, prefixes: readonly string[]): boolean {
  if (state.status !== 'ready') return false;
  return isFullProjection(state.projection) || coversAnyRoute(state.projection, prefixes);
}

/**
 * Whether a plugin settings tab is visible under a projection — the same anyOf
 * evaluator the shell applies to every plugin contribution. A full projection shows
 * every tab; an ABSENT capability renders only for a full projection (safe-by-default);
 * a declared requirement renders when the projection reaches at least one of its routes.
 */
export function settingsTabCovered(
  projection: MeProjection,
  required: RequiredCapabilities | undefined,
): boolean {
  if (isFullProjection(projection)) return true;
  if (required === undefined) return false;
  return coversAnyRoute(projection, required.routes);
}

/**
 * The ordered tab set: the visible core tabs (Settings/Environment gated together on
 * the config reads, Profiles on its own gate, API keys always, Backup and Roles on
 * their reads), then any plugin settings tabs — filtered by their capability
 * requirement, sorted by (pluginId, title), each wrapped in an {@link ErrorBoundary}
 * and carrying a collision-proof `plugin:{pluginId}:{id}` value. The effective
 * read-only flows to the core tabs only; a plugin tab's contract is `{ pluginId }`.
 */
export function buildSettingsTabs(input: {
  readonly readOnly: boolean;
  readonly configVisible: boolean;
  readonly profilesVisible: boolean;
  readonly backupVisible: boolean;
  readonly rolesVisible: boolean;
  readonly pluginStatus: PluginContributions['status'];
  readonly contributions: PluginContributions['contributions'];
  readonly projection: MeProjection;
}): TabItem[] {
  const { readOnly } = input;
  const tabs: TabItem[] = [];
  if (input.configVisible) {
    tabs.push(
      { value: 'settings', label: 'Settings', content: <SettingsTab readOnly={readOnly} /> },
      {
        value: 'environment',
        label: 'Environment',
        content: <EnvironmentTab readOnly={readOnly} />,
      },
    );
  }
  if (input.profilesVisible) {
    tabs.push({
      value: 'profiles',
      label: 'Profiles',
      content: <ProfilesTab readOnly={readOnly} />,
    });
  }
  tabs.push({ value: 'api-keys', label: 'API keys', content: <ApiKeysTab readOnly={readOnly} /> });
  if (input.backupVisible) {
    tabs.push({ value: 'backup', label: 'Backup', content: <BackupTab readOnly={readOnly} /> });
  }
  if (input.rolesVisible) {
    tabs.push({ value: 'roles', label: 'Roles', content: <RolesTab readOnly={readOnly} /> });
  }

  // Plugin tabs appear only once the load pass has committed them; until then the tab
  // bar is exactly the core tabs (no churn). The projection is `ready` at the call site.
  if (input.pluginStatus === 'ready') {
    const pluginTabs = [...input.contributions.settingsTabs]
      .filter((registered) => settingsTabCovered(input.projection, registered.requiredCapabilities))
      .sort((a, b) => a.pluginId.localeCompare(b.pluginId) || a.title.localeCompare(b.title))
      .map((registered): TabItem => {
        const TabComponent = registered.component;
        const content: ReactNode = (
          <ErrorBoundary label={registered.pluginId}>
            <TabComponent pluginId={registered.pluginId} />
          </ErrorBoundary>
        );
        return {
          value: `plugin:${registered.pluginId}:${registered.id}`,
          label: registered.title,
          content,
        };
      });
    tabs.push(...pluginTabs);
  }
  return tabs;
}
