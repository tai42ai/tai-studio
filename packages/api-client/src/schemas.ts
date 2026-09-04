/**
 * One zod schema per consumed endpoint. These mirror the skeleton's router
 * response shapes exactly; a drift throws (ApiSchemaError) and the UI shows the
 * error state. JSON-schema-shaped fields are kept as permissive records — the
 * auto-form renderer interprets them at runtime.
 */
import { z } from 'zod';

/** An arbitrary JSON value (tool results, rendered payloads). */
export const jsonValue: z.ZodType = z.unknown();

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
 * The MEDIA content shape a direct tool run may return — fastmcp's serialized
 * `Image`/`Audio` MediaBlock (`{ type, data: <base64>, mimeType }`). One recognised
 * shape of the otherwise-arbitrary `runToolResult`, kept as its own schema so the
 * viewer detects media by parse, not by ad-hoc shape check.
 *
 * SECURITY: the refinement pins `mimeType` to its kind — `image` MUST be `image/*`,
 * `audio` MUST be `audio/*` — so a drifting/arbitrary mime fails the parse and is
 * never turned into a `data:` URI (a `File` MediaBlock's distinct `EmbeddedResource`
 * shape also fails here, by design).
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
 * The ADDITIVE per-tool native surface (`GET /api/tools/tags`). Distinct from the
 * flat `toolNames` contract (`GET /api/tools`, unchanged): each entry carries the
 * tool's read-only FastMCP `tags` — so the shared `ToolPicker` can group/filter its
 * options — plus `hidden`, the tool's OWN plugin-declared visibility (read from the
 * FastMCP `meta` under `tai42/hidden`; a tool that never declared it is not hidden).
 * The tool_meta overlay's tri-state override is merged on top client-side; this read
 * exposes only the declaration.
 *
 * `badges` are the tool's plugin-DECLARED capability labels — purely INFORMATIONAL
 * (e.g. `network`, `filesystem`), never a gate the server enforces. The overlay's
 * own badges are merged on top client-side; this read exposes only the declaration.
 */
export const toolTagEntry = z.object({
  name: z.string(),
  tags: z.array(z.string()),
  badges: z.array(z.string()),
  hidden: z.boolean(),
});
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
 * ACTIVE version's extension combos and `output_schema` the optional author-set
 * output JSON Schema. Categorization tags live in the tool_meta overlay
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

/** The full version body a preset stores under `kind="preset"`. */
export const presetBody = z.object({
  base_tool: z.string(),
  description: z.string(),
  fixed_kwargs: z.record(z.string(), z.unknown()),
  extensions: presetExtensions,
  output_schema: z.record(z.string(), z.unknown()).nullable(),
});
export type PresetBody = z.infer<typeof presetBody>;

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

// -- tool_meta (the organizational overlay) ----------------------------------

/**
 * One folder in the tool-organization tree (`tool_folders`). `parent_id` is `null`
 * for a root folder and otherwise the containing folder's `id`; nesting is endless
 * via the parent chain. Ids are UUID strings. A drift throws `ApiSchemaError`.
 */
export const folderRecord = z.object({
  id: z.string(),
  name: z.string(),
  parent_id: z.string().nullable(),
});
export type FolderRecord = z.infer<typeof folderRecord>;

/**
 * The organizational overlay for one tool, keyed by `tool_name`. `display_name`
 * overrides the rendered label (`display_name ?? name`); `folder_id` places the tool
 * in a folder (`null` = unfiled); `tags` is the user's editable categorization,
 * merged with the tool's read-only native tags by the UI; `badges` is the operator's
 * editable capability-label overlay, merged with the tool's read-only plugin-declared
 * badges by the UI (INFORMATIONAL, never an enforced gate); `hidden` is TRI-STATE —
 * `null` = defer to the plugin declaration, `true` = force hidden, `false` = force
 * visible. A drift throws `ApiSchemaError`.
 */
export const toolMetaRecord = z.object({
  tool_name: z.string(),
  display_name: z.string().nullable(),
  folder_id: z.string().nullable(),
  tags: z.array(z.string()),
  badges: z.array(z.string()),
  hidden: z.boolean().nullable(),
});
export type ToolMetaRecord = z.infer<typeof toolMetaRecord>;

/**
 * `GET /api/tool-meta` — the whole overlay in one read: the flat folder tree plus
 * every per-tool row. The UI builds the tree and merges the rows against the live
 * tool list client-side. A drift throws `ApiSchemaError`.
 */
export const toolMetaOverlay = z.object({
  folders: z.array(folderRecord),
  meta: z.array(toolMetaRecord),
});
export type ToolMetaOverlay = z.infer<typeof toolMetaOverlay>;

/** `DELETE /api/tool-meta/tools/{tool_name}` — the dropped overlay row (idempotent). */
export const toolMetaDeleted = z.object({ tool_name: z.string(), deleted: z.literal(true) });

/** `DELETE /api/tool-meta/folders/{folder_id}` — the removed empty folder. */
export const folderDeleted = z.object({ folder_id: z.string(), deleted: z.literal(true) });

// -- templates ---------------------------------------------------------------

export const templateNames = z.array(z.string());
export const templateDetail = z.object({ template: z.string(), schema: jsonSchema });
export const templateUploaded = z.object({ path: z.string(), uploaded: z.literal(true) });
export const templateDeleted = z.object({ path: z.string(), deleted: z.literal(true) });
export const templateDirDeleted = z.object({ path: z.string(), deleted: z.literal(true) });
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
export const workerKind = z.enum(['serve', 'backend']);
export type WorkerKind = z.infer<typeof workerKind>;

/** The lifecycle state a worker advertises in its presence value: `ready` once its
 * resync has converged, `resyncing` while a boot/reconnect resync runs, `recycling`
 * once it has begun a graceful self-exit. A drift throws `ApiSchemaError`. */
export const workerState = z.enum(['ready', 'resyncing', 'recycling']);
export type WorkerState = z.infer<typeof workerState>;

/** The last op a worker applied, stamped onto its presence row after the terminal
 * reply. `outcome` is the free op-outcome string; `at` is the ISO instant it landed. */
export const workerLastOp = z.object({
  op: z.string(),
  outcome: z.string(),
  at: z.string(),
});
export type WorkerLastOp = z.infer<typeof workerLastOp>;

/**
 * One live worker on the bus — a presence-census row. `name` is the stable slot
 * (`{kind}-{n}`) that doubles as a reload target; `generation` is the monotonic life
 * counter minted with the worker's claim; `kind` tells the two worker kinds apart;
 * `pid` is the process id. `joined_at`/`beat_at` are ISO instants (first-seen and last
 * heartbeat) for the cosmetic seen-since display; `state` is the advertised lifecycle
 * state; `stale` is SERVER-computed from the row's remaining presence TTL against the
 * bus cadence (a quiet row past the freshness bound — reconnecting or dead) and is the
 * only freshness signal a client reads, never a client-side threshold; `last_op` is the
 * worker's last applied op, or `null` before it has applied one.
 */
export const fleetWorker = z.object({
  name: z.string(),
  kind: workerKind,
  pid: z.number(),
  generation: z.number(),
  joined_at: z.string(),
  beat_at: z.string(),
  state: workerState,
  stale: z.boolean(),
  last_op: workerLastOp.nullable(),
});
export type FleetWorker = z.infer<typeof fleetWorker>;

/**
 * `GET /api/fleet/workers` — the live worker fleet from the bus presence census.
 * The census lists ALL subscribed workers (ASGI `serve` workers and backend-runtime
 * processes alike), not only backend workers. A census read that fails surfaces as a
 * loud 500, never a fabricated empty fleet.
 */
export const fleetWorkers = z.object({ workers: z.array(fleetWorker) });
export type FleetWorkers = z.infer<typeof fleetWorkers>;

/**
 * One worker's outcome within a fleet broadcast. `applied`/`failed` are terminal wire
 * replies from a subscriber; `missing`/`departed`/`timed_out` are publisher-computed
 * from the presence census (a silent worker never sends them); `resyncing`/`recycling`/
 * `stale` are the gap outcomes for a row that failed the ready+fresh gate — reported as
 * its own actual condition rather than dropped (`resyncing` converges on its resync,
 * `recycling` is departing, `stale` is a quiet row past the freshness bound carrying no
 * convergence promise).
 */
export const fleetOutcome = z.enum([
  'applied',
  'failed',
  'missing',
  'departed',
  'timed_out',
  'resyncing',
  'recycling',
  'stale',
]);
export type FleetOutcome = z.infer<typeof fleetOutcome>;

/**
 * One worker's result within a {@link fleetResult}. `payload` carries query-op data
 * (opaque to the UI); `error` carries a failed apply's message; `detail` carries the
 * publisher's report text for a computed gap outcome (`missing`/`departed`/`timed_out`/
 * `resyncing`/`recycling`/`stale`). A drift throws `ApiSchemaError`.
 */
export const fleetWorkerResult = z.object({
  name: z.string(),
  outcome: fleetOutcome,
  payload: jsonValue,
  error: z.string().nullable(),
  detail: z.string().nullable(),
});
export type FleetWorkerResult = z.infer<typeof fleetWorkerResult>;

/**
 * The awaited per-worker report of one fleet broadcast. Two honest shapes ride the
 * same schema. Reachable (`reachable: true`): `results` holds one entry per expected
 * worker (the serving worker's own entry included) plus the gap rows, so an unconfirmed
 * sibling is a visible `failed`/`missing`/`departed`/`timed_out`/`resyncing`/`recycling`/
 * `stale` entry, never a silent stale worker. Bus-unreachable (`reachable: false`): the
 * transport failed before any worker could reply, so `results` is empty and only `error`
 * is carried. This is the bare body of `POST /api/fleet/reload-config` and the single-MCP
 * reload; it is also the body the mode-wrapped {@link fleetReportFanout} carries under its
 * `fleet` / `unreachable` modes.
 */
export const fleetResult = z.object({
  op: z.string(),
  reachable: z.boolean(),
  local_only: z.boolean(),
  results: z.array(fleetWorkerResult),
  error: z.string().nullable(),
});
export type FleetResult = z.infer<typeof fleetResult>;

/**
 * `POST /api/fleet/reload-config` — soft-restart the fleet and report per-worker. The
 * serving worker applies its own reload first, then broadcasts; the returned report
 * names every worker's outcome. A failed local apply does not abort the broadcast, so
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
 *     bus-unreachable {@link fleetResult} (no worker list, only `error`).
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

/**
 * The back-reference a connector writes onto a manifest MCP entry to mark it
 * connector-owned: the connection and the provider sub-service that own it.
 * Hand-authored entries carry no `managed` marker.
 */
export const connectorRef = z.object({
  connection_id: z.string(),
  provider_id: z.string(),
  sub_service: z.string(),
});
export type ConnectorRef = z.infer<typeof connectorRef>;

/**
 * One entry of the live manifest's MCP section. Only the `managed` provenance
 * marker is typed — the connect/disconnect flows write it server-side to point a
 * connector-owned entry back at its connection, and the editor renders such
 * entries read-only. `.nullish()` because a hand-authored entry carries `null`
 * (present) or omits the key. Every other field (title, config, extensions) rides
 * through `.loose()` unmodeled so the config editor keeps editing the whole
 * entry — narrowing it to a typed subset would silently strip the fields it saves.
 */
export const manifestMcpEntry = z
  .object({
    managed: connectorRef.nullish(),
  })
  .loose();
export type ManifestMcpEntry = z.infer<typeof manifestMcpEntry>;

export const manifestView = z.object({
  mcp: z.array(manifestMcpEntry),
  user_tools: z.array(z.string()),
});

/**
 * One `!ENV ${VAR[:default]}` marker the manifest's MCP section carries
 * (`GET /api/manifest/mcp-env-refs`) — NAMES and BOOLEANS only, NEVER values.
 * `pointer` is the RFC 6901 json-pointer of the leaf (`/mcp/<i>/config/...`);
 * `has_default` is whether the marker carries a `:default`; `set` is whether the
 * var resolves in the EFFECTIVE env (the resolution truth the install-time
 * dangling refusal reads), so a var supplied by the deployment shows green, never
 * a false red. The checklist derives from THIS alone — no env value is ever fetched.
 */
export const mcpEnvRef = z.object({
  var: z.string(),
  pointer: z.string(),
  has_default: z.boolean(),
  set: z.boolean(),
});
export type McpEnvRef = z.infer<typeof mcpEnvRef>;
export const mcpEnvRefs = z.array(mcpEnvRef);
export type McpEnvRefs = z.infer<typeof mcpEnvRefs>;
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
 * the reload to the fleet. The response is the bare per-worker {@link fleetResult}
 * (the serving worker's re-probe rides its own `results` entry as the payload); there
 * is no local/workers split. A drift throws `ApiSchemaError`.
 */
export const mcpReloadResult = fleetResult;
export type McpReloadResult = z.infer<typeof mcpReloadResult>;

// -- sub-mcp -----------------------------------------------------------------

/**
 * One registered sub-MCP mount as it rides the registry list and the projection:
 * the tools it exposes and the transport it serves on. In `GET /api/sub-mcp` the
 * slug is the map key, so the mount value carries no slug; {@link subMcpEntry}
 * extends this with `slug` for the capability projection where mounts are a flat
 * list. `transport` is always present on the wire (the server defaults it to
 * `http`), so it is required — its absence is a drift, not a legal shape.
 */
export const subMcpMount = z.object({
  tools: z.array(z.string()),
  transport: z.string(),
});
export type SubMcpMount = z.infer<typeof subMcpMount>;

export const subMcpList = z.record(z.string(), subMcpMount);
export const subMcpCreated = z.object({
  slug: z.string(),
  tools: z.array(z.string()),
  transport: z.string(),
});
export const subMcpRemoved = z.object({ slug: z.string(), removed: z.literal(true) });

// -- config ------------------------------------------------------------------

export const envConfig = z.object({
  env: z.record(z.string(), z.string()),
  secret_keys: z.array(z.string()),
});
/**
 * `GET /api/config/mode` — the active config backend mode (`file` / `k8s`). The
 * skeleton emits only `config_mode`; `read_only` is a UI-side gate, tolerated-absent
 * and defaulting to `false` (writable) so a normal response never drifts, while a
 * genuinely read-only deployment can opt in by emitting `read_only: true`.
 */
export const configMode = z.object({
  config_mode: z.string(),
  read_only: z.boolean().default(false),
});

// -- settings profiles -------------------------------------------------------
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
  // Required and a real URL: the contract's `ProviderDescriptor.icon_url` runs
  // `check_web_url(schemes=("https",))`, which rejects an empty/relative value, so
  // an empty or malformed one here is drift and fails the parse loudly.
  icon_url: z.url(),
  kind: z.enum(['oauth', 'none']),
  origin: z.enum(['system', 'community']),
  category: z.string(),
  sub_services: z.array(subServiceView),
  config_fields: z.array(configFieldView),
});
export type ProviderView = z.infer<typeof providerView>;

/**
 * One `connector_category` grouping row served alongside the catalog: the UI's
 * label and sort key for the providers it groups, so the list can group, order,
 * and label providers by category without a second read.
 */
export const connectorCategoryView = z.object({
  id: z.string(),
  display_name: z.string(),
  sort_order: z.number(),
});
export type ConnectorCategoryView = z.infer<typeof connectorCategoryView>;

/**
 * `GET /api/connectors/providers` — the provider catalog: the providers plus the
 * category groupings the UI arranges them under. Reshaped from a bare provider
 * array so the category label/order surface rides the same read.
 */
export const providers = z.object({
  providers: z.array(providerView),
  categories: z.array(connectorCategoryView),
});
export type ProviderCatalogResponse = z.infer<typeof providers>;

export const connectionView = z.object({
  connection_id: z.string(),
  provider_id: z.string(),
  alias: z.string(),
  kind: z.enum(['oauth', 'none']),
  account_identity: z.string().nullable(),
  enabled_sub_services: z.array(z.string()),
  granted_scopes: z.array(z.string()),
  // Sub-services whose MCP server did not answer a live reachability probe.
  // Populated only on the single-connection GET (the list projection is
  // probe-free and always sends `[]`). Reachability is distinct from
  // `auth_health_state`: a healthy connection can still have a down sub-service.
  // Defaulted so a projection that omits it (an older worker mid-rollout) still
  // parses rather than false-failing the whole view.
  unreachable_sub_services: z.array(z.string()).default([]),
  auth_health_state: z.enum(['healthy', 'reconnect_required', 'refresh_failing']),
  created_at: z.string(),
});
export type ConnectionView = z.infer<typeof connectionView>;

export const connectionsList = z.object({
  items: z.array(connectionView),
  total: z.number(),
  // Count of connections whose `auth_health_state` is not healthy across the whole
  // set (independent of any filter/limit) — the attention-badge count. Optional:
  // no UI consumes it, and an older worker mid-rollout omits it.
  unhealthy: z.number().optional(),
});

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

/**
 * The page window every paged read door carries; `next_page` is null on the last
 * page. `truncated` is TRUE when the door had more matches than it would scan or
 * return under its cap — the UI must surface that LOUDLY, never a silent cut — and
 * false whenever the window is exhaustive.
 */
const pageWindow = {
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  next_page: z.number().nullable(),
  truncated: z.boolean(),
};

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
  // Interaction attribution, each additive and absent when unset. `recipient` is
  // the channel delivery address the question went to; `origin` is the run id of
  // the background tool run that asked; `audience` is the user_id the question is
  // addressed to. Display/binding data only, never an authorization axis; a
  // present non-string is malformed.
  recipient: z.string().optional(),
  origin: z.string().optional(),
  audience: z.string().optional(),
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

/**
 * A page of pending interactions from `GET /api/interactions?page=&pageSize=`. Each
 * item is the same record the stream's `interaction.add` frame carries. The pending
 * set is the paged base the tail-only stream applies live deltas over.
 */
export const interactionsPage = z.object({
  items: z.array(interaction),
  ...pageWindow,
});
export type InteractionsPage = z.infer<typeof interactionsPage>;

// -- channels ----------------------------------------------------------------
// The installed channel-plugin catalog: names registered via the manifest's
// channel modules. A deployment with none bound answers questions only in this
// inbox (the Studio default).

export const channels = z.object({
  channels: z.array(z.string()),
});
export type Channels = z.infer<typeof channels>;

// -- conversations -----------------------------------------------------------
// The cross-channel conversation monitor's READ side: the stored routing rows
// (the route picker) from `GET /api/conversations`, a route's threads from
// `GET /api/conversations/{route}/threads`, and one thread's transcript from
// `GET /api/conversations/{route}/transcript?thread_id=`. Timestamps are float
// epoch seconds, not ISO strings, and both paged doors carry the same window
// fields; the transcript adds the direction it was read in.

/** The inbound door a route is bound to: the authed API, or a channel medium. */
export const conversationDoor = z.enum(['api', 'channel']);
export type ConversationDoor = z.infer<typeof conversationDoor>;

/** What a route's turn runs: a registered agent, or a tool dispatch. */
export const conversationTargetKind = z.enum(['agent', 'tool']);
export type ConversationTargetKind = z.infer<typeof conversationTargetKind>;

/**
 * A route's default control mode (`initial_mode`) when a thread carries no
 * per-thread override: `agent` runs the target turn, `manual` suppresses it for an
 * operator to answer. The same value vocabulary as a per-thread mode override, but
 * a distinct concept (the route default vs. one thread's override).
 */
export const conversationMode = z.enum(['agent', 'manual']);
export type ConversationMode = z.infer<typeof conversationMode>;

/**
 * Where a record sits between intake and a terminal outcome. `failed` is the one
 * the monitor surfaces loudly; `shed` and `silent` are terminal by design and
 * never send.
 */
export const conversationDeliveryStatus = z.enum([
  'accepted',
  'pending_delivery',
  'provisional',
  'delivered',
  'failed',
  'shed',
  'silent',
]);
export type ConversationDeliveryStatus = z.infer<typeof conversationDeliveryStatus>;

/** The nature of a turn's outcome, orthogonal to where its delivery stands. */
export const conversationAnswerStatus = z.enum(['answered', 'error', 'silent']);
export type ConversationAnswerStatus = z.infer<typeof conversationAnswerStatus>;

/**
 * Who authored a record's outgoing side. `client` is the ordinary turn the flow
 * answered; `operator` is a message a human sent into the thread, whose text
 * rides `answer` (its `inbound_text` is empty).
 */
export const conversationRecordOrigin = z.enum(['client', 'operator']);
export type ConversationRecordOrigin = z.infer<typeof conversationRecordOrigin>;

/**
 * A stored routing row as a read door returns it, its `callback_secret` withheld.
 *
 * `initial_mode`, `turns_per_hour_override`, and `error_reply_text` carry defaults
 * because a stored row always returns them, while a hand-built stub/fixture may
 * omit them — the default keeps such a payload valid without inventing a field the
 * server never sends.
 */
export const conversationRoute = z.object({
  route_name: z.string(),
  door: conversationDoor,
  target_kind: conversationTargetKind,
  target_name: z.string(),
  payload_expr: z.string().nullable(),
  reply_expr: z.string().nullable(),
  initial_mode: conversationMode.default('agent'),
  execution_key: z.string(),
  channel: z.string().nullable(),
  our_identity: z.string().nullable(),
  callback_url: z.string().nullable(),
  turns_per_hour_override: z.number().int().nullable().default(null),
  error_reply_text: z.string().nullable().default(null),
  execution_key_fingerprint: z.string(),
});
export type ConversationRoute = z.infer<typeof conversationRoute>;

export const conversationRoutes = z.object({
  items: z.array(conversationRoute),
  total: z.number(),
});
export type ConversationRoutes = z.infer<typeof conversationRoutes>;

/**
 * The client-facing create/edit body for a conversation route — the wire model of
 * `tai42_contract.conversations.ConversationRouteCreate`. `POST
 * /api/conversations/{route_name}` is an UPSERT, so this one shape is both the
 * create AND the edit body. `route_name` rides the URL path; it is carried here too
 * (the door rejects a body whose `route_name` disagrees with the path).
 *
 * The contract's cross-field validators are mirrored where the form authors this
 * body: `payload_expr`/`reply_expr` are tool-only; an `api` door carries a
 * `callback_url` (and no channel identity); a `channel` door carries `channel` +
 * `our_identity` (and no callback). Sent explicitly (including `null`) so an edit
 * clears a field the operator emptied rather than leaving the stored value.
 */
export const conversationRouteCreate = z.object({
  route_name: z.string(),
  door: conversationDoor,
  target_kind: conversationTargetKind,
  target_name: z.string().min(1),
  payload_expr: z.string().nullable().default(null),
  reply_expr: z.string().nullable().default(null),
  initial_mode: conversationMode.default('agent'),
  execution_key: z.string().min(1),
  channel: z.string().nullable().default(null),
  our_identity: z.string().nullable().default(null),
  callback_url: z.string().nullable().default(null),
  turns_per_hour_override: z.number().int().positive().nullable().default(null),
  error_reply_text: z.string().min(1).max(2000).nullable().default(null),
});
export type ConversationRouteCreate = z.infer<typeof conversationRouteCreate>;

/**
 * The create/replace reply: whether THIS call created the row (vs. replaced an
 * existing one), the row itself (its `callback_secret` withheld), and the
 * `callback_secret` returned ONCE for an `api`-door row (`null` for a `channel`
 * row). The secret signs delivery callbacks and is never re-read from any door, so
 * a caller that needs it must capture it from this reply.
 */
export const conversationRouteWritten = z.object({
  created: z.boolean(),
  route_name: z.string(),
  route: conversationRoute,
  callback_secret: z.string().nullable(),
});
export type ConversationRouteWritten = z.infer<typeof conversationRouteWritten>;

/**
 * The delete reply: `removed` says whether THIS call removed the routing row (a
 * retryable reclamation of orphaned thread indexes answers `false` rather than a
 * 404).
 */
export const conversationRouteDeleted = z.object({
  removed: z.boolean(),
  route_name: z.string(),
});
export type ConversationRouteDeleted = z.infer<typeof conversationRouteDeleted>;

/**
 * One thread of a route, summarized from its newest record. A `thread_id` holds
 * an api-door address (`{principal}/{end user}`, percent-encoded), so it never
 * goes back into a URL as a path segment — the transcript door takes it as a
 * query value.
 */
export const conversationThread = z.object({
  thread_id: z.string(),
  client_address: z.string(),
  last_activity_at: z.number(),
  message_count: z.number(),
  last_delivery_status: conversationDeliveryStatus,
});
export type ConversationThread = z.infer<typeof conversationThread>;

export const conversationThreadsPage = z.object({
  items: z.array(conversationThread),
  ...pageWindow,
});
export type ConversationThreadsPage = z.infer<typeof conversationThreadsPage>;

/**
 * One exchange: the visitor's `inbound_text` — every record answers a message, so
 * both projections always carry it — and the agent's `answer`, plus where that
 * answer's delivery stands. The fields after `updated_at` are ADMIN ONLY —
 * the same door serves a caller-scoped projection that withholds them — so they
 * are optional here and absence means "not published to this reader".
 */
export const conversationMessage = z.object({
  message_id: z.string(),
  route_name: z.string(),
  door: conversationDoor,
  thread_id: z.string(),
  client_address: z.string(),
  caller_principal: z.string().nullable(),
  inbound_text: z.string(),
  answer_status: conversationAnswerStatus.nullable(),
  answer: z.string().nullable(),
  origin: conversationRecordOrigin,
  delivery_status: conversationDeliveryStatus,
  created_at: z.number(),
  updated_at: z.number(),
  channel: z.string().nullable().optional(),
  our_identity: z.string().nullable().optional(),
  provider_message_id: z.string().nullable().optional(),
  callback_url: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  outbound_message_ids: z.array(z.string()).optional(),
  attempts: z.number().optional(),
});
export type ConversationMessage = z.infer<typeof conversationMessage>;

/**
 * The direction a transcript page reads in. `asc` is the reading order (oldest
 * first); `desc` is the live-tail order, where page 1 is always the newest page
 * and paging forward walks BACKWARDS through the thread's history.
 */
export const transcriptOrder = z.enum(['asc', 'desc']);
export type TranscriptOrder = z.infer<typeof transcriptOrder>;

/** A transcript page, echoing the order it was read in. */
export const conversationTranscriptPage = z.object({
  items: z.array(conversationMessage),
  ...pageWindow,
  order: transcriptOrder,
});
export type ConversationTranscriptPage = z.infer<typeof conversationTranscriptPage>;

/**
 * A route-scoped message search (`GET /api/conversations/{route}/messages/search?q`):
 * every record on the route whose text matches `q`, across threads, newest first.
 * The record shape is the transcript's exactly, so a hit renders with the same
 * projection. `truncated` says the match set outran the door's scan cap — surfaced
 * loudly, never a silent cut.
 */
export const conversationMessageSearchPage = z.object({
  items: z.array(conversationMessage),
  ...pageWindow,
});
export type ConversationMessageSearchPage = z.infer<typeof conversationMessageSearchPage>;

/**
 * Who answers a thread's incoming messages: `agent` lets the flow reply on its
 * own; `manual` holds the flow back so a human answers. `source` says whether the
 * setting is the thread's own (`thread`) or inherited from its route (`route`).
 */
export const conversationThreadMode = z.enum(['agent', 'manual']);
export type ConversationThreadMode = z.infer<typeof conversationThreadMode>;

export const conversationThreadModeState = z.object({
  mode: conversationThreadMode,
  source: z.enum(['thread', 'route']),
});
export type ConversationThreadModeState = z.infer<typeof conversationThreadModeState>;

/** The receipt a thread-message write returns: the stored id and its thread. */
export const conversationThreadMessageSent = z.object({
  message_id: z.string(),
  thread_id: z.string(),
});
export type ConversationThreadMessageSent = z.infer<typeof conversationThreadMessageSent>;

// -- channel-web entry gate --------------------------------------------------
// The web channel's entry gate: a web route can be gated so its chat page is
// served only to a navigation carrying a live entry code. These four doors are
// keyed by the route's `our_identity`. A raw code exists only in flight (the
// mint reply); a listed code carries its hash id, never a raw value (none is
// stored).

/** One minted entry code as the gate read door lists it — its hash id, its
 * optional label, and when it was created / dies. Never a raw code. */
export const webEntryCode = z.object({
  code_id: z.string(),
  label: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string().nullable(),
});
export type WebEntryCode = z.infer<typeof webEntryCode>;

/** `GET /api/channels/web/gates/{identity}` — the gate flag and its live codes. */
export const webEntryGate = z.object({
  enabled: z.boolean(),
  codes: z.array(webEntryCode),
});
export type WebEntryGate = z.infer<typeof webEntryGate>;

/** `PUT /api/channels/web/gates/{identity}` — the gate flag after the write. */
export const webEntryGateState = z.object({ enabled: z.boolean() });
export type WebEntryGateState = z.infer<typeof webEntryGateState>;

/**
 * `POST /api/channels/web/gates/{identity}/codes` — a freshly minted code. The
 * raw `code` rides this reply ONCE (nothing else stores or lists it — a listed
 * code's raw value is unrecoverable by design); `code_id` is its hash id and
 * `expires_at` an ISO-8601 instant, or `null` for a code that never expires.
 */
export const webEntryCodeMinted = z.object({
  code: z.string(),
  code_id: z.string(),
  expires_at: z.string().nullable(),
});
export type WebEntryCodeMinted = z.infer<typeof webEntryCodeMinted>;

/** `DELETE /api/channels/web/gates/{identity}/codes/{code_id}` — the revoked code. */
export const webEntryCodeRevoked = z.object({ status: z.literal('revoked') });
export type WebEntryCodeRevoked = z.infer<typeof webEntryCodeRevoked>;

// -- notifications -----------------------------------------------------------
// The internal notifications sink: the messages the `notify_user` operation records
// with no channel, so they land only in the Studio inbox. Each record carries the
// server-minted id + timestamp; `recipient` is null when the message names none.
// The parity wave taught the sink to STORE the richer-send forms a notify carried —
// `media` (images/links shown WITH the message), `template` (a pre-approved
// out-of-window send), `options` (tappable option labels) — plus the `audience`
// identity the record is addressed to; the inbox renders them.

/**
 * A pre-approved channel template a notification carried, stored raw on the sink
 * record when the notify supplied one (server-side it is mutually exclusive with
 * `media`/`options`). `parameters` is the POSITIONAL list of body-text values
 * substituted into the template's placeholders in order; empty when it has none.
 */
export const channelTemplate = z.object({
  name: z.string(),
  language: z.string(),
  parameters: z.array(z.string()).default([]),
});
export type ChannelTemplate = z.infer<typeof channelTemplate>;

export const notification = z.object({
  id: z.string(),
  message: z.string(),
  // A channel DELIVERY address the message went to; null when the send named none.
  recipient: z.string().nullable(),
  // The IDENTITY (a user_id) whose in-app inbox the record is addressed to, distinct
  // from `recipient`. `.nullish()` accepts both an older record that predates the
  // field (key omitted) and a broadcast send (explicit null) — both parse to "none".
  audience: z.string().nullish(),
  // Display-only media stored WITH the message (images and/or links). Deliberately
  // LOOSE (`z.array(z.unknown())`), like the interactions frame: each item is
  // `safeParse`d per item by the renderer against `interactionMediaItem`, so one
  // malformed/hostile item is a loud per-item notice, never a whole-feed parse
  // failure that would silently vanish every other notification. `.nullish()` covers
  // an older record (key omitted) and a plain send (explicit null).
  media: z.array(z.unknown()).nullish(),
  // A pre-approved template the notify carried, parsed strictly: a drifting one is a
  // loud feed-level `ApiSchemaError`, consistent with the record contract.
  template: channelTemplate.nullish(),
  // Tappable option labels the notify offered; display-only in the operator inbox
  // (there is no conversation for the sink to enter). Strictly a string list.
  options: z.array(z.string()).nullish(),
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
          default_namespace_var: z.string().nullable(),
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

/** Mint reply `{ api_key, key_fingerprint }` narrowed to the raw `sk-…` key,
 *  returned once at creation and never again. */
export const createdApiKey = z
  .object({ api_key: z.string(), key_fingerprint: z.string() })
  .transform((minted) => minted.api_key);
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

/**
 * A sub-MCP mount the caller can reach, with the tools it exposes and its
 * transport. Shares the {@link subMcpMount} shape with the registry list, adding
 * the `slug` the projection carries inline (the list keys mounts by slug instead).
 */
export const subMcpEntry = subMcpMount.extend({ slug: z.string() });
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
  .loose();
export const scheduleList = z.array(scheduleItem);
export type ScheduleItem = z.infer<typeof scheduleItem>;

export const serverDateTime = z
  .object({
    utc: jsonValue,
    local: jsonValue.optional(),
    system: jsonValue.optional(),
  })
  .loose();

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
  inputPreview: jsonValue,
  outputPreview: jsonValue,
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
  spans: z.array(runSpan),
});
export type RunTrace = z.infer<typeof runTrace>;

// -- marketplace -------------------------------------------------------------

/**
 * The CLOSED HTTP-method enum fixed by the contract's RouteMethod, the one source
 * for every route-method field (declaration and install/preview responses alike):
 * a wire method the contract does not define fails loudly as drift rather than
 * passing through silently.
 */
export const routeMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export type RouteMethod = z.infer<typeof routeMethod>;

/**
 * How the plugin is delivered, derived server-side from whether its spec names a
 * package: `package` is pip-installed, `descriptor` (marketplace `source` `spec`)
 * installs nothing but the manifest entry. A CLOSED enum, so a wire value the
 * server does not derive fails loudly as drift.
 */
export const marketplaceDelivery = z.enum(['package', 'descriptor']);
export type MarketplaceDelivery = z.infer<typeof marketplaceDelivery>;

/**
 * The install-provenance vocabulary a listing/version resolves from: a pip index
 * (`pypi`), a git tag (`github`), or a descriptor yml (`spec`). CLOSED, so a wire
 * value outside it fails as drift.
 */
export const marketplaceSource = z.enum(['pypi', 'github', 'spec']);
export type MarketplaceSource = z.infer<typeof marketplaceSource>;

/**
 * One env var an item requires before install: its `name` and whether its value is
 * a `secret` (an OAuth client secret is; a client id or a plain marker var is not).
 * The install dialog seeds each toggle from `secret` and collects the missing ones.
 */
export const marketplaceRequiredEnvVar = z.object({ name: z.string(), secret: z.boolean() });
export type MarketplaceRequiredEnvVar = z.infer<typeof marketplaceRequiredEnvVar>;

/**
 * One HTTP route an item declares in its `tai-plugin.yml`: a `path` relative to
 * the item's mount base, the `methods` it answers, and whether it is served
 * `public` (without authentication). The absolute path an operator sees is
 * resolved from the base at install time.
 */
export const marketplaceRouteDecl = z.object({
  path: z.string(),
  methods: z.array(routeMethod),
  public: z.boolean(),
});
export type MarketplaceRouteDecl = z.infer<typeof marketplaceRouteDecl>;

/**
 * A route-carrying item's declared mount: the default `base` prefix the routes
 * hang off (an operator may remap it at install) and the `paths` it registers.
 */
export const marketplaceRoutesDecl = z.object({
  base: z.string(),
  paths: z.array(marketplaceRouteDecl),
});
export type MarketplaceRoutesDecl = z.infer<typeof marketplaceRoutesDecl>;

/**
 * One contained item of a marketplace plugin's published version: its kind
 * (tool / agent / extension / …), name, description, free-form tags, and the
 * logical group it belongs to (`null` when ungrouped). `routes` is present only
 * on a route-carrying item (a router or channel); absent/null on every other.
 * `required_env` is the env vars the item needs before install — but the REGISTRY's
 * plugin-detail body does NOT carry it per item: required-env is server-computed
 * (`required_env_for_spec`) and rides the install PREVIEW, never the listing detail,
 * so the registry OMITS it here and it parses as `undefined`. Optional (not
 * defaulted) so the type mirrors the wire; the authority the install dialog collects
 * from is the preview's `required_env`/`missing_env`, never this field.
 */
export const marketplaceItem = z.object({
  kind: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  group: z.string().nullable(),
  routes: marketplaceRoutesDecl.nullish(),
  required_env: z.array(marketplaceRequiredEnvVar).optional(),
});
export type MarketplaceItem = z.infer<typeof marketplaceItem>;

/**
 * One kind summary of a search row: an item kind, how many UNGROUPED items of
 * that kind the listing's latest published version carries, and their names.
 * The registry orders the array count DESC then kind ASC, and each entry's
 * `names` ASC; the UI renders in that order.
 */
export const marketplaceSearchKind = z.object({
  kind: z.string(),
  count: z.number(),
  names: z.array(z.string()),
});
export type MarketplaceSearchKind = z.infer<typeof marketplaceSearchKind>;

/**
 * One logical group of a search row: the group name and how many items the
 * listing's latest published version places in it. The registry orders the
 * array count DESC then name ASC; the UI renders in that order.
 */
export const marketplaceSearchGroup = z.object({
  name: z.string(),
  count: z.number(),
});
export type MarketplaceSearchGroup = z.infer<typeof marketplaceSearchGroup>;

/**
 * One listing-level search row (`GET /api/marketplace/search`). `ref` is the
 * "namespace/name" install target, so every row carries enough to link to its
 * plugin. `latest_version` is nullable defensively; the search relation only
 * emits listings with a published version. `kinds` summarizes that latest
 * version's UNGROUPED items; `groups` summarizes its logical groups (`[]` when
 * none). Both keys are always present.
 */
export const marketplaceSearchRow = z.object({
  ref: z.string(),
  namespace: z.string(),
  name: z.string(),
  display_name: z.string().nullable(),
  icon_url: z.string().nullable(),
  // Null for a descriptor listing (`source` `spec`): it names no package.
  package: z.string().nullable(),
  description: z.string(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  trust_tier: z.string(),
  pricing: z.string(),
  // A display-only premium flag: a badge, never a payment surface. Nullable
  // + optional: an older registry omits it, and it is absent on non-premium rows.
  premium: z.boolean().nullish(),
  latest_version: z.string().nullable(),
  downloads: z.number(),
  updated_at: z.string(),
  kinds: z.array(marketplaceSearchKind),
  groups: z.array(marketplaceSearchGroup),
});
export type MarketplaceSearchRow = z.infer<typeof marketplaceSearchRow>;

/**
 * One page of listing rows. The wire carries no next-page field — has-next is
 * COMPUTED: `page * page_size < total`.
 */
export const marketplaceSearchPage = z.object({
  listings: z.array(marketplaceSearchRow),
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
 * (with the `marketplaceVersion` lifecycle fields) and the items it contains. The
 * registry's detail body carries NO per-version `delivery` field — delivery is
 * server-computed from whether the spec names a package, and the detail surface
 * derives it from the listing's `package` (null ⇒ `descriptor`, else `package`).
 * Env to collect comes from the install preview (`required_env` / `missing_env`),
 * never from these items.
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
  // Null for a descriptor listing (`source` `spec`): it names no package.
  package: z.string().nullable(),
  // The install-provenance vocabulary (`pypi` / `github` / `spec`). Nullish: an
  // older registry omits it, and a listing with nothing published carries none.
  source: marketplaceSource.nullish(),
  description: z.string(),
  readme_md: z.string().nullable(),
  license: z.string().nullable(),
  homepage_url: z.string().nullable(),
  repository_url: z.string().nullable(),
  // The marketplace-stored docs-site URL: the store is the source, the UI a
  // link. Nullable + optional: absent on a listing with no published docs.
  docs_url: z.string().nullish(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  trust_tier: z.string(),
  pricing: z.string(),
  // A display-only premium flag: a badge, never a payment surface.
  premium: z.boolean().nullish(),
  downloads: z.number(),
  latest: marketplaceLatestVersion.nullable(),
  versions: z.array(marketplaceVersion),
});
export type MarketplacePluginDetail = z.infer<typeof marketplacePluginDetail>;

/**
 * One installed plugin's compat verdict against the RUNNING tai42-contract:
 * `compatible` / `incompatible` per its declared contract range, `unknown` when
 * no verdict could be computed. `reason` is the human-readable explanation of a
 * non-`compatible` verdict, `null` when compatible. CLOSED (`.strict()`): the
 * server is built against exactly this shape, so an unknown key is drift and
 * throws instead of being stripped.
 */
export const marketplaceInstalledCompat = z
  .object({
    status: z.enum(['compatible', 'incompatible', 'unknown']),
    reason: z.string().nullable(),
  })
  .strict();
export type MarketplaceInstalledCompat = z.infer<typeof marketplaceInstalledCompat>;

/**
 * One installed marketplace plugin as the local attribution store records it.
 * `latest` is the newest registry version (`null` when unknown);
 * `update_available` advertises only a newer COMPATIBLE version, and
 * `incompatible_newer` names the newest version blocked by the running
 * contract (`null` when none), so "an update exists but needs a newer core" is
 * visible. `missing_upstream` flags a plugin the registry no longer lists.
 * `compat` is the row's verdict against the running contract. CLOSED, like
 * every shape of the installed listing.
 */
export const marketplaceInstalledPlugin = z
  .object({
    ref: z.string(),
    version: z.string(),
    source: z.string(),
    // How the row was delivered: `package` for a pip-installed plugin, `descriptor`
    // for a descriptor-only plugin whose stored spec names no package.
    delivery: marketplaceDelivery,
    installed_at: z.string(),
    latest: z.string().nullable(),
    update_available: z.boolean(),
    incompatible_newer: z.string().nullable(),
    missing_upstream: z.boolean(),
    compat: marketplaceInstalledCompat,
    // The `{kind, name}` of every item this plugin's stored spec provides
    // (local truth). The McpTab joins the mcp-server item names against the
    // manifest's mcp-entry titles to render an installer-written entry read-only.
    items: z.array(marketplaceItem.pick({ kind: true, name: true })),
    // The persisted `{item_name: base}` mount this plugin is installed at (local
    // truth; `{}` means every item at its declared base). Studio seeds the update
    // flow and renders routes at the ACTUAL mounted base from this.
    route_mounts: z.record(z.string(), z.string()),
  })
  .strict();
export type MarketplaceInstalledPlugin = z.infer<typeof marketplaceInstalledPlugin>;

/** One plugin the boot pass quarantined instead of loading, with why. CLOSED. */
export const marketplaceQuarantinedPlugin = z
  .object({
    name: z.string(),
    reason: z.string(),
  })
  .strict();
export type MarketplaceQuarantinedPlugin = z.infer<typeof marketplaceQuarantinedPlugin>;

/**
 * The installed inventory (`GET /api/marketplace/installed`): the attributed
 * rows plus every plugin the boot pass quarantined instead of loading. CLOSED.
 */
export const marketplaceInstalled = z
  .object({
    installed: z.array(marketplaceInstalledPlugin),
    quarantined: z.array(marketplaceQuarantinedPlugin),
  })
  .strict();
export type MarketplaceInstalled = z.infer<typeof marketplaceInstalled>;

/**
 * One per-plugin outcome of `POST /api/marketplace/upgrade-all`: `upgraded`,
 * already `up-to-date`, `no-compatible-version` in the registry, or `failed`;
 * `detail` always carries the human-readable specifics. CLOSED.
 */
export const marketplaceUpgradeAllRow = z
  .object({
    ref: z.string(),
    outcome: z.enum(['upgraded', 'up-to-date', 'no-compatible-version', 'failed']),
    detail: z.string(),
  })
  .strict();
export type MarketplaceUpgradeAllRow = z.infer<typeof marketplaceUpgradeAllRow>;

/** The whole upgrade-all readout: one outcome row per installed plugin. CLOSED. */
export const marketplaceUpgradeAllResult = z
  .object({
    results: z.array(marketplaceUpgradeAllRow),
  })
  .strict();
export type MarketplaceUpgradeAllResult = z.infer<typeof marketplaceUpgradeAllResult>;

/** The advisory state for installed plugins, with when it was last fetched. */
export const marketplaceAdvisories = z.object({
  advisories: z.array(marketplaceAdvisory),
  fetched_at: z.string(),
});

/** The registry's controlled category list, proxied through the skeleton. */
export const marketplaceCategories = z.array(z.string());

/** The registry's controlled item-kind list, proxied through the skeleton. */
export const marketplaceKinds = z.array(z.string());

/**
 * One route the install / update actually mounted: the item that owns it, the
 * absolute `full_path` it now answers, the `methods`, and whether it is served
 * `public`. The receipt lists these so the operator sees what was opened where.
 */
export const marketplaceMountedRoute = z.object({
  item: z.string(),
  full_path: z.string(),
  methods: z.array(routeMethod),
  public: z.boolean(),
});
export type MarketplaceMountedRoute = z.infer<typeof marketplaceMountedRoute>;

/**
 * The receipt of an install / update: what landed and at which version.
 * `notes` (env-selected items naming their activating env var) and any
 * non-critical `advisories` ride BOTH the install and update receipts.
 * `routes` is the mounted-route list — empty for a plugin that registers none.
 * The wire also carries `package`, `reload`, and `pip_output`, which the receipt
 * does not model — zod's default strip drops them; the UI renders the receipt,
 * not the raw install log.
 */
export const marketplaceInstallResult = z.object({
  ref: z.string(),
  version: z.string(),
  notes: z.array(z.string()),
  advisories: z.array(marketplaceAdvisory),
  routes: z.array(marketplaceMountedRoute),
});
export type MarketplaceInstallResult = z.infer<typeof marketplaceInstallResult>;

/** One resolved route in an install preview: the declared `path`, its resolved
 * absolute `full_path`, the `methods`, and whether it is `public`. */
export const marketplacePreviewRoute = z.object({
  path: z.string(),
  full_path: z.string(),
  methods: z.array(routeMethod),
  public: z.boolean(),
});
export type MarketplacePreviewRoute = z.infer<typeof marketplacePreviewRoute>;

/** One route-carrying item in an install preview: its resolved `base` (the
 * override or the default), the `default_base` it declares, and the routes that
 * mount under it. */
export const marketplacePreviewItem = z.object({
  item: z.string(),
  kind: z.string(),
  base: z.string(),
  default_base: z.string(),
  routes: z.array(marketplacePreviewRoute),
});
export type MarketplacePreviewItem = z.infer<typeof marketplacePreviewItem>;

/** One collision the preview found: a route whose resolved shape+method clashes
 * with an already-owned route. `conflict_owner` is `core` or `plugin:<ref>`; the
 * remedy is to remap the item's base. */
export const marketplacePreviewCollision = z.object({
  item: z.string(),
  full_path: z.string(),
  methods: z.array(routeMethod),
  conflict_owner: z.string(),
  conflict_path: z.string(),
});
export type MarketplacePreviewCollision = z.infer<typeof marketplacePreviewCollision>;

/** One public route the operator is asked to accept: served WITHOUT
 * authentication once installed. */
export const marketplacePreviewPublicRoute = z.object({
  item: z.string(),
  full_path: z.string(),
  methods: z.array(routeMethod),
});
export type MarketplacePreviewPublicRoute = z.infer<typeof marketplacePreviewPublicRoute>;

/**
 * The install preview (`POST /api/marketplace/install/preview`): the resolved
 * routes per item with any base overrides applied, the collisions against the
 * live registry, the public routes requiring acceptance, and whether acceptance
 * is required at all. `new_public_routes` narrows to rows not already approved
 * (the update case); on a fresh install it equals `public_routes`.
 *
 * `required_env` is every env var the spec requires with its derived secret-ness;
 * `missing_env` is the bare names not already present in the env store union
 * process env (server-computed — the ONE authority the dialog collects), and
 * `delivery` is the one word the surface shows (`package` / `descriptor`).
 */
export const marketplaceInstallPreview = z.object({
  ref: z.string(),
  version: z.string(),
  items: z.array(marketplacePreviewItem),
  collisions: z.array(marketplacePreviewCollision),
  public_routes: z.array(marketplacePreviewPublicRoute),
  new_public_routes: z.array(marketplacePreviewPublicRoute),
  requires_public_acceptance: z.boolean(),
  required_env: z.array(marketplaceRequiredEnvVar),
  missing_env: z.array(z.string()),
  delivery: marketplaceDelivery,
});
export type MarketplaceInstallPreview = z.infer<typeof marketplaceInstallPreview>;

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
