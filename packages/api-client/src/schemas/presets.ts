/** Preset record, version and validation response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import { presetExtensionElement } from './extensions';
import { presetBody } from './served';

// The extension combos and the version body are hand-typed: the spec publishes a
// config-bearing element and a version body as open objects.

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
export const presetRecord = openapi.presetRecordView.extend({ extensions: presetExtensions });
export type PresetRecord = z.infer<typeof presetRecord>;

export const presetList = z.array(presetRecord);

/** `GET /api/presets/{name}` — the record plus the active version's baked kwargs. */
export const presetDetail = openapi.presetDetailView.extend({ extensions: presetExtensions });
export type PresetDetail = z.infer<typeof presetDetail>;

/**
 * One immutable version row (`GET /api/presets/{name}/versions[/{version}]`).
 * `is_current` flags the active version; `tags` here is the GENERIC per-version
 * label list (kind-agnostic) — the only preset tags that remain, distinct from the
 * removed record-level categorization and from the tool_meta overlay.
 */
export const presetVersion = openapi.documentVersion.extend({ body: presetBody });
export type PresetVersion = z.infer<typeof presetVersion>;

export const presetVersionList = z.array(presetVersion);

/** `POST /api/presets/{name}/rollback` — the re-pointed active version. */
export const presetRollback = openapi.presetRollbackResult;

/** `DELETE /api/presets/{name}` — the removed preset. */
export const presetDeleted = openapi.presetDeleteResult;

/** `POST /api/presets/{name}/rename` — the re-keyed record identity. */
export const presetRenamed = openapi.presetRenameResult;
export type PresetRenamed = z.infer<typeof presetRenamed>;

/**
 * `GET /api/presets/{name}/referees?action=` and
 * `GET /api/states/{name}/attachments/{template}/referees` — every holder that would
 * refuse the action. An empty list is the clean case; a non-empty list is what the
 * server's 409 would name. A drift throws `ApiSchemaError`.
 */
export const holdersPreview = openapi.holdersPreview;
export type HoldersPreview = z.infer<typeof holdersPreview>;

/** One holder of a reference: its kind, its name, a one-line summary and its locator. */
export const referenceHolder = openapi.referenceHolder;
export type ReferenceHolder = z.infer<typeof referenceHolder>;

/** The preset action a holder preview answers for. */
export type PresetHolderAction = 'rename' | 'delete';

/**
 * `POST /api/presets/validate` — the dry-run verdict for a preset draft. `valid`
 * is the absence of an `error`; an invalid draft is a SUCCESSFUL validation (HTTP
 * 200), so `error` carries the server's verbatim message. A drift throws
 * `ApiSchemaError`.
 */
export const presetValidation = openapi.presetValidateVerdict;
export type PresetValidation = z.infer<typeof presetValidation>;

/**
 * `PUT /api/presets/{name}/versions/{version}/tags` — the re-annotated version.
 * Version tags are labels on an immutable body, so this rebinds nothing; the
 * response echoes the identity plus the new tag list. A drift throws
 * `ApiSchemaError`.
 */
export const presetVersionTags = openapi.presetVersionTagsResult;
export type PresetVersionTags = z.infer<typeof presetVersionTags>;
