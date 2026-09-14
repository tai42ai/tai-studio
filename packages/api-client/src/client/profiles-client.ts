/** Settings-profile CRUD, versioning and apply sub-client. */
import * as s from '../schemas';
import { encodeSegment } from '../http';
import type { Transport } from './transport';

export function profilesClient(t: Transport) {
  const { req } = t;
  return {
    // The admin-only `/api/config/profiles/*` surface. Bodies/diff/versions carry
    // REAL secret values (secret/fenced routes); masking is CLIENT-SIDE.
    listSettingsProfiles: (signal?: AbortSignal) =>
      req('/api/config/profiles', s.settingsProfileList, { signal }),
    getSettingsProfile: (name: string, signal?: AbortSignal) =>
      req(`/api/config/profiles/${encodeSegment(name)}`, s.settingsProfileBody, { signal }),
    putSettingsProfile: (name: string, body: s.SettingsProfileBody) =>
      req(`/api/config/profiles/${encodeSegment(name)}`, s.settingsProfileSaved, {
        method: 'PUT',
        body,
      }),
    deleteSettingsProfile: (name: string) =>
      req(`/api/config/profiles/${encodeSegment(name)}`, s.settingsProfileDeleted, {
        method: 'DELETE',
      }),
    // Diff of the SAVED profile vs the stored env — server-computed, no request body.
    diffSettingsProfile: (name: string) =>
      req(`/api/config/profiles/${encodeSegment(name)}/diff`, s.settingsProfileDiff, {
        method: 'POST',
      }),
    // Apply the SAVED profile (full-replace of the profile-managed band). Fenced,
    // destructive → the dedicated `profile_apply_response` report.
    applySettingsProfile: (name: string) =>
      req(`/api/config/profiles/${encodeSegment(name)}/apply`, s.profileApplyResponse, {
        method: 'POST',
      }),
    listSettingsProfileVersions: (name: string, signal?: AbortSignal) =>
      req(`/api/config/profiles/${encodeSegment(name)}/versions`, s.settingsProfileVersionList, {
        signal,
      }),
    getSettingsProfileVersion: (name: string, version: number, signal?: AbortSignal) =>
      req(
        `/api/config/profiles/${encodeSegment(name)}/versions/${encodeSegment(version)}`,
        s.settingsProfileVersion,
        { signal },
      ),
    rollbackSettingsProfile: (name: string, version: number) =>
      req(`/api/config/profiles/${encodeSegment(name)}/rollback`, s.settingsProfileRollback, {
        method: 'POST',
        body: { version },
      }),
  };
}
