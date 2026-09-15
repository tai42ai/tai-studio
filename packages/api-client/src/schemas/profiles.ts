/** Settings-profile record, version, diff and apply response schemas. */
import { z } from 'zod';

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
export const settingsProfileSummary = z.object({
  name: z.string(),
  description: z.string(),
});
export type SettingsProfileSummary = z.infer<typeof settingsProfileSummary>;
export const settingsProfileList = z.array(settingsProfileSummary);

/**
 * `GET /api/config/profiles/{name}` and each version body — the stored profile
 * document (action=secret). `env` carries REAL values; `secret_keys` is the
 * per-profile secret-marks band folded into the secret-mask union for masking.
 */
export const settingsProfileBody = z.object({
  description: z.string(),
  env: z.record(z.string(), z.string()),
  secret_keys: z.array(z.string()),
});
export type SettingsProfileBody = z.infer<typeof settingsProfileBody>;

/** `PUT /api/config/profiles/{name}` — a minimal save ack; `version` is the new store version. */
export const settingsProfileSaved = z.object({
  ok: z.literal(true),
  version: z.number().optional(),
});
export type SettingsProfileSaved = z.infer<typeof settingsProfileSaved>;

/** `DELETE /api/config/profiles/{name}` — a minimal removal ack. */
export const settingsProfileDeleted = z.object({ ok: z.literal(true) });

/** `POST /api/config/profiles/{name}/rollback` — the restore ack; `version` is the resulting active version. */
export const settingsProfileRollback = z.object({
  ok: z.literal(true),
  version: z.number(),
});
export type SettingsProfileRollback = z.infer<typeof settingsProfileRollback>;

/**
 * `POST /api/config/profiles/{name}/diff` — the SAVED profile vs the stored env
 * (action=secret). `changed` carries real `old`/`new` values (UI masks via
 * JsonDiff); `recycle_keys`/`refused_keys` are the diff's recycle-class and
 * boundary-refused key names, called out in the UI before apply.
 */
export const settingsProfileDiff = z.object({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  changed: z.array(z.object({ key: z.string(), old: z.string(), new: z.string() })),
  recycle_keys: z.array(z.string()),
  refused_keys: z.array(z.string()),
});
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
 * target's successor; `refused` is `[]` on success by construction (populated
 * `{key, reason}` only on a refusal), the populated refusal surfaces being the diff
 * preview and the refusal error report. `fanout` is the mode-wrapped fleet broadcast,
 * parsed EXPLICITLY so a failed propagation reaches the shared fleet-report handler. A
 * drift throws `ApiSchemaError`.
 */
export const profileApplyResponse = z.object({
  hot: z.array(z.string()),
  recycle: z.array(
    z.object({
      name: z.string(),
      kind: z.string(),
      status: z.string(),
      generation_before: z.number(),
    }),
  ),
  fresh: z.array(z.object({ name: z.string(), kind: z.string(), generation: z.number() })),
  refused: z.array(z.object({ key: z.string(), reason: z.string() })),
  fanout: fleetReportFanout,
});
export type ProfileApplyResponse = z.infer<typeof profileApplyResponse>;

/**
 * `GET /api/config/profiles/{name}/versions` — version METADATA only (action=read;
 * no bodies), the generic versioned-store row minus `body`. `is_current` flags the
 * active pointer.
 */
export const settingsProfileVersionMeta = z.object({
  version: z.number(),
  tags: z.array(z.string()),
  created_at: z.string(),
  is_current: z.boolean(),
});
export type SettingsProfileVersionMeta = z.infer<typeof settingsProfileVersionMeta>;
export const settingsProfileVersionList = z.array(settingsProfileVersionMeta);

/**
 * `GET /api/config/profiles/{name}/versions/{version}` — one immutable version WITH
 * its `body` (action=secret; body rendered masked per the secret-mask union). The generic
 * versioned-store row shape.
 */
export const settingsProfileVersion = settingsProfileVersionMeta.extend({
  body: settingsProfileBody,
});
export type SettingsProfileVersion = z.infer<typeof settingsProfileVersion>;
