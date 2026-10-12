/** Settings-profile CRUD, versioning and apply sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function profilesClient(t: Transport) {
  const { req } = t;
  return {
    // The admin-only `/api/config/profiles/*` surface. Bodies/diff/versions carry
    // REAL secret values (secret/fenced routes); masking is CLIENT-SIDE.
    listSettingsProfiles: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_config_profiles.path, s.settingsProfileList, { signal }),
    getSettingsProfile: (name: string, signal?: AbortSignal) =>
      req(buildPath(apiRoutes.get_api_config_profiles_name.path, { name }), s.settingsProfileBody, {
        signal,
      }),
    putSettingsProfile: (name: string, body: s.SettingsProfileBody) =>
      req(
        buildPath(apiRoutes.put_api_config_profiles_name.path, { name }),
        s.settingsProfileSaved,
        {
          method: 'PUT',
          body,
        },
      ),
    deleteSettingsProfile: (name: string) =>
      req(
        buildPath(apiRoutes.delete_api_config_profiles_name.path, { name }),
        s.settingsProfileDeleted,
        {
          method: 'DELETE',
        },
      ),
    // Diff of the SAVED profile vs the stored env — server-computed, no request body.
    diffSettingsProfile: (name: string) =>
      req(
        buildPath(apiRoutes.post_api_config_profiles_name_diff.path, { name }),
        s.settingsProfileDiff,
        {
          method: 'POST',
        },
      ),
    // Apply the SAVED profile (full-replace of the profile-managed band). Fenced,
    // destructive → the dedicated `profile_apply_response` report.
    applySettingsProfile: (name: string) =>
      req(
        buildPath(apiRoutes.post_api_config_profiles_name_apply.path, { name }),
        s.profileApplyResponse,
        {
          method: 'POST',
        },
      ),
    listSettingsProfileVersions: (name: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_config_profiles_name_versions.path, { name }),
        s.settingsProfileVersionList,
        {
          signal,
        },
      ),
    getSettingsProfileVersion: (name: string, version: number, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_config_profiles_name_versions_version.path, {
          name,
          version: String(version),
        }),
        s.settingsProfileVersion,
        { signal },
      ),
    rollbackSettingsProfile: (name: string, version: number) =>
      req(
        buildPath(apiRoutes.post_api_config_profiles_name_rollback.path, { name }),
        s.settingsProfileRollback,
        {
          method: 'POST',
          body: { version },
        },
      ),
  };
}
