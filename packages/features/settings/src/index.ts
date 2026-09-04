/**
 * @tai42/feature-settings — the settings surface: a config-mode header above a
 * four-tab workbench (Settings / Environment / API keys / Backup).
 *
 * `SettingsPage` is the shell-mounted page. The individual tab components and
 * the query keys are exported for direct unit testing.
 */
export { SettingsPage } from './SettingsPage';
export { SettingsTab } from './SettingsTab';
export type { SettingsTabProps } from './SettingsTab';
export { EnvironmentTab } from './EnvironmentTab';
export type { EnvironmentTabProps } from './EnvironmentTab';
export { ApiKeysTab } from './ApiKeysTab';
export type { ApiKeysTabProps } from './ApiKeysTab';
export { BackupTab } from './BackupTab';
export type { BackupTabProps } from './BackupTab';
export { RolesTab } from './RolesTab';
export type { RolesTabProps } from './RolesTab';
export { ProfilesTab } from './ProfilesTab';
export type { ProfilesTabProps } from './ProfilesTab';
export { ReloadConfigButton } from './ReloadConfigButton';
export {
  configModeKey,
  envConfigKey,
  settingsSchemaKey,
  scopesKey,
  authRoutesKey,
  publicRoutesKey,
  tokensPayloadKey,
  rolesKey,
  roleVersionsKey,
  backupSectionsKey,
  settingsProfilesKey,
  settingsProfileKey,
  settingsProfileVersionsKey,
  settingsProfileVersionKey,
} from './keys';
