/**
 * One zod schema per consumed endpoint. These mirror the skeleton's router
 * response shapes exactly; a drift throws (ApiSchemaError) and the UI shows the
 * error state. JSON-schema-shaped fields are kept as permissive records — the
 * auto-form renderer interprets them at runtime.
 */
import { z } from 'zod';

/** An arbitrary JSON value (tool results, rendered payloads). */
export const jsonValue: z.ZodType<unknown> = z.unknown();

/** A JSON Schema object (Pydantic-emitted). Permissive; parsed by the auto-form. */
export const jsonSchema = z.record(z.string(), z.unknown());

// -- tools -------------------------------------------------------------------

export const toolNames = z.array(z.string());

export const toolSchema = z.object({
  input: jsonSchema,
  output: jsonSchema.nullable(),
  description: z.string().nullable(),
});
export type ToolSchema = z.infer<typeof toolSchema>;

export const allToolSchemas = z.record(z.string(), toolSchema);

export const runToolResult = jsonValue;

/**
 * The MEDIA variant a direct tool run (`/api/run-tool`) can return:
 * fastmcp serializes a returned `Image`/`Audio` MediaBlock to the MCP content
 * object `{ type: 'image' | 'audio', data: <base64>, mimeType: <mime> }`. The
 * `ResultViewer` detects this shape and renders an `<img>`/`<audio>` from a
 * `data:` URI. A tool result is still arbitrary JSON (`runToolResult`); this is
 * one recognised shape it can take, kept as its own schema so the viewer's
 * detection is a schema parse, not an ad-hoc shape check.
 *
 * SECURITY: the refinement pins `mimeType` to its media kind — an `image` block
 * MUST carry an `image/*` type, an `audio` block an `audio/*` type. A drifting or
 * arbitrary mimeType (e.g. a script type) fails the parse, so the viewer never
 * turns an unexpected mime into a `data:` URI — it falls back to the JSON/text
 * view instead. A `File` MediaBlock serializes to a distinct `EmbeddedResource`
 * shape (no top-level `data`/`mimeType`), so it also fails here and is not
 * media-rendered.
 */
export const toolMediaResult = z
  .object({
    type: z.enum(['image', 'audio']),
    data: z.string(),
    mimeType: z.string(),
  })
  .refine((media) => media.mimeType.startsWith(`${media.type}/`), {
    message: 'media mimeType must match its media kind (image/* for image, audio/* for audio)',
    path: ['mimeType'],
  });
export type ToolMediaResult = z.infer<typeof toolMediaResult>;

/**
 * The ADDITIVE per-tool native-tags map (`GET /api/tools/tags`). Distinct from the
 * flat `toolNames` contract (`GET /api/tools`, unchanged): this surfaces each
 * tool's FastMCP `tags` — including the ones preset bodies project — so the shared
 * `ToolPicker` can group/filter its options by tag.
 */
export const toolTagEntry = z.object({ name: z.string(), tags: z.array(z.string()) });
export const toolTags = z.array(toolTagEntry);
export type ToolTagEntry = z.infer<typeof toolTagEntry>;

// -- extensions --------------------------------------------------------------

export const extension = z.object({ name: z.string(), kind: z.string() });
export const extensions = z.array(extension);
export type Extension = z.infer<typeof extension>;

/**
 * One element of an extension combo: a bare extension NAME, or a
 * `{ name, config }` mapping binding author config (e.g. an `output_schema` JSON
 * Schema, or an `ask_external` verifier). Both wire forms are admitted so a
 * config-bearing combo parses without dropping server data. A drift throws
 * `ApiSchemaError`.
 */
export const presetExtensionElement = z.union([
  z.string(),
  z.object({ name: z.string(), config: z.record(z.string(), z.unknown()) }),
]);
export type PresetExtensionElement = z.infer<typeof presetExtensionElement>;

/**
 * `GET /api/tools/{name}/extensions` — a tool's FULL lossless list-of-combos plus
 * the extension catalog. `combos` is a list of combos, each an ordered list of
 * extension ELEMENTS (a bare name or a config-bearing `{ name, config }` mapping —
 * `output_schema` carries its schema this way); `[]` when the tool has no map entry.
 * It carries EVERY combo mapped to the base tool (the union across every `tools`/`mcp`
 * config), never a single flattened one. `available` is the same flat catalog
 * `GET /api/extensions` returns. A drift throws `ApiSchemaError`.
 */
export const toolExtensions = z.object({
  combos: z.array(z.array(presetExtensionElement)),
  available: extensions,
});
export type ToolExtensions = z.infer<typeof toolExtensions>;

// -- presets -----------------------------------------------------------------

/** A list of extension COMBOS — each combo an ordered list of elements. */
export const presetExtensions = z.array(z.array(presetExtensionElement));

/**
 * One preset as `GET /api/presets` returns it. Every preset is versioned, so
 * `active_version` is always an int; `conflicted` marks a QUARANTINED row (its
 * name collided with a foreign tool at boot — delete-only). `extensions` are the
 * ACTIVE version's extension combos, `tags` the preset's categorization labels
 * (distinct from a version's generic label list), and `output_schema` the
 * optional author-set output JSON Schema. A drift throws `ApiSchemaError`;
 * nothing is coerced.
 */
export const presetRecord = z.object({
  name: z.string(),
  base_tool: z.string(),
  description: z.string(),
  active_version: z.number(),
  tags: z.array(z.string()),
  extensions: presetExtensions,
  output_schema: z.record(z.string(), z.unknown()).nullable(),
  conflicted: z.boolean(),
  // The human-readable cause a row is quarantined (its name collided with a
  // foreign tool at boot), or `null` when the row is not conflicted. Rendered
  // verbatim; nothing is coerced.
  conflicted_reason: z.string().nullable(),
});
export type PresetRecord = z.infer<typeof presetRecord>;

export const presetList = z.array(presetRecord);

/** `GET /api/presets/{name}` — the record plus the active version's baked kwargs. */
export const presetDetail = presetRecord.extend({
  fixed_kwargs: z.record(z.string(), z.unknown()),
});
export type PresetDetail = z.infer<typeof presetDetail>;

/** The full version body a preset stores under `kind="preset"`. */
export const presetBody = z.object({
  base_tool: z.string(),
  description: z.string(),
  fixed_kwargs: z.record(z.string(), z.unknown()),
  extensions: presetExtensions,
  tags: z.array(z.string()),
  output_schema: z.record(z.string(), z.unknown()).nullable(),
});
export type PresetBody = z.infer<typeof presetBody>;

/**
 * One immutable version row (`GET /api/presets/{name}/versions[/{version}]`).
 * `is_current` flags the active version; `tags` here is the GENERIC per-version
 * label list (kind-agnostic), distinct from the categorization `body.tags`.
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

// -- templates ---------------------------------------------------------------

export const templateNames = z.array(z.string());
export const templateDetail = z.object({ template: z.string(), schema: jsonSchema });
export const templateUploaded = z.object({ path: z.string(), uploaded: z.literal(true) });
export const templateDeleted = z.object({ path: z.string(), deleted: z.literal(true) });
export const templateRendered = z.object({ rendered: z.string() });
export const templateCacheCleared = z.object({ cleared: z.literal(true) });

// -- storage -----------------------------------------------------------------

/** `GET /api/storage` — the storage-provider identity, or the absent sentinel
 * (`present: false`, a 200) when no storage-provider plugin is installed. */
export const storageInfo = z.object({
  present: z.boolean(),
  provider: z.string().nullable(),
  module: z.string().nullable(),
});
export type StorageInfo = z.infer<typeof storageInfo>;

/** `GET /api/storage/resources` — the full sorted resource-id list. */
export const storageResourceList = z.object({ resources: z.array(z.string()) });

/** `GET /api/storage/resources/{id}/stat` — an object's inferred content type;
 * `null` when the provider cannot infer one (e.g. an unknown suffix). */
export const storageResourceStat = z.object({
  id: z.string(),
  content_type: z.string().nullable(),
});
export type StorageResourceStat = z.infer<typeof storageResourceStat>;

/** `POST /api/storage/resources` — the stored object's id. */
export const storageResourceStored = z.object({ id: z.string(), stored: z.literal(true) });

/** `DELETE /api/storage/resources/{id}` — the removed object's id. */
export const storageResourceDeleted = z.object({ id: z.string(), deleted: z.literal(true) });

/** `DELETE /api/storage/dirs/{path}` — the removed directory subtree. */
export const storageDirDeleted = z.object({ dir: z.string(), deleted: z.literal(true) });

// -- backend identity + fleet (worker bus) -----------------------------------

/** `GET /api/backend` — the execution-backend identity, or the absent sentinel
 * (`present: false`, a 200) when no backend plugin is registered. Backend identity
 * is kept distinct from the fleet: the fleet doors ride the app's worker bus and
 * need no backend at all. */
export const backendInfo = z.object({
  present: z.boolean(),
  backend: z.string().nullable(),
  module: z.string().nullable(),
});
export type BackendInfo = z.infer<typeof backendInfo>;

/** The two worker kinds that join the bus: an ASGI `serve` worker or a
 * `backend` runtime process. A drift throws `ApiSchemaError`. */
export const originKind = z.enum(['serve', 'backend']);
export type OriginKind = z.infer<typeof originKind>;

/**
 * One live worker on the bus — a presence-census entry. `origin` is the
 * `{kind}-{uuid}` identity used as a reload target; `kind` tells the two worker
 * kinds apart; `pid` is the process id the presence key carries.
 */
export const fleetOrigin = z.object({
  origin: z.string(),
  kind: originKind,
  pid: z.number(),
});
export type FleetOrigin = z.infer<typeof fleetOrigin>;

/**
 * `GET /api/fleet/workers` — the live worker fleet from the bus presence census.
 * The census lists ALL subscribed origins (ASGI `serve` workers and backend-runtime
 * processes alike), not only backend workers. A census read that fails surfaces as a
 * loud 500, never a fabricated empty fleet.
 */
export const fleetWorkers = z.object({ workers: z.array(fleetOrigin) });
export type FleetWorkers = z.infer<typeof fleetWorkers>;

/**
 * One origin's outcome within a fleet broadcast. `applied`/`failed` are terminal
 * wire replies from a subscriber; `missing`/`departed`/`timed_out` are
 * publisher-computed from the presence census (a silent origin never sends them).
 */
export const fleetOutcome = z.enum(['applied', 'failed', 'missing', 'departed', 'timed_out']);
export type FleetOutcome = z.infer<typeof fleetOutcome>;

/**
 * One origin's result within a {@link fleetResult}. `payload` carries query-op data
 * (opaque to the UI); `error` carries a failed apply's message; `detail` carries the
 * publisher's report text for a computed `missing`/`departed`/`timed_out`. A drift
 * throws `ApiSchemaError`.
 */
export const fleetOriginResult = z.object({
  origin: z.string(),
  outcome: fleetOutcome,
  payload: jsonValue,
  error: z.string().nullable(),
  detail: z.string().nullable(),
});
export type FleetOriginResult = z.infer<typeof fleetOriginResult>;

/**
 * The awaited per-origin report of one fleet broadcast. Two honest shapes ride the
 * same schema. Reachable (`reachable: true`): `results` holds one entry per expected
 * origin (the serving worker's own entry included), so an unconfirmed sibling is a
 * visible `failed`/`missing`/`departed`/`timed_out` entry, never a silent stale
 * worker. Bus-unreachable (`reachable: false`): the transport failed before any
 * origin could reply, so `results` is empty and only `error` is carried. This is the
 * bare body of `POST /api/fleet/reload-config` and the single-MCP reload; it is also
 * the body the mode-wrapped {@link fleetReportFanout} carries under its `fleet` /
 * `unreachable` modes.
 */
export const fleetResult = z.object({
  op: z.string(),
  reachable: z.boolean(),
  local_only: z.boolean(),
  results: z.array(fleetOriginResult),
  error: z.string().nullable(),
});
export type FleetResult = z.infer<typeof fleetResult>;

/**
 * `POST /api/fleet/reload-config` — soft-restart the fleet and report per-origin. The
 * serving worker applies its own reload first, then broadcasts; the returned report
 * names every origin's outcome. A failed local apply does not abort the broadcast, so
 * the report is embedded even on the convergence-failure path.
 */
export const fleetReloadResult = fleetResult;
export type FleetReloadResult = z.infer<typeof fleetReloadResult>;

/**
 * The mode-wrapped fan-out summary a mutation embeds under its `fanout` field. Three
 * honest modes, discriminated on `mode`:
 *   - `local-only` — the broadcast reached no sibling (a lone worker / no bus), a
 *     benign single-process note.
 *   - `fleet` — a reachable multi-worker broadcast; carries the full {@link
 *     fleetResult} so an unconfirmed sibling is visible.
 *   - `unreachable` — the bus itself could not be reached; carries the
 *     bus-unreachable {@link fleetResult} (no origin list, only `error`).
 *
 * Every mutation whose response embeds this parses it EXPLICITLY: zod's default
 * unknown-key stripping would otherwise silently drop the field, hiding a failed
 * propagation from the shared fleet-report handler. A drift throws `ApiSchemaError`.
 */
export const fleetReportFanout = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('local-only'), note: z.string() }),
  fleetResult.extend({ mode: z.literal('fleet') }),
  fleetResult.extend({ mode: z.literal('unreachable') }),
]);
export type FleetReportFanout = z.infer<typeof fleetReportFanout>;

// -- manifest / mcp ----------------------------------------------------------

export const manifestView = z.object({
  mcp: z.array(z.record(z.string(), z.unknown())),
  user_tools: z.array(z.string()),
});
/**
 * The apply result every config-writer mutation returns (`POST /api/mcp-config`,
 * `POST /api/config/env`): the serving worker's local reload result (`status` +
 * `env_keys`) plus the mode-wrapped fleet fan-out of the reload it broadcast. The
 * `fanout` is parsed EXPLICITLY so the shared fleet-report handler can surface a
 * failed propagation — zod's unknown-key stripping would otherwise hide it. A drift
 * throws `ApiSchemaError`.
 */
export const reloadConfigResult = z.object({
  status: z.string(),
  env_keys: z.number(),
  fanout: fleetReportFanout,
});
export type ReloadConfigResult = z.infer<typeof reloadConfigResult>;

// -- system kinds ------------------------------------------------------------
// `GET /api/system/kinds` — one row per pluggable kind (identity, accounts,
// monitoring, storage, backend, channels, webhook_verifiers, config,
// studio_plugins). `state` is the kind's active/default/off status: `active` = a
// real plugin serves it, `default` = a built-in fallback serves it, `off` =
// nothing is registered (a legal state, reported not "fixed"). `plugin` is the
// provider/module name when known, else null. Plain (non-strict) `z.object` so a
// server that adds a field to the row still parses.

export const kindStatus = z.object({
  kind: z.string(),
  state: z.enum(['active', 'default', 'off']),
  plugin: z.string().nullable(),
  detail: z.string(),
});
export const kindStatusList = z.array(kindStatus);
export type KindStatus = z.infer<typeof kindStatus>;

/**
 * `POST /api/tools/{name}/extensions` — the apply result. The write persists the
 * manifest, reloads locally, then broadcasts the reload to the whole fleet. The
 * response is the one apply-result shape every config-writer returns: the local
 * reload result (`status` + `env_keys`) plus the mode-wrapped fleet `fanout`. The
 * fan-out rides EVERY deployment (a lone worker reports `local-only`), so this flat
 * shape parses every save and the shared fleet-report handler renders any failed
 * propagation from `fanout`.
 */
export const toolExtensionsApplyResult = reloadConfigResult;
export type ToolExtensionsApplyResult = z.infer<typeof toolExtensionsApplyResult>;
export const mcpStatus = z.object({
  bound: z.record(z.string(), z.array(z.string())),
  failed: z.array(z.object({ title: z.string(), status: z.string() })),
});

/**
 * `POST /api/mcp-status/{title}/reload` — re-probe a single MCP server and broadcast
 * the reload to the fleet. The response is the bare per-origin {@link fleetResult}
 * (the serving worker's re-probe rides its own `results` entry as the payload); there
 * is no local/workers split. A drift throws `ApiSchemaError`.
 */
export const mcpReloadResult = fleetResult;
export type McpReloadResult = z.infer<typeof mcpReloadResult>;

// -- sub-mcp -----------------------------------------------------------------

export const subMcpList = z.record(z.string(), z.record(z.string(), z.unknown()));
export const subMcpCreated = z.object({ slug: z.string(), tools: z.array(z.string()) });
export const subMcpRemoved = z.object({ slug: z.string(), removed: z.literal(true) });

// -- config ------------------------------------------------------------------

export const envConfig = z.object({
  env: z.record(z.string(), z.string()),
  secret_keys: z.array(z.string()),
});
/**
 * `GET /api/config/mode` — the active config backend mode (`file` / `k8s`). The
 * skeleton emits ONLY `config_mode`; `read_only` is a UI-side gate that no config
 * backend currently drives (both the `file` and `k8s` providers implement writes),
 * so it is tolerated-absent and defaults to `false` (writable). A deployment whose
 * config is genuinely read-only can still opt in by emitting `read_only: true`,
 * which the settings surface honors — but its absence is the normal case, not a
 * drift, so requiring it here would make every real `getConfigMode()` throw.
 */
export const configMode = z.object({
  config_mode: z.string(),
  read_only: z.boolean().default(false),
});

// -- connectors --------------------------------------------------------------

export const subServiceView = z.object({
  id: z.string(),
  display_name: z.string(),
  description: z.string(),
  scopes: z.array(z.string()),
});

export const configFieldView = z.object({
  key: z.string(),
  label: z.string(),
  target: z.enum(['env', 'header']),
  required: z.boolean(),
  secret: z.boolean(),
});

export const providerView = z.object({
  id: z.string(),
  display_name: z.string(),
  description: z.string(),
  icon_url: z.string(),
  kind: z.enum(['oauth', 'none']),
  origin: z.enum(['system', 'community']),
  category: z.string(),
  sub_services: z.array(subServiceView),
  config_fields: z.array(configFieldView),
});
export const providers = z.array(providerView);
export type ProviderView = z.infer<typeof providerView>;

export const connectionView = z.object({
  connection_id: z.string(),
  provider_id: z.string(),
  alias: z.string(),
  kind: z.enum(['oauth', 'none']),
  account_identity: z.string().nullable(),
  enabled_sub_services: z.array(z.string()),
  granted_scopes: z.array(z.string()),
  auth_health_state: z.enum(['healthy', 'reconnect_required', 'refresh_failing']),
  created_at: z.string(),
});
export type ConnectionView = z.infer<typeof connectionView>;

export const connectionsList = z.object({ items: z.array(connectionView), total: z.number() });

// A connector mutation that writes the manifest embeds the mode-wrapped fleet
// `fanout` of the reload it broadcast; it is `null` when the response path mutated no
// manifest (an OAuth START opens a flow before any write). Parsed EXPLICITLY so the
// shared fleet-report handler surfaces a failed propagation on every connector flow —
// zod's unknown-key stripping would otherwise drop it silently.
export const startConnectResult = z.union([
  z.object({ flow_id: z.string(), authorize_url: z.string() }),
  z.object({
    connection_id: z.string(),
    added_manifest_entries: z.array(z.string()),
    fanout: fleetReportFanout.nullable(),
  }),
]);

// A reconnect START opens an OAuth flow and writes no manifest, so it carries no
// fan-out (the manifest write lands when the flow completes).
export const reconnectResult = z.object({ flow_id: z.string(), authorize_url: z.string() });

export const disconnectResult = z.object({
  connection_id: z.string(),
  upstream_revoke_outcome: z.enum(['success', 'failed', 'skipped']),
  upstream_revoke_status: z.number().nullable(),
  removed_manifest_entries: z.array(z.string()),
  fanout: fleetReportFanout.nullable(),
});

export const patchSubServicesResult = z.object({
  connection_id: z.string(),
  enabled_sub_services: z.array(z.string()),
  consent_required: z.boolean(),
  flow_id: z.string().nullable(),
  authorize_url: z.string().nullable(),
  added_manifest_entries: z.array(z.string()),
  removed_manifest_entries: z.array(z.string()),
  // `null` on a consent-only toggle that forks an OAuth flow without a manifest write.
  fanout: fleetReportFanout.nullable(),
});

export const oauthCompleteResult = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('success'),
    connection_id: z.string(),
    return_url: z.string(),
    // `null` when completing the flow mutated no manifest (a reconcile that changed
    // nothing).
    fanout: fleetReportFanout.nullable(),
  }),
  z.object({ kind: z.literal('failed'), reason: z.string() }),
  z.object({ kind: z.literal('cancelled'), message: z.string() }),
]);
export type OAuthCompleteResult = z.infer<typeof oauthCompleteResult>;

// -- studio plugin registry --------------------------------------------------

export const studioPluginManifest = z.object({
  name: z.string(),
  version: z.string(),
  api_version: z.number(),
  entry: z.string(),
  integrity: z.record(z.string(), z.string()),
  contributions: z.object({
    tool_panels: z.record(z.string(), z.string()).default({}),
    pages: z.array(z.string()).default([]),
    settings_tabs: z.array(z.string()).default([]),
    // Optional with a default so a manifest without the field still parses; the
    // non-strict object would otherwise SILENTLY STRIP an undeclared field, so a
    // server that serves `nav_entries` would never reach the UI.
    nav_entries: z.array(z.string()).default([]),
  }),
});
export const studioPluginRegistry = z.array(studioPluginManifest);
export type StudioPluginManifest = z.infer<typeof studioPluginManifest>;

// -- interactions ------------------------------------------------------------
// Shapes match the skeleton's interactions SSE contract: the SSE
// `interaction.add` frame carries the question and its answer format; the answer
// door returns { interaction_id, status }. `answered` is not a wire field — it
// is a client-side flag the stream hook flips on an `interaction.answered` event.

export const answerFormat = z.enum(['text', 'confirm', 'select', 'form', 'external']);
export type AnswerFormat = z.infer<typeof answerFormat>;

/** The kind of a question's display-only media item: a remote/inline image, or a link. */
export const mediaKind = z.enum(['image', 'link']);
export type MediaKind = z.infer<typeof mediaKind>;

/**
 * One item of a question's display-only media. Applied PER ITEM by the renderer
 * (never as a strict array on the frame): the frame's `media` field is a loose
 * `z.array(z.unknown())`, and the renderer `safeParse`s each item with this schema
 * so one malformed/hostile item is a loud per-item notice, not a whole-frame parse
 * failure that would silently vanish an answerable question.
 *
 * `caption` is `.nullish()` (absent OR `null` both parse to a caption-less item):
 * a caption-less item may arrive with the key omitted OR with an explicit `null`, so
 * `.optional()` here would false-fail the explicit `null` and render a good image as
 * malformed. `url` and `kind` are the only load-bearing fields; the image
 * src scheme gate and the link neutralization are enforced by the renderer.
 */
export const interactionMediaItem = z.object({
  kind: mediaKind,
  url: z.string(),
  caption: z.string().nullish(),
});
export type InteractionMediaItem = z.infer<typeof interactionMediaItem>;

export const interaction = z.object({
  interaction_id: z.string(),
  group_id: z.string(),
  question: z.string().default(''),
  answer_format: answerFormat,
  // Format-specific payload: select options, form JSON schema, external url. The
  // wire sends `null` for formats that carry none (text/confirm); it is
  // normalized to `{}` so consumers always see an object.
  format_payload: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((value) => value ?? {}),
  created_at: z.string(),
  timeout_at: z.string(),
  // Whether the answer body is sensitive and never persisted server-side. Rides
  // every add frame; an absent value (older frame) normalizes to false.
  sensitive: z.boolean().default(false),
  // True only for an external question answered by a signed server-to-server
  // callback (never by a human); the frame never carries the verifier object.
  // Absent/undefined for every other question.
  server_verified: z.boolean().optional(),
  // Name of the channel plugin the question was also delivered through (e.g.
  // "telegram"); absent when the question lives only in this inbox.
  channel: z.string().optional(),
  // Display-only media shown WITH the question (images and/or links). Absent when
  // the question carries none. Deliberately LOOSE (`z.array(z.unknown())`): each
  // item is `safeParse`d per item by the renderer against `interactionMediaItem`,
  // so one malformed/hostile item can never fail the whole frame parse and hide an
  // answerable question. A present non-array value is still malformed.
  media: z.array(z.unknown()).optional(),
});
export type Interaction = z.infer<typeof interaction>;

/** The answer door's response — the blocked caller was woken. */
export const interactionAnswered = z.object({
  interaction_id: z.string(),
  status: z.string(),
});
export type InteractionAnswered = z.infer<typeof interactionAnswered>;

// -- channels ----------------------------------------------------------------
// The installed channel-plugin catalog: names registered via the manifest's
// channel modules. A deployment with none bound answers questions only in this
// inbox (the Studio default).

export const channels = z.object({
  channels: z.array(z.string()),
});
export type Channels = z.infer<typeof channels>;

// -- notifications -----------------------------------------------------------
// The internal notifications sink: the messages the `notify_user` operation records
// with no channel, so they land only in the Studio inbox. Each record carries the
// server-minted id + timestamp; `recipient` is null when the message names none.

export const notification = z.object({
  id: z.string(),
  message: z.string(),
  recipient: z.string().nullable(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof notification>;

export const notifications = z.object({
  notifications: z.array(notification),
});
export type Notifications = z.infer<typeof notifications>;

// -- hooks -------------------------------------------------------------------
// Shapes match tai42_contract.hooks.HookParams: a hook fires a `tool` on a `topic`,
// optionally gated by a `condition` and shaped by an `expr` (each either an inline
// spec or a registered id, with its own kwargs).

/** A fire door — who may trigger a path, not what the fire may do. A string enum. */
export const triggerAuth = z.enum([
  'public',
  'verifier',
  'token',
  'token+api_key',
  'out-of-service',
]);
export type TriggerAuth = z.infer<typeof triggerAuth>;

export const hookParams = z.object({
  name: z.string(),
  topic: z.string(),
  tool: z.string(),
  // The api-key `user_id` the fire runs AS.
  execution_key: z.string().min(1),
  tool_kwargs: z.record(z.string(), z.unknown()).default({}),
  condition: z.string().nullable().default(null),
  condition_id: z.string().nullable().default(null),
  // The `*_kwargs` pair is non-optional in the contract (defaults to {}, never
  // null) — unlike the sibling condition/expr string fields, which are nullable.
  condition_kwargs: z.record(z.string(), z.unknown()).default({}),
  expr: z.string().nullable().default(null),
  expr_id: z.string().nullable().default(null),
  expr_kwargs: z.record(z.string(), z.unknown()).default({}),
});
export type HookParams = z.infer<typeof hookParams>;

export const hookList = z.object({
  items: z.array(hookParams),
  total: z.number(),
  // Per-topic verifier bindings: the topic name maps to the verifier bound to it
  // and that verifier's config (which carries a `secret_env` name, never a secret
  // value). Tolerant of an older/empty response, which omits the key entirely.
  topic_verifiers: z
    .record(
      z.string(),
      z.object({ verifier: z.string(), config: z.record(z.string(), z.unknown()) }),
    )
    .default({}),
  // Per-topic fire door (topic → door). Tolerant of an older response omitting it.
  trigger_auth: z.record(z.string(), triggerAuth).default({}),
});
export type HookList = z.infer<typeof hookList>;

export const hookRegistered = z.object({
  registered: z.boolean(),
  name: z.string(),
});

export const hookRemoved = z.object({
  removed: z.boolean(),
  name: z.string(),
});

// The registered webhook-verifier catalog (`GET /api/hooks/verifiers`) — the
// sorted verifier NAMES only, never any verifier's config. An empty registry is a
// valid empty array. This is the ONLY source the topic-verifier bind picker reads.
export const hookVerifiers = z.array(z.string());

/** `PUT /api/hooks/topics/{topic}/verifier` — the bound topic + verifier name. */
export const topicVerifierSet = z.object({ topic: z.string(), verifier: z.string() });

/** `DELETE /api/hooks/topics/{topic}/verifier` — the unbound topic. */
export const topicVerifierRemoved = z.object({ removed: z.boolean(), topic: z.string() });

// -- trigger links -----------------------------------------------------------
// A trigger link is a minted, token-bearing PUBLIC URL (`GET|POST /trigger/{token}`)
// that resolves to a hook TOPIC and fires it. Studio mints, lists, and revokes them
// on the hooks page; the QR encodes the composed absolute URL.

/**
 * `POST /api/hooks/trigger-links` — a freshly minted trigger link. `trigger_path`
 * is a relative path (`/trigger/<token>`, never an absolute URL — Studio composes
 * the API origin); `token` is the raw token returned exactly ONCE, in this response
 * (nothing else stores or lists it — a listed link's QR is unrecoverable by
 * design). `expires_at` is an ISO-8601 instant, or `null` for a permanent link.
 */
export const triggerLinkCreated = z.object({
  name: z.string(),
  trigger_path: z.string(),
  token: z.string(),
  topic: z.string(),
  expires_at: z.string().nullable(),
});
export type TriggerLinkCreated = z.infer<typeof triggerLinkCreated>;

/**
 * One listed trigger-link record (`GET /api/hooks/trigger-links` item). `tool_kwargs`
 * is the per-link params merged last into every fire (`null` or `{}` = none);
 * `created_by` is the ambient creator identity (`null` on an identity-less,
 * gate-off deployment); `token_hash_prefix` is a short hash prefix for log
 * correlation — never a raw token (none is stored).
 */
export const triggerLinkRecord = z.object({
  name: z.string(),
  topic: z.string(),
  execution_key: z.string().min(1),
  trigger_auth: triggerAuth,
  tool_kwargs: z.record(z.string(), z.unknown()).nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string().nullable(),
  token_hash_prefix: z.string(),
});
export type TriggerLinkRecord = z.infer<typeof triggerLinkRecord>;

/** `GET /api/hooks/trigger-links` — every live trigger-link record. */
export const triggerLinkList = z.object({
  items: z.array(triggerLinkRecord),
  total: z.number(),
});
export type TriggerLinkList = z.infer<typeof triggerLinkList>;

/** `DELETE /api/hooks/trigger-links/{name}` — the revoked link. */
export const triggerLinkDeleted = z.object({ removed: z.boolean(), name: z.string() });
export type TriggerLinkDeleted = z.infer<typeof triggerLinkDeleted>;

// -- settings schema ---------------------------------------------------------
// The settings form is auto-rendered from a declarative group/field description
// the skeleton emits from its typed settings models.

export const settingsSchema = z.object({
  groups: z.array(
    z.object({
      name: z.string(),
      module: z.string(),
      qualname: z.string(),
      fields: z.array(
        z.object({
          name: z.string(),
          env_var: z.string(),
          type: z.string(),
          default: jsonValue.nullable(),
          required: z.boolean(),
          secret: z.boolean(),
          description: z.string().nullable(),
          nested_group: z.string().nullable(),
          value: jsonValue.nullable(),
        }),
      ),
    }),
  ),
});
export type SettingsSchema = z.infer<typeof settingsSchema>;

// -- auth: scopes + api keys -------------------------------------------------

/** `{ url: scope_id }` — every URL currently mapped to a scope. */
export const authScopes = z.record(z.string(), z.string());

export const addUrlToScopeResult = z.object({ scope_id: z.string(), url: z.string() });
export const removeUrlFromScopeResult = z.object({ url: z.string() });
export const removeScopeResult = z.object({ scope_id: z.string(), deleted_keys: z.number() });

/**
 * A route's authorization ACTION class, joined onto the catalog from the route
 * registry. `read`/`write` routes are GRANTABLE — a role's per-tag level opens
 * them; `fenced`/`secret` routes are ADMIN-ONLY and never grantable (no per-tag
 * level reaches them). `null` marks a path the registry carries no metadata for
 * (an unregistered/ungated path — no feature tags, no action).
 */
export const routeAction = z.enum(['read', 'write', 'fenced', 'secret']);
export type RouteAction = z.infer<typeof routeAction>;

/**
 * One row of the route catalog (`GET /api/auth/routes`) — a plain HTTP route with
 * its current mapping, JOINED with its route-registry metadata. `mapped` is the
 * scope id, the public marker, or `null` when the path is unmapped (the mapper's
 * "unassigned" bucket source). `methods` is the route's method set with `HEAD`
 * removed. `tags` are the route's feature-group labels, `summary` its one-line
 * description, and `action` its authorization class — the join fields the Roles
 * grant editor reads to derive grantable feature groups and mark the admin-only
 * (fenced/secret) routes it must never offer a grant for. An unregistered path
 * carries `tags: []`, `summary: ''`, `action: null`.
 */
export const authRoute = z.object({
  path: z.string(),
  methods: z.array(z.string()),
  mapped: z.string().nullable(),
  tags: z.array(z.string()),
  summary: z.string(),
  action: routeAction.nullable(),
});
export type AuthRoute = z.infer<typeof authRoute>;
export const authRoutes = z.array(authRoute);

// -- auth: roles (editable per-tag RBAC) -------------------------------------

/** A role's per-tag ACCESS LEVEL: `none` (no access), `read`, or `write`. */
export const grantLevel = z.enum(['none', 'read', 'write']);
export type GrantLevel = z.infer<typeof grantLevel>;

/** A role's editable grant map: feature-group TAG name → the role's access level. */
export const roleGrants = z.record(z.string(), grantLevel);
export type RoleGrants = z.infer<typeof roleGrants>;

/**
 * A role body (`GET /api/auth/roles`, and the write routes' echo). Layer 1 is the
 * read-only base-tier ceiling — the seeded jq `condition` plus `base_tier`
 * (`editor`/`viewer`, or `null` for the reserved `allow_all` admin). Layer 2 is the
 * editable per-tag `grants` map. `allow_all` (admin) carries an empty `grants` map
 * and reaches everything, un-lockable. `condition`/`condition_id`/`condition_kwargs`
 * are the base-tier jq — READ-ONLY here (no raw-jq authoring surface).
 */
export const roleBody = z.object({
  name: z.string(),
  description: z.string(),
  scopes: z.array(z.string()),
  condition: z.string().nullable(),
  condition_id: z.string().nullable(),
  condition_kwargs: jsonValue.nullable(),
  base_tier: z.string().nullable(),
  allow_all: z.boolean(),
  grants: roleGrants,
});
export type RoleBody = z.infer<typeof roleBody>;
export const roleList = z.array(roleBody);

/** `DELETE /api/auth/roles/{name}` — the deleted role's name. */
export const roleDeleted = z.object({ name: z.string(), deleted: z.boolean() });

/**
 * One immutable role-version row (`GET /api/auth/roles/{name}/versions` →
 * `versions`). `body` is the role body at that version; `is_current` flags the
 * active pointer. Mirrors the generic versioned-store row shape.
 */
export const roleVersion = z.object({
  version: z.number(),
  body: roleBody,
  tags: z.array(z.string()),
  created_at: z.string(),
  is_current: z.boolean(),
});
export type RoleVersion = z.infer<typeof roleVersion>;

/**
 * One who/action/before→after audit row (`GET /api/auth/roles/{name}/versions` →
 * `audit`). Its `body` carries the mutation kind, the actor, and the before/after
 * role bodies (both `null` for a create's `before` / a delete's `after`).
 */
export const roleAuditEvent = z.object({
  version: z.number(),
  body: z.object({
    action: z.string(),
    actor: z.string().nullable(),
    before: jsonValue.nullable(),
    after: jsonValue.nullable(),
  }),
  tags: z.array(z.string()),
  created_at: z.string(),
  is_current: z.boolean(),
});
export type RoleAuditEvent = z.infer<typeof roleAuditEvent>;

/** `GET /api/auth/roles/{name}/versions` — the append-only history + audit trail. */
export const roleVersions = z.object({
  versions: z.array(roleVersion),
  audit: z.array(roleAuditEvent),
});
export type RoleVersions = z.infer<typeof roleVersions>;

/** `GET /api/auth/public-routes` — the sorted urls pinned to the public marker. */
export const publicRoutes = z.array(z.string());

/** `POST /api/auth/public-routes` — the pinned url. */
export const pinPublicResult = z.object({ url: z.string() });
/** `DELETE /api/auth/public-routes` — the unpinned url (404 when not pinned). */
export const unpinPublicResult = z.object({ url: z.string() });

/** The per-key payloads (`GET /api/auth/tokens-payload`). The stable per-mint
 * `key_fingerprint` is nested under `policy_data`; the picker reads it there. */
export const tokensPayload = z.array(
  z.object({
    // The value an `execution_key` binding names.
    user_id: z.string().min(1),
    description: z.string(),
    scopes: z.array(z.string()),
    policy_data: jsonValue,
    condition: z.string().nullable().optional(),
    condition_id: z.string().nullable().optional(),
    condition_kwargs: jsonValue.nullable().optional(),
  }),
);
export type TokensPayload = z.infer<typeof tokensPayload>;

/** The raw `sk-…` key string, returned once at creation time and never again. */
export const createdApiKey = z.string();
export const editApiKeyResult = z.object({ user_id: z.string(), updated: z.boolean() });
export const revokeApiKeyResult = z.object({ user_id: z.string(), revoked: z.boolean() });

// -- login methods (the public sign-in aggregator) ---------------------------

/**
 * One field of a `form` login method. `secret` fields render as password
 * inputs; `autocomplete` passes through to the input (e.g. "email",
 * "current-password", "new-password").
 */
export const loginFormField = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  secret: z.boolean(),
  autocomplete: z.string().optional(),
});

/**
 * The two — and only two — login-method shapes. Discriminated on `shape`; an
 * unknown shape fails validation loudly (contract drift, not a soft skip).
 * Optional fields are `.optional()` (absent), never `.nullable()`: the server
 * serializes with `exclude_none`, so an absent field is OMITTED, never `null`.
 */
export const loginMethod = z.discriminatedUnion('shape', [
  z.object({
    shape: z.literal('form'),
    id: z.string().min(1),
    title: z.string().min(1),
    purpose: z.enum(['login', 'bootstrap', 'invite']).default('login'),
    fields: z.array(loginFormField).min(1),
    submit_path: z.string().min(1),
  }),
  z.object({
    shape: z.literal('button'),
    id: z.string().min(1),
    label: z.string().min(1),
    icon: z.string().optional(),
    href: z.string().min(1),
  }),
]);

/**
 * `GET /api/login/methods` (PUBLIC). `bootstrap: true` ⇒ the deployment has zero
 * accounts and `methods` contains the owner-creation form. Non-strict — the
 * skeleton may grow additive fields.
 */
export const loginMethods = z.object({
  methods: z.array(loginMethod),
  bootstrap: z.boolean(),
});

/**
 * A successful login/exchange: the minted session token (opaque, `tai-sess-`
 * prefixed — the client treats it as an opaque string) + its user.
 */
export const loginResult = z.object({
  token: z.string().min(1),
  user_id: z.string().min(1),
});

export type LoginFormField = z.infer<typeof loginFormField>;
export type LoginMethod = z.infer<typeof loginMethod>;
export type LoginMethods = z.infer<typeof loginMethods>;
export type LoginResult = z.infer<typeof loginResult>;

// -- auth: the caller's capability projection (GET /api/auth/me) --------------

/** A concrete route the caller can reach, with the methods that pass its jq fence. */
export const routeEntry = z.object({
  path: z.string(),
  methods: z.array(z.string()),
});
export type RouteEntry = z.infer<typeof routeEntry>;

/**
 * A dynamic route pattern the caller can reach — a mount/pattern surface not
 * enumerable into concrete paths, projected only when its scope AND jq admit it.
 */
export const patternEntry = z.object({
  pattern: z.string(),
  scope_id: z.string(),
});
export type PatternEntry = z.infer<typeof patternEntry>;

/** A sub-MCP mount the caller can reach, with the tools it exposes. */
export const subMcpEntry = z.object({
  slug: z.string(),
  tools: z.array(z.string()),
  transport: z.string(),
});
export type SubMcpEntry = z.infer<typeof subMcpEntry>;

/**
 * `GET /api/auth/me` — the caller's derived capability projection: the concrete
 * (path, method) surface, dynamic patterns, sub-MCP mounts, tools, and agents it
 * can reach RIGHT NOW (derived server-side, never stored). `admin` is the
 * condition-free ownerless `"*"` discriminator (a TOTAL projection); a scoped
 * session carries `admin: false` and a jq-exact `routes` list. `owner_user_id` is
 * the key's owner claim, `null` for an ownerless key. The invariant is
 * projection ⊆ gate: every projected surface is one the server would admit, so
 * the UI can filter on it without ever advertising a door the gate denies.
 */
export const meProjection = z.object({
  user_id: z.string(),
  owner_user_id: z.string().nullable(),
  admin: z.boolean(),
  scopes: z.array(z.string()),
  routes: z.array(routeEntry),
  route_patterns: z.array(patternEntry),
  sub_mcp: z.array(subMcpEntry),
  tools: z.array(z.string()),
  agents: z.array(z.string()),
  mintable: z.boolean(),
});
export type MeProjection = z.infer<typeof meProjection>;

/**
 * `POST /api/auth/claim-links` — a one-time claim link minted in the key-create
 * flow. `claim_path` is a fragment-carrier path (`/login#claim=<token>`, never an
 * absolute URL — the Studio composes the origin); `token` is the raw claim token
 * returned exactly ONCE; `expires_at` is an ISO-8601 instant.
 */
export const claimLinkCreated = z.object({
  claim_path: z.string(),
  token: z.string(),
  expires_at: z.string(),
});
export type ClaimLinkCreated = z.infer<typeof claimLinkCreated>;

/**
 * `POST /api/auth/logout` — the single authed logout dispatcher's result.
 * `revoked` is `true` when a live accounts session was revoked; a plain `sk-` key
 * has nothing to revoke and answers `404` (a loud absent-session signal), never a
 * `revoked: false` body. Non-strict, so a SUCCESSFUL logout never throws
 * `ApiSchemaError` on an additive field.
 */
export const logoutResult = z.object({ revoked: z.boolean() });
export type LogoutResult = z.infer<typeof logoutResult>;

/**
 * `GET /api/auth/capabilities` — whether this deployment can MINT API keys
 * locally. `mintable: false` means every configured identity provider is
 * validator-only (keys are issued at an external issuer), so the key-creation
 * UI disables up front instead of surfacing a raw mint failure. Non-strict.
 */
export const authCapabilities = z.object({
  mintable: z.boolean(),
  providers: z.array(z.object({ name: z.string(), mintable: z.boolean() })),
});
export type AuthCapabilities = z.infer<typeof authCapabilities>;

// -- access-control policy (authoring + versioning) --------------------------

/**
 * `POST /api/auth/validate-condition` — the fail-closed jq guard. `ok` is the
 * compile/render result; `result` is the boolean of a sample evaluation, or
 * `null` when no `sample_context` was supplied (compile-only). A broken condition
 * is a `400 {error}` surfaced by the transport, NEVER a false `ok` — so a
 * syntactically-broken condition can be caught before it locks a key out. A drift
 * throws `ApiSchemaError`.
 */
export const validateConditionResult = z.object({
  ok: z.boolean(),
  result: z.boolean().nullable(),
});
export type ValidateConditionResult = z.infer<typeof validateConditionResult>;

/**
 * The enforced policy shape a version body carries. SECRET-ADJACENT — `condition`
 * can reveal auth logic, so its fixtures are hand-authored, never captured.
 * `condition`/`condition_id` are mutually exclusive at author time; both are
 * nullable here because whichever mode is unused is stored as `null`.
 */
export const policyBody = z.object({
  scopes: z.array(z.string()),
  policy_data: jsonValue,
  condition: z.string().nullable(),
  condition_id: z.string().nullable(),
  condition_kwargs: jsonValue.nullable(),
});
export type PolicyBody = z.infer<typeof policyBody>;

/**
 * One immutable policy version row
 * (`GET /api/auth/api-keys/{user_id}/policy/versions`). `is_current` flags the
 * active pointer; `tags` is the generic per-version label list (kind-agnostic),
 * mirroring the preset version shape.
 */
export const policyVersion = z.object({
  version: z.number(),
  body: policyBody,
  tags: z.array(z.string()),
  created_at: z.string(),
  is_current: z.boolean(),
});
export type PolicyVersion = z.infer<typeof policyVersion>;

export const policyVersionList = z.array(policyVersion);

/** `POST /api/auth/api-keys/{user_id}/policy/rollback` — the re-pointed version. */
export const policyRollback = z.object({ user_id: z.string(), active_version: z.number() });

// -- backup ------------------------------------------------------------------

export const backupSections = z.array(z.object({ name: z.string(), secret: z.boolean() }));

/** The exported backup document — validated when the UI reads a picked file. */
export const backupDocument = z.object({
  version: z.literal(1),
  created_at: z.string(),
  sections: z.record(z.string(), z.unknown()),
  errors: z.record(z.string(), z.string()).optional(),
});
export type BackupDocument = z.infer<typeof backupDocument>;

export const backupImportReport = z.object({
  ok: z.boolean(),
  sections: z.record(
    z.string(),
    z.object({
      created: z.number(),
      updated: z.number(),
      skipped: z.number(),
      errors: z.array(z.string()),
      new_api_keys: z
        .array(
          z.object({
            user_id: z.string(),
            description: z.string(),
            api_key: z.string(),
          }),
        )
        .optional(),
      // The `manifest` and `env` sections apply through the config pipeline, so their
      // report carries the mode-wrapped fleet `fanout` of the restore's reload; other
      // sections omit it. Parsed EXPLICITLY so the shared fleet-report handler can
      // surface a failed restore propagation — otherwise zod would strip it silently.
      fanout: fleetReportFanout.optional(),
    }),
  ),
});
export type BackupImportReport = z.infer<typeof backupImportReport>;

// -- schedules ---------------------------------------------------------------
// The skeleton returns opaque backend-tool results; the table reads a few known
// fields and passes the rest through untouched.

export const scheduleItem = z
  .object({
    name: z.string(),
    enabled: z.boolean().optional(),
    schedule: jsonValue.optional(),
    target: jsonValue.optional(),
    args: z.array(jsonValue).optional(),
    kwargs: z.record(z.string(), jsonValue).optional(),
  })
  .passthrough();
export const scheduleList = z.array(scheduleItem);
export type ScheduleItem = z.infer<typeof scheduleItem>;

export const serverDateTime = z
  .object({
    utc: jsonValue,
    local: jsonValue.optional(),
    system: jsonValue.optional(),
  })
  .passthrough();

// -- observability -----------------------------------------------------------

export const dashboardMetrics = z.object({
  summary: z.object({
    totalRuns: z.number(),
    totalCost: z.number(),
    totalTokens: z.number(),
    averageLatencyMs: z.number(),
    avgCostPerRun: z.number(),
    avgTokensPerRun: z.number(),
    timeToFirstTokenMs: z.number().nullable(),
  }),
  timeSeries: z.array(
    z.object({
      bucket: z.string().nullable(),
      runs: z.number(),
      cost: z.number(),
      avgLatencyMs: z.number(),
      totalTokens: z.number(),
    }),
  ),
  byModel: z.array(
    z.object({
      model: z.string(),
      calls: z.number(),
      cost: z.number(),
      totalTokens: z.number(),
      avgLatencyMs: z.number(),
    }),
  ),
  granularity: z.enum(['hour', 'day', 'week']),
});
export type DashboardMetrics = z.infer<typeof dashboardMetrics>;

export const run = z.object({
  id: z.string(),
  traceId: z.string(),
  createdAt: z.string().nullable(),
  tags: z.array(z.string()),
  status: z.enum(['error', 'success']),
  cost: z.number().nullable(),
  latencyMs: z.number().nullable(),
  totalTokens: z.number().nullable(),
  model: z.string().nullable(),
  inputPreview: jsonValue,
  outputPreview: jsonValue,
  fetchError: z.string().nullable(),
});
export type Run = z.infer<typeof run>;

export const runsPage = z.object({
  items: z.array(run),
  page: z.number(),
  nextPage: z.number().nullable(),
});

export const runSpan = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  traceId: z.string().nullable(),
  name: z.string().nullable(),
  type: z.string().nullable(),
  level: z.string().nullable(),
  statusMessage: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  model: z.string().nullable(),
  usage: jsonValue.nullable(),
  metadata: jsonValue.nullable(),
  input: jsonValue,
  output: jsonValue,
  nodeId: z.string().nullable(),
});
export type RunSpan = z.infer<typeof runSpan>;

export const runTrace = z.object({
  traceId: z.string(),
  timestamp: z.string().nullable(),
  tags: z.array(z.string()),
  totalCost: z.number().nullable(),
  input: jsonValue,
  output: jsonValue,
  metadata: jsonValue.nullable(),
  availability: z.enum(['unavailable', 'full', 'partial']),
  fetchError: z.string().nullable(),
  spans: z.array(runSpan),
});
export type RunTrace = z.infer<typeof runTrace>;

// -- marketplace -------------------------------------------------------------

/**
 * One contained item of a marketplace plugin (a searchable row): its kind
 * (tool / agent / extension / …), name, description, and free-form tags.
 */
export const marketplaceItem = z.object({
  kind: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});
export type MarketplaceItem = z.infer<typeof marketplaceItem>;

/**
 * One item-level search row (`GET /api/marketplace/search`): the contained item
 * plus the listing it belongs to. `ref` is the "namespace/name" install target
 * (install targets the LISTING), so every row carries enough to group under and
 * link to its plugin. `latest_version` is nullable defensively; the search
 * relation only emits listings with a published version.
 */
export const marketplaceSearchRow = z.object({
  item: marketplaceItem,
  ref: z.string(),
  namespace: z.string(),
  name: z.string(),
  display_name: z.string().nullable(),
  icon_url: z.string().nullable(),
  package: z.string(),
  description: z.string(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  trust_tier: z.string(),
  pricing: z.string(),
  latest_version: z.string().nullable(),
  downloads: z.number(),
  updated_at: z.string(),
});
export type MarketplaceSearchRow = z.infer<typeof marketplaceSearchRow>;

/**
 * One page of search rows. The wire carries no next-page field — has-next is
 * COMPUTED: `page * page_size < total`.
 */
export const marketplaceSearchPage = z.object({
  items: z.array(marketplaceSearchRow),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
});
export type MarketplaceSearchPage = z.infer<typeof marketplaceSearchPage>;

/**
 * One version of a listing as the versions list carries it (`version`, its
 * publication `status`, the `contract_range` it was validated against, and when
 * it was `published_at`). `contract_range` and `published_at` are null until a
 * version reaches the published state, so both are nullable.
 */
export const marketplaceVersion = z.object({
  version: z.string(),
  contract_range: z.string().nullable(),
  status: z.string(),
  published_at: z.string().nullable(),
});
export type MarketplaceVersion = z.infer<typeof marketplaceVersion>;

/**
 * The listing's latest published version as embedded in its detail: the version
 * plus the items that version contains.
 */
export const marketplaceLatestVersion = marketplaceVersion.extend({
  items: z.array(marketplaceItem),
});
export type MarketplaceLatestVersion = z.infer<typeof marketplaceLatestVersion>;

/** One advisory row; `withdrawn_at` non-null means it no longer applies. */
export const marketplaceAdvisory = z.object({
  id: z.number(),
  // The "namespace/name" listing ref exactly as the registry serves it — the
  // wire field consumers match installed plugins against.
  listing: z.string(),
  affected_versions: z.string(),
  severity: z.string(),
  summary: z.string(),
  created_at: z.string(),
  withdrawn_at: z.string().nullable(),
});
export type MarketplaceAdvisory = z.infer<typeof marketplaceAdvisory>;

/**
 * A plugin's full detail (`GET /api/marketplace/plugins/{ns}/{name}`): the
 * listing, its latest published version (`null` when nothing is published yet,
 * carrying the contained items), and the known version history.
 */
export const marketplacePluginDetail = z.object({
  namespace: z.string(),
  name: z.string(),
  display_name: z.string().nullable(),
  icon_url: z.string().nullable(),
  package: z.string(),
  description: z.string(),
  readme_md: z.string().nullable(),
  license: z.string().nullable(),
  homepage_url: z.string().nullable(),
  repository_url: z.string().nullable(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  trust_tier: z.string(),
  pricing: z.string(),
  downloads: z.number(),
  latest: marketplaceLatestVersion.nullable(),
  versions: z.array(marketplaceVersion),
});
export type MarketplacePluginDetail = z.infer<typeof marketplacePluginDetail>;

/**
 * One installed marketplace plugin as the local attribution store records it.
 * `latest` is the newest registry version (`null` when unknown); update
 * availability comes from the wire field `update_available` (computed
 * server-side as a PEP 440 comparison). `missing_upstream` flags a plugin the
 * registry no longer lists.
 */
export const marketplaceInstalledPlugin = z.object({
  ref: z.string(),
  version: z.string(),
  source: z.string(),
  installed_at: z.string(),
  latest: z.string().nullable(),
  update_available: z.boolean(),
  missing_upstream: z.boolean(),
});
export const marketplaceInstalled = z.array(marketplaceInstalledPlugin);
export type MarketplaceInstalledPlugin = z.infer<typeof marketplaceInstalledPlugin>;

/** The advisory state for installed plugins, with when it was last fetched. */
export const marketplaceAdvisories = z.object({
  advisories: z.array(marketplaceAdvisory),
  fetched_at: z.string(),
});

/** The registry's controlled category list, proxied through the skeleton. */
export const marketplaceCategories = z.array(z.string());

/**
 * The receipt of an install / update: what landed and at which version.
 * `notes` (env-selected items naming their activating env var) and any
 * non-critical `advisories` ride BOTH the install and update receipts. The wire
 * also carries `package`, `reload`, and `pip_output`, which the receipt does not
 * model — zod's default strip drops them; the UI renders the receipt, not the
 * raw install log.
 */
export const marketplaceInstallResult = z.object({
  ref: z.string(),
  version: z.string(),
  notes: z.array(z.string()),
  advisories: z.array(marketplaceAdvisory),
});
export type MarketplaceInstallResult = z.infer<typeof marketplaceInstallResult>;

/**
 * The receipt of an uninstall. `notes` carries operator warnings (e.g. a config
 * provider still selected by its env var); render them like the install
 * receipt's notes.
 */
export const marketplaceUninstallResult = z.object({
  ref: z.string(),
  uninstalled: z.literal(true),
  notes: z.array(z.string()),
});
export type MarketplaceUninstallResult = z.infer<typeof marketplaceUninstallResult>;

// Background tool-run schemas live in their own module; re-exported here so the
// shared fixture-validation contract resolves them by name alongside the rest.
export { toolRunSubmitResult, toolRunRecord, toolRunList } from './tool-runs';
