/** Preset record, version and validation response schemas. */
import { z } from 'zod';

import { presetExtensionElement } from './extensions';
import { presetBody } from './served';

/** A list of extension COMBOS — each combo an ordered list of elements. */
export const presetExtensions = z.array(z.array(presetExtensionElement));

/**
 * One preset as `GET /api/presets` returns it. Every preset is versioned, so
 * `active_version` is always an int; `conflicted` marks a QUARANTINED row (its
 * name collided with a foreign tool at boot — delete-only). `extensions` are the
 * ACTIVE version's extension combos, `output_schema` the optional author-set
 * output JSON Schema, and `input_schema` the optional author-set input JSON
 * Schema. Categorization tags live in the tool_meta overlay
 * (`GET /api/tool-meta`), never on the record. A drift throws `ApiSchemaError`;
 * nothing is coerced.
 */
export const presetRecord = z.object({
  name: z.string(),
  base_tool: z.string(),
  description: z.string(),
  active_version: z.number(),
  extensions: presetExtensions,
  output_schema: z.record(z.string(), z.unknown()).nullable(),
  input_schema: z.record(z.string(), z.unknown()).nullable(),
  conflicted: z.boolean(),
  // The human-readable cause a row is quarantined (its name collided with a
  // foreign tool at boot), or `null` when the row is not conflicted. Rendered
  // verbatim; nothing is coerced.
  conflicted_reason: z.string().nullable(),
  // Sorted preset-name cross-references: `uses` names the presets this one
  // composes as tools; `used_by` names the presets that compose this one.
  uses: z.array(z.string()),
  used_by: z.array(z.string()),
});
export type PresetRecord = z.infer<typeof presetRecord>;

export const presetList = z.array(presetRecord);

/** `GET /api/presets/{name}` — the record plus the active version's baked kwargs. */
export const presetDetail = presetRecord.extend({
  fixed_kwargs: z.record(z.string(), z.unknown()),
});
export type PresetDetail = z.infer<typeof presetDetail>;

/**
 * One immutable version row (`GET /api/presets/{name}/versions[/{version}]`).
 * `is_current` flags the active version; `tags` here is the GENERIC per-version
 * label list (kind-agnostic) — the only preset tags that remain, distinct from the
 * removed record-level categorization and from the tool_meta overlay.
 */
export const presetVersion = z.object({
  version: z.number(),
  body: presetBody,
  tags: z.array(z.string()),
  created_at: z.string(),
  is_current: z.boolean(),
});
export type PresetVersion = z.infer<typeof presetVersion>;

export const presetVersionList = z.array(presetVersion);

/** `POST /api/presets/{name}/rollback` — the re-pointed active version. */
export const presetRollback = z.object({ name: z.string(), active_version: z.number() });

/** `DELETE /api/presets/{name}` — the removed preset. */
export const presetDeleted = z.object({ name: z.string(), deleted: z.literal(true) });

/** `POST /api/presets/{name}/rename` — the re-keyed record identity. */
export const presetRenamed = z.object({
  name: z.string(),
  renamed_from: z.string(),
  active_version: z.number(),
});
export type PresetRenamed = z.infer<typeof presetRenamed>;

/**
 * `GET /api/presets/{name}/referees` — every OTHER preset whose active authored
 * composition names this one as a tool (the referees a rename would strand). An
 * empty list is the clean case; a non-empty list means a rename is blocked until
 * those presets are updated. A drift throws `ApiSchemaError`.
 */
export const presetReferees = z.object({
  name: z.string(),
  referees: z.array(z.string()),
});
export type PresetReferees = z.infer<typeof presetReferees>;

/**
 * `POST /api/presets/validate` — the dry-run verdict for a preset draft. `valid`
 * is the absence of an `error`; an invalid draft is a SUCCESSFUL validation (HTTP
 * 200), so `error` carries the server's verbatim message. A drift throws
 * `ApiSchemaError`.
 */
export const presetValidation = z.object({
  valid: z.boolean(),
  error: z.string().nullable(),
});
export type PresetValidation = z.infer<typeof presetValidation>;

/**
 * `PUT /api/presets/{name}/versions/{version}/tags` — the re-annotated version.
 * Version tags are labels on an immutable body, so this rebinds nothing; the
 * response echoes the identity plus the new tag list. A drift throws
 * `ApiSchemaError`.
 */
export const presetVersionTags = z.object({
  name: z.string(),
  version: z.number(),
  tags: z.array(z.string()),
});
export type PresetVersionTags = z.infer<typeof presetVersionTags>;
