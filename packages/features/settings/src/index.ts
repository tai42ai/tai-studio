/**
 * @tai42/feature-settings — the settings surface: a config-mode header above a
 * four-tab workbench (Settings / Environment / API keys / Backup).
 *
 * `SettingsPage` is the shell-mounted page. The individual tab components and
 * the query keys are exported for direct unit testing.
 */
export type { ApiKeysTabProps } from './ApiKeysTab';
export { ApiKeysTab } from './ApiKeysTab';
export type { BackupTabProps } from './BackupTab';
export { BackupTab } from './BackupTab';
export type { EnvironmentTabProps } from './EnvironmentTab';
export { EnvironmentTab } from './EnvironmentTab';
export {
  authRoutesKey,
  backupSectionsKey,
  configModeKey,
  envConfigKey,
  publicRoutesKey,
  rolesKey,
  roleVersionsKey,
  scopesKey,
  settingsProfileKey,
  settingsProfilesKey,
  settingsProfileVersionKey,
  settingsProfileVersionsKey,
  settingsSchemaKey,
  tokensPayloadKey,
} from './keys';
export type { ProfilesTabProps } from './ProfilesTab';
export { ProfilesTab } from './ProfilesTab';
export { ReloadConfigButton } from './ReloadConfigButton';
export type { RolesTabProps } from './RolesTab';
export { RolesTab } from './RolesTab';
export { SettingsPage } from './SettingsPage';
export type { SettingsTabProps } from './SettingsTab';
export { SettingsTab } from './SettingsTab';
