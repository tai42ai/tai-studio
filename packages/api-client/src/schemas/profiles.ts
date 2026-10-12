/** Settings-profile record, version, diff and apply response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import { fleetReportFanout } from './fleet';

// The admin-only `/api/config/profiles/*` surface. Secrets ride the wire in the
// clear (secret/fenced routes); masking is CLIENT-SIDE per the secret-mask union. A drift
// on any of these throws `ApiSchemaError`.

/**
 * `GET /api/config/profiles` — one row per stored profile. The list is
 * names+descriptions ONLY (action=read); no `env`, no `secret_keys`, no bodies.
 * (No `last_modified`: the list carries identity, not history — version metadata
 * is the `/versions` surface — so the list renders no last-modified column.)
 */
export const settingsProfileSummary = openapi.profileSummary;
export type SettingsProfileSummary = z.infer<typeof settingsProfileSummary>;
export const settingsProfileList = openapi.profileListResponse;

/**
 * `GET /api/config/profiles/{name}` and each version body — the stored profile
 * document (action=secret). `env` carries REAL values; `secret_keys` is the
 * per-profile secret-marks band folded into the secret-mask union for masking.
 */
export const settingsProfileBody = openapi.settingsProfileBody;
export type SettingsProfileBody = z.infer<typeof settingsProfileBody>;

/** `PUT /api/config/profiles/{name}` — a minimal save ack; `version` is the new store version. */
export const settingsProfileSaved = openapi.profileWriteResult;
export type SettingsProfileSaved = z.infer<typeof settingsProfileSaved>;

/** `DELETE /api/config/profiles/{name}` — a minimal removal ack. */
export const settingsProfileDeleted = openapi.okResult;

/** `POST /api/config/profiles/{name}/rollback` — the restore ack; `version` is the resulting active version. */
export const settingsProfileRollback = openapi.profileWriteResult;
export type SettingsProfileRollback = z.infer<typeof settingsProfileRollback>;

/**
 * `POST /api/config/profiles/{name}/diff` — the SAVED profile vs the stored env
 * (action=secret). `changed` carries real `old`/`new` values (UI masks via
 * JsonDiff); `recycle_keys`/`refused_keys` are the diff's recycle-class and
 * boundary-refused key names, called out in the UI before apply.
 */
export const settingsProfileDiff = openapi.profileDiff;
export type SettingsProfileDiff = z.infer<typeof settingsProfileDiff>;

/**
 * `POST /api/config/profiles/{name}/apply` — the dedicated `profile_apply_response`
 * (action=fenced, destructive). NAMES-ONLY (no env value in any
 * section): `hot` is the hot-swapped key names; `recycle` is the orchestrator's
 * per-worker section — one `{name, kind, status, generation_before}` row per recycled
 * target, `generation_before` the life that was recycled, the applier's OWN row carrying
 * the `self-deferred` status literal when the diff has serve-affecting recycle keys;
 * `fresh` is the per-kind list of NEW ready lives observed since the pre-apply snapshot
 * (each `{name, kind, generation}`), evidence of fresh capacity and never claimed as any
 * target's successor; `refused` is `[]` on success by construction (the refused key
 * names only on a refusal), the populated refusal surfaces being the diff preview and
 * the refusal error report; `recycle_stopped` names the target a stopped recycle roll
 * halted at, or is `null` when the roll ran to its end; `awaiting_respawn` names the workers
 * (name + keys) still awaiting a respawn after the apply (empty when the roll converged).
 * `fanout` is the mode-wrapped fleet broadcast, parsed EXPLICITLY so a failed propagation reaches the shared fleet-report handler. A
 * drift throws `ApiSchemaError`.
 */
// The fan-out is hand-typed: the spec publishes it as one object with optional fields.
export const profileApplyResponse = openapi.profileApplyResponse.extend({
  fanout: fleetReportFanout,
});
export type ProfileApplyResponse = z.infer<typeof profileApplyResponse>;

/**
 * `GET /api/config/profiles/{name}/versions` — version METADATA only (action=read;
 * no bodies), the generic versioned-store row minus `body`. `is_current` flags the
 * active pointer.
 */
export const settingsProfileVersionMeta = openapi.profileVersionSummary;
export type SettingsProfileVersionMeta = z.infer<typeof settingsProfileVersionMeta>;
export const settingsProfileVersionList = openapi.profileVersionListResponse;

/**
 * `GET /api/config/profiles/{name}/versions/{version}` — one immutable version WITH
 * its `body` (action=secret; body rendered masked per the secret-mask union). The generic
 * versioned-store row shape.
 */
export const settingsProfileVersion = openapi.profileVersionView;
export type SettingsProfileVersion = z.infer<typeof settingsProfileVersion>;
