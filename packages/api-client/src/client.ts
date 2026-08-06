/**
 * The typed client: one method per endpoint, each validating
 * its response against the matching zod schema. Server state flows through
 * TanStack Query in the features; this client is a plain typed transport with no
 * caching of its own.
 */
import {
  type ApiConfig,
  type RequestOptions,
  apiDownload,
  apiRequest,
  apiText,
  encodeSegment,
  extractError,
  isUnsafePathSegment,
} from './http';
import { ApiError, ApiLoginFailedError, ApiUnauthorizedError } from './errors';
import { readSseFrames, sseOpenToken } from './sse';
import { agentList, streamAgentRun, streamAuthoredAgentRun } from './agents';
import { getToolRun, listToolRuns, submitToolRun, type SubmitToolRunArgs } from './tool-runs';
import * as s from './schemas';

export interface RunToolArgs {
  readonly tool: string;
  readonly kwargs?: Record<string, unknown>;
}

export interface StartConnectArgs {
  readonly provider_id: string;
  readonly alias: string;
  readonly enabled_sub_services: string[];
  readonly config_values?: Record<string, string>;
  readonly return_url?: string;
}

/** Body for creating or editing an API key (POST/PUT `/api/auth/api-keys`). */
export interface ApiKeyBody {
  readonly user_id: string;
  readonly description: string;
  readonly scopes: string[];
  // `null` is an explicit clear on edit (PATCH-style PUT): absent preserves the
  // stored policy data, `null` wipes it. Create never sends `null`.
  readonly policy_data?: Record<string, unknown> | null;
  readonly condition?: string | null;
  readonly condition_id?: string | null;
  readonly condition_kwargs?: Record<string, unknown> | null;
}

/**
 * Body for one-time claim-link creation (POST `/api/auth/claim-links`). The
 * `api_key` is a raw key the caller holds (the just-minted key, client-side
 * exactly once); `ttl_seconds` optionally overrides the default lifetime (the
 * server caps it at its ceiling).
 */
export interface ClaimLinkBody {
  readonly api_key: string;
  readonly ttl_seconds?: number | null;
}

/**
 * Body for the fail-closed jq guard (POST `/api/auth/validate-condition`).
 * `condition` (inline jq) and `condition_id` (named template) are mutually
 * exclusive — send exactly one. `sample_context` is a `JqAuthContext`-shaped
 * sample; when present the guard also evaluates the condition against it and
 * returns the boolean `result` (else `result` is `null`).
 */
export interface ValidateConditionBody {
  readonly condition?: string;
  readonly condition_id?: string;
  readonly condition_kwargs?: Record<string, unknown>;
  readonly sample_context?: Record<string, unknown>;
}

/**
 * Body for binding a webhook verifier to a topic
 * (PUT `/api/hooks/topics/{topic}/verifier`). `verifier` is a registered verifier
 * NAME, resolved against the live registry at bind time (an unknown name is a loud
 * 400). `config` is that verifier's config object — it carries a `secret_env` name,
 * never a secret value — and defaults to `{}` when omitted.
 */
export interface TopicVerifierBody {
  readonly verifier: string;
  readonly config?: Record<string, unknown>;
}

/**
 * Body for minting a trigger link (POST `/api/hooks/trigger-links`). `ttl_seconds`
 * is REQUIRED and nullable — a positive int is a timed link, `null` is a permanent
 * link (`0`/negative is a loud server 400); it is always sent EXPLICITLY (a dropped
 * key 400s server-side). `name` is optional (the server generates one when omitted);
 * `tool_kwargs` is the optional per-link params merged last into every fire.
 */
export interface TriggerLinkCreateBody {
  readonly topic: string;
  readonly name?: string;
  readonly execution_key: string;
  // The link is a token door; this is its only auth knob (token → token+api_key).
  readonly require_api_key: boolean;
  readonly ttl_seconds: number | null;
  readonly tool_kwargs?: Record<string, unknown> | null;
}

/** Body for adding a URL to a scope (POST `/api/auth/scopes`). */
export interface AddUrlToScopeBody {
  readonly scope_id: string;
  readonly url: string;
  readonly pattern?: string;
}

/**
 * Body for creating a role (POST `/api/auth/roles`). `base_tier` is the security
 * tier the role inherits (`editor`/`viewer` — `admin` is reserved); its jq is
 * resolved server-side, never authored here. `grants` is the editable per-tag
 * access-level map (feature-group tag → `none`/`read`/`write`); it defaults to
 * empty (every group `none`, fail-closed) when omitted.
 */
export interface RoleCreateBody {
  readonly name: string;
  readonly description?: string;
  readonly base_tier: string;
  readonly grants?: Record<string, s.GrantLevel>;
}

/**
 * Body for editing a role (PUT `/api/auth/roles/{name}`). Both fields are
 * omit-means-KEEP: an absent `grants` preserves the stored map (never a silent
 * wipe), an absent `description` preserves the stored description. The base-tier jq
 * is seed-fixed and not editable here.
 */
export interface RoleUpdateBody {
  readonly grants?: Record<string, s.GrantLevel>;
  readonly description?: string;
}

/**
 * Body for pinning a route public (POST `/api/auth/public-routes`). `pattern` is an
 * optional regex the AC verifier full-matches request paths against, mapping every
 * match to the `url` key (so a mount's whole subtree can be pinned in one call).
 */
export interface PinRoutePublicBody {
  readonly url: string;
  readonly pattern?: string;
}

/**
 * Body for creating a preset (POST `/api/presets`). `description` is the bound
 * tool's LLM-facing docstring — REQUIRED non-empty on every create path (the door
 * rejects an empty one with a 422); it is never the tool_meta `display_name`.
 * `extensions` is the combos list — the create flow OMITS it when there are no
 * combos (the route rejects an explicit `extensions: []`). `output_schema` is the
 * optional author-set output JSON Schema. Each combo element is a bare extension
 * name or a `{ name, config }` mapping. Categorization tags live in the tool_meta
 * overlay, written after a successful create — never in this body.
 */
export interface CreatePresetBody {
  readonly name: string;
  readonly base_tool: string;
  readonly description: string;
  readonly fixed_kwargs?: Record<string, unknown>;
  readonly extensions?: readonly s.PresetExtensionElement[][];
  readonly output_schema?: Record<string, unknown> | null;
}

/**
 * Body for saving a new preset version (POST `/api/presets/{name}/versions`). At
 * least one field must be provided (an empty body is a loud 400). Each field's
 * sentinel is uniform: omitted carries the active version's value forward; an
 * explicit `[]` clears `extensions`, and an explicit `null` clears `output_schema`.
 * `description` carries forward when omitted; an explicit non-empty string sets it
 * (the API rejects an explicit empty one). Categorization tags are no longer a
 * version field — they live in the tool_meta overlay.
 */
export interface SavePresetVersionBody {
  readonly fixed_kwargs?: Record<string, unknown>;
  readonly description?: string;
  readonly extensions?: readonly s.PresetExtensionElement[][];
  readonly output_schema?: Record<string, unknown> | null;
}

/**
 * Body for the dry-run validate door (POST `/api/presets/validate`). `name` is
 * required and selects the verdict mode server-side: CREATE when no preset named
 * `name` exists (then `base_tool` is required), VERSION when one does (the version
 * fields are read under save-version semantics). The draft is sent exactly as the
 * matching write would send it.
 */
export interface ValidatePresetBody {
  readonly name: string;
  readonly base_tool?: string;
  readonly description?: string;
  readonly fixed_kwargs?: Record<string, unknown>;
  readonly extensions?: readonly s.PresetExtensionElement[][];
  readonly output_schema?: Record<string, unknown> | null;
}

/**
 * Merge-patch body for a tool's overlay row (PATCH
 * `/api/tool-meta/tools/{tool_name}`). Only the fields PRESENT are written; a
 * present-null clears (`hidden: null` writes the tri-state "defer to the plugin
 * declaration" state, `display_name: null` clears the label, `folder_id: null`
 * unfiles); a present `tags` array replaces the whole set. Absent fields are left
 * untouched — there is no full-row replace, so a display-name+tags editor sends
 * ONLY those two keys with no risk to `folder_id`/`hidden`. At least one field must
 * be present. A blank/whitespace-only `display_name` is rejected by the API (422) —
 * callers map an emptied label to `null`, never `""`.
 */
export interface ToolMetaPatch {
  readonly display_name?: string | null;
  readonly folder_id?: string | null;
  readonly tags?: readonly string[];
  readonly hidden?: boolean | null;
}

/**
 * Body for a storage upload (POST `/api/storage/resources`). Exactly ONE of
 * `content_text` (stored verbatim) or `content_base64` (a base64 string decoded to
 * bytes) supplies the content for `id`; uploading an existing id overwrites it
 * (provider passthrough semantics).
 */
export interface StorageUploadBody {
  readonly id: string;
  readonly content_text?: string;
  readonly content_base64?: string;
}

/** The observability-metrics window + bucket size (GET query params). */
export interface MetricsQuery {
  readonly from?: string;
  readonly to?: string;
  readonly granularity?: string;
}

/**
 * The observability runs filter. List/dict-valued params (`tags`) are
 * JSON-encoded into the query string; scalars are sent verbatim. Shared by
 * `listRuns` and the `exportRuns` download.
 */
export interface RunsQuery {
  readonly from?: string;
  readonly to?: string;
  readonly tags?: string[];
  readonly status?: 'error' | 'success';
  readonly minCost?: number;
  readonly maxCost?: number;
  readonly minTokens?: number;
  readonly maxTokens?: number;
  readonly minLatencyMs?: number;
  readonly maxLatencyMs?: number;
  readonly sort?: string;
  readonly dir?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * The marketplace search filter (GET `/api/marketplace/search` query params).
 * `tags` is sent as REPEATED `tags` params, one per value; `page` is supplied
 * per-request by the infinite query, never from the URL. `tier`, `namespace`,
 * `contract`, and `page_size` are accepted by the route but the v1 UI sends none
 * of them (every v1 row is official/tai42; the page size stays the server
 * default) — they exist for contract completeness.
 */
export interface MarketplaceSearchQuery {
  readonly q?: string;
  readonly kind?: string;
  readonly category?: string;
  readonly tags?: string[];
  readonly namespace?: string;
  readonly tier?: string;
  readonly contract?: string;
  readonly sort?: 'downloads' | 'updated' | 'name' | 'relevance';
  readonly page?: number;
  readonly page_size?: number;
}

/** Body for installing / updating a plugin. `ref` is `namespace/name`. */
export interface MarketplaceInstallBody {
  readonly ref: string;
  readonly version?: string;
}

/** Body for uninstalling a plugin. */
export interface MarketplaceUninstallBody {
  readonly ref: string;
}

/**
 * Encode a possibly-nested storage id / directory path for use in a URL path,
 * percent-encoding each segment while preserving the `/` separators. A storage id
 * can be a nested path (e.g. `a/b c.txt`); encoding each segment independently keeps
 * the slashes structural and escapes everything else (spaces, `#`, `?`, …).
 *
 * Dot segments (`.`, `..`), empty segments (a leading/trailing/doubled `/`, or an
 * empty id) are REJECTED loudly rather than encoded: the browser's WHATWG URL parser
 * removes dot-segments from a relative request path before it is sent — collapsing
 * `..` even when percent-encoded — so such an id can never be faithfully transmitted.
 * Left to encode, it would silently retarget the request at an unrelated same-origin
 * route. The server enforces the same relative-path rule; failing fast here keeps a
 * malformed id from ever leaving the client.
 */
function encodePath(id: string): string {
  const segments = id.split('/');
  if (segments.some(isUnsafePathSegment)) {
    throw new Error("storage path must be a relative path with no empty, '.', or '..' segment");
  }
  return segments.map(encodeURIComponent).join('/');
}

/** Flatten a `RunsQuery` to transport params, JSON-encoding the `tags` list. */
function runsQueryToParams(query: RunsQuery): Required<RequestOptions>['query'] {
  return {
    from: query.from,
    to: query.to,
    tags: query.tags === undefined ? undefined : JSON.stringify(query.tags),
    status: query.status,
    minCost: query.minCost,
    maxCost: query.maxCost,
    minTokens: query.minTokens,
    maxTokens: query.maxTokens,
    minLatencyMs: query.minLatencyMs,
    maxLatencyMs: query.maxLatencyMs,
    sort: query.sort,
    dir: query.dir,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * Whether a login-method target is a safe same-origin relative API path. The
 * login screen is the one page where a misconfigured/compromised manifest could
 * redirect CREDENTIALS off-origin, so a `submit_path`/`href` MUST start `/api/`
 * — anything else (absolute URL, protocol-relative `//host`, missing prefix) is
 * rejected. The `/api/` prefix already excludes `//`-prefixed values; the
 * explicit double-slash clause is kept for readability.
 */
export function isSafeApiPath(path: string): boolean {
  return path.startsWith('/api/') && !path.startsWith('//');
}

/**
 * Map a transport error from a login submission onto an `ApiLoginFailedError`
 * (rendered inline on the login page) or rethrow it unchanged (5xx, schema
 * drift, network — the page's generic failure branch surfaces it loudly).
 *
 * A transport 401 arrives as `ApiUnauthorizedError` before any body is read, so
 * its message is generic by construction; the domain 4xx statuses carry the
 * server's informative envelope text (rate-limit, bootstrap-already-initialized,
 * password-policy, or the claim exchange's uniform "unknown or already used"
 * 404) straight through to the inline surface.
 */
function asLoginError(error: unknown): never {
  if (error instanceof ApiUnauthorizedError) {
    throw new ApiLoginFailedError('Sign-in failed — check your credentials.', 401);
  }
  if (
    error instanceof ApiError &&
    (error.status === 400 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 409 ||
      error.status === 422 ||
      error.status === 429)
  ) {
    throw new ApiLoginFailedError(error.message, error.status);
  }
  throw error;
}

export function createApiClient(config: ApiConfig) {
  const req = <S extends Parameters<typeof apiRequest>[2]>(
    path: string,
    schema: S,
    options?: Parameters<typeof apiRequest>[3],
  ) => apiRequest(config, path, schema, options);

  return {
    // The configured API base — the exact `baseUrl` this client was constructed
    // with (`''` for a same-origin deployment). Read-only: features that must
    // compose an ABSOLUTE API URL (a QR-encoded public path the API origin must
    // receive, not the SPA origin) read it instead of assuming same-origin. The
    // transport itself still joins it per request; this only surfaces the value.
    baseUrl: config.baseUrl ?? '',

    // -- tools ---------------------------------------------------------------
    listTools: (signal?: AbortSignal) => req('/api/tools', s.toolNames, { signal }),
    getToolSchema: (name: string, signal?: AbortSignal) =>
      req(`/api/tools/${encodeSegment(name)}/schema`, s.toolSchema, { signal }),
    getAllToolSchemas: (signal?: AbortSignal) =>
      req('/api/tools-schema', s.allToolSchemas, { signal }),
    runTool: (args: RunToolArgs, signal?: AbortSignal) =>
      req('/api/run-tool', s.runToolResult, {
        method: 'POST',
        // The backend's `/api/run-tool` door reads `{tool_name, arguments}` (the
        // shape `read_tool_call` enforces and the background `/api/tool-runs`
        // submit already sends). The SPA keeps `tool`/`kwargs` as its ergonomic
        // arg names; map them onto the wire fields here.
        body: { tool_name: args.tool, arguments: args.kwargs ?? {} },
        signal,
      }),

    // -- background tool runs ------------------------------------------------
    submitToolRun: (args: SubmitToolRunArgs, signal?: AbortSignal) =>
      submitToolRun(config, args, signal),
    getToolRun: (runId: string, signal?: AbortSignal) => getToolRun(config, runId, signal),
    listToolRuns: (toolName: string, signal?: AbortSignal) =>
      listToolRuns(config, toolName, signal),

    // -- tool tags (additive map feeding the ToolPicker tag grouping) --------
    listToolTags: (signal?: AbortSignal) => req('/api/tools/tags', s.toolTags, { signal }),

    // -- presets -------------------------------------------------------------
    // Every preset is store-backed and versioned; the list is the single
    // management population (the presets plus the conflicted quarantined rows).
    listPresets: (signal?: AbortSignal) => req('/api/presets', s.presetList, { signal }),
    createPreset: (body: CreatePresetBody) =>
      req('/api/presets', s.presetRecord, { method: 'POST', body }),
    getPreset: (name: string, signal?: AbortSignal) =>
      req(`/api/presets/${encodeSegment(name)}`, s.presetDetail, { signal }),
    listPresetVersions: (name: string, signal?: AbortSignal) =>
      req(`/api/presets/${encodeSegment(name)}/versions`, s.presetVersionList, { signal }),
    getPresetVersion: (name: string, version: number, signal?: AbortSignal) =>
      req(
        `/api/presets/${encodeSegment(name)}/versions/${encodeSegment(version)}`,
        s.presetVersion,
        { signal },
      ),
    savePresetVersion: (name: string, body: SavePresetVersionBody) =>
      req(`/api/presets/${encodeSegment(name)}/versions`, s.presetVersion, {
        method: 'POST',
        body,
      }),
    rollbackPreset: (name: string, version: number) =>
      req(`/api/presets/${encodeSegment(name)}/rollback`, s.presetRollback, {
        method: 'POST',
        body: { version },
      }),
    deletePreset: (name: string) =>
      req(`/api/presets/${encodeSegment(name)}`, s.presetDeleted, { method: 'DELETE' }),
    renamePreset: (name: string, newName: string) =>
      req(`/api/presets/${encodeSegment(name)}/rename`, s.presetRenamed, {
        method: 'POST',
        body: { new_name: newName },
      }),
    // The presets whose active composition names this one as a tool — the referees
    // a rename would strand. A rename preflight reads this to warn before the 409.
    getPresetReferees: (name: string, signal?: AbortSignal) =>
      req(`/api/presets/${encodeSegment(name)}/referees`, s.presetReferees, { signal }),
    // The dry-run verdict for a draft (create OR version, mode-resolved server-side):
    // `valid` plus the server's verbatim `error` message. Both verdicts are HTTP 200.
    validatePreset: (body: ValidatePresetBody) =>
      req('/api/presets/validate', s.presetValidation, { method: 'POST', body }),
    // Replace one version's `tags` annotation — labels on an immutable body, so no
    // rebind. Returns the re-annotated identity + new tag list.
    setPresetVersionTags: (name: string, version: number, tags: readonly string[]) =>
      req(
        `/api/presets/${encodeSegment(name)}/versions/${encodeSegment(version)}/tags`,
        s.presetVersionTags,
        { method: 'PUT', body: { tags } },
      ),

    // -- tool_meta (the organizational overlay) ------------------------------
    // The folder tree + per-tool overlay rows in one read; the features merge the
    // rows against the live tool list and native tags client-side.
    listToolMeta: (signal?: AbortSignal) => req('/api/tool-meta', s.toolMetaOverlay, { signal }),
    // Merge-patch a tool's overlay row (create it if absent). `patch` carries ONLY
    // the fields to change — a present-null clears, an absent field is untouched,
    // and a present `tags` array replaces the set.
    upsertToolMeta: (toolName: string, patch: ToolMetaPatch) =>
      req(`/api/tool-meta/tools/${encodeSegment(toolName)}`, s.toolMetaRecord, {
        method: 'PATCH',
        body: patch,
      }),
    deleteToolMeta: (toolName: string) =>
      req(`/api/tool-meta/tools/${encodeSegment(toolName)}`, s.toolMetaDeleted, {
        method: 'DELETE',
      }),
    createFolder: (name: string, parentId: string | null = null) =>
      req('/api/tool-meta/folders', s.folderRecord, {
        method: 'POST',
        body: { name, parent_id: parentId },
      }),
    renameFolder: (folderId: string, name: string) =>
      req(`/api/tool-meta/folders/${encodeSegment(folderId)}/rename`, s.folderRecord, {
        method: 'POST',
        body: { name },
      }),
    // `null` re-parents to the root.
    moveFolder: (folderId: string, parentId: string | null) =>
      req(`/api/tool-meta/folders/${encodeSegment(folderId)}/move`, s.folderRecord, {
        method: 'POST',
        body: { parent_id: parentId },
      }),
    deleteFolder: (folderId: string) =>
      req(`/api/tool-meta/folders/${encodeSegment(folderId)}`, s.folderDeleted, {
        method: 'DELETE',
      }),

    // -- storage -------------------------------------------------------------
    // The content store a storage-provider plugin exposes. Dead by default:
    // `getStorageInfo` reports `present: false` (a 200 empty state) and every other
    // door answers a loud 501 when no provider is installed. Ids may be nested
    // paths, so each is `encodePath`-encoded (per-segment, `/` preserved).
    getStorageInfo: (signal?: AbortSignal) => req('/api/storage', s.storageInfo, { signal }),
    listStorageResources: (signal?: AbortSignal) =>
      req('/api/storage/resources', s.storageResourceList, { signal }),
    statStorageResource: (id: string, signal?: AbortSignal) =>
      req(`/api/storage/resources/${encodePath(id)}/stat`, s.storageResourceStat, { signal }),
    downloadStorageResource: (id: string, signal?: AbortSignal): Promise<Blob> =>
      apiDownload(config, `/api/storage/resources/${encodePath(id)}/content`, { signal }),
    uploadStorageResource: (body: StorageUploadBody) =>
      req('/api/storage/resources', s.storageResourceStored, { method: 'POST', body }),
    deleteStorageResource: (id: string) =>
      req(`/api/storage/resources/${encodePath(id)}`, s.storageResourceDeleted, {
        method: 'DELETE',
      }),
    deleteStorageDir: (path: string) =>
      req(`/api/storage/dirs/${encodePath(path)}`, s.storageDirDeleted, { method: 'DELETE' }),

    // -- backend identity + fleet (worker bus) -------------------------------
    // Backend IDENTITY (`getBackendInfo`, kept on `/api/backend`) is distinct from
    // the FLEET doors, which ride the app's worker bus and need no backend at all.
    // `getBackendInfo` reports `present: false` (a 200 empty state) when no backend
    // plugin is registered. `listFleetWorkers` reads the live bus presence census
    // (every subscribed origin, ASGI + backend-runtime) and never fabricates an empty
    // fleet — a census read that fails surfaces as a loud 500.
    getBackendInfo: (signal?: AbortSignal) => req('/api/backend', s.backendInfo, { signal }),
    listFleetWorkers: (signal?: AbortSignal) =>
      req('/api/fleet/workers', s.fleetWorkers, { signal }),
    // Soft-restart the fleet: `targets` names the workers to reload, or `null` for
    // the whole fleet. The serving worker applies locally then broadcasts; a 200
    // response carries the per-origin fleet report, so workers that did not converge
    // are named, not hidden. A failed local apply instead re-raises as a loud error
    // (the transport throws with the failure message), not a returned report.
    reloadFleetConfig: (targets: string[] | null) =>
      req('/api/fleet/reload-config', s.fleetReloadResult, { method: 'POST', body: { targets } }),

    // -- extensions ----------------------------------------------------------
    listExtensions: (signal?: AbortSignal) => req('/api/extensions', s.extensions, { signal }),
    // A MANIFEST-provided tool's current combos + the extension catalog. (A preset
    // tool's extensions live on the preset spec, read via `getPreset`.)
    getToolExtensions: (name: string, signal?: AbortSignal) =>
      req(`/api/tools/${encodeSegment(name)}/extensions`, s.toolExtensions, { signal }),
    // Author ALL of a MANIFEST tool's combos at once (the full lossless list; `[]`
    // clears). Returns the apply result: the local reload (`status` + `env_keys`) plus
    // the mode-wrapped fleet `fanout` of the reload it broadcast, from which the shared
    // fleet-report handler surfaces any failed propagation.
    setToolExtensions: (name: string, combos: readonly s.PresetExtensionElement[][]) =>
      req(`/api/tools/${encodeSegment(name)}/extensions`, s.toolExtensionsApplyResult, {
        method: 'POST',
        body: { combos },
      }),

    // -- templates -----------------------------------------------------------
    listTemplates: (signal?: AbortSignal) => req('/api/templates', s.templateNames, { signal }),
    getTemplate: (templateId: string) =>
      req('/api/template', s.templateDetail, { method: 'POST', body: { template_id: templateId } }),
    uploadTemplate: (path: string, content: string) =>
      req('/api/upload-template', s.templateUploaded, { method: 'POST', body: { path, content } }),
    deleteTemplate: (path: string) =>
      req('/api/delete-template', s.templateDeleted, { method: 'POST', body: { path } }),
    renderTemplate: (body: {
      content?: string;
      template_id?: string;
      kwargs?: Record<string, unknown>;
    }) => req('/api/render-template', s.templateRendered, { method: 'POST', body }),
    clearTemplatesCache: () =>
      req('/api/clear-templates-cache', s.templateCacheCleared, { method: 'POST' }),

    // -- manifest / mcp ------------------------------------------------------
    getManifest: (signal?: AbortSignal) => req('/api/manifest', s.manifestView, { signal }),
    setMcpConfig: (mcp: unknown[]) =>
      req('/api/mcp-config', s.reloadConfigResult, { method: 'POST', body: { mcp } }),
    getMcpStatus: (signal?: AbortSignal) => req('/api/mcp-status', s.mcpStatus, { signal }),
    reloadMcp: (title: string) =>
      req(`/api/mcp-status/${encodeSegment(title)}/reload`, s.mcpReloadResult, {
        method: 'POST',
      }),

    // -- sub-mcp -------------------------------------------------------------
    listSubMcp: (signal?: AbortSignal) => req('/api/sub-mcp', s.subMcpList, { signal }),
    // `transport` is optional at the client boundary (the server defaults it to
    // `http`); when omitted, JSON.stringify drops the undefined key from the body.
    createSubMcp: (slug: string, tools: string[], transport?: string) =>
      req('/api/sub-mcp', s.subMcpCreated, { method: 'POST', body: { slug, tools, transport } }),
    deleteSubMcp: (slug: string) =>
      req(`/api/sub-mcp/${encodeSegment(slug)}`, s.subMcpRemoved, { method: 'DELETE' }),

    // -- config --------------------------------------------------------------
    getEnvConfig: (signal?: AbortSignal) => req('/api/config/env', s.envConfig, { signal }),
    setEnvConfig: (env: Record<string, string>) =>
      req('/api/config/env', s.reloadConfigResult, { method: 'POST', body: env }),
    getConfigMode: (signal?: AbortSignal) => req('/api/config/mode', s.configMode, { signal }),

    // -- connectors ----------------------------------------------------------
    listProviders: (signal?: AbortSignal) =>
      req('/api/connectors/providers', s.providers, { signal }),
    listConnections: (signal?: AbortSignal) =>
      req('/api/connectors/connections', s.connectionsList, { signal }),
    getConnection: (id: string, signal?: AbortSignal) =>
      req(`/api/connectors/connections/${encodeSegment(id)}`, s.connectionView, { signal }),
    startConnect: (args: StartConnectArgs) =>
      req('/api/connectors/connections/start', s.startConnectResult, {
        method: 'POST',
        body: args,
      }),
    disconnect: (id: string) =>
      req(`/api/connectors/connections/${encodeSegment(id)}`, s.disconnectResult, {
        method: 'DELETE',
      }),
    reconnect: (id: string, enabled_sub_services: string[], return_url?: string) =>
      req(`/api/connectors/connections/${encodeSegment(id)}/reconnect`, s.reconnectResult, {
        method: 'POST',
        body: { enabled_sub_services, return_url },
      }),
    patchSubServices: (id: string, enabled_sub_services: string[], return_url?: string) =>
      req(
        `/api/connectors/connections/${encodeSegment(id)}/sub-services`,
        s.patchSubServicesResult,
        {
          method: 'PATCH',
          body: { enabled_sub_services, return_url },
        },
      ),
    completeOAuth: (state: string, code: string, error?: string) =>
      req('/api/connectors/oauth/complete', s.oauthCompleteResult, {
        method: 'POST',
        body: { state, code, error },
      }),

    // -- studio plugin registry ---------------------------------------------
    listStudioPlugins: (signal?: AbortSignal) =>
      req('/api/plugins', s.studioPluginRegistry, { signal }),

    // -- interactions --------------------------------------------------------
    answerInteraction: (interactionId: string, answer: unknown) =>
      req(`/api/interactions/${encodeSegment(interactionId)}/answer`, s.interactionAnswered, {
        method: 'POST',
        body: { answer },
      }),

    // -- channels --------------------------------------------------------------
    // The installed channel-plugin names (delivery media for ask_user questions).
    listChannels: (signal?: AbortSignal) => req('/api/channels', s.channels, { signal }),

    // -- notifications ---------------------------------------------------------
    // The internal notifications sink, newest-first — the messages the `notify_user`
    // operation records with no channel, so they surface only in this inbox.
    listNotifications: (signal?: AbortSignal) =>
      req('/api/notifications', s.notifications, { signal }),

    // -- agents --------------------------------------------------------------
    listAgents: (signal?: AbortSignal) => req('/api/agents', agentList, { signal }),
    // The authorable subset (agents whose `spec_runnable` is true) — the compose
    // UI's base-agent picker. An empty `items` list ⇒ no authoring is possible.
    listSpecRunnableAgents: (signal?: AbortSignal) =>
      req('/api/agents/spec-runnable', agentList, { signal }),
    // The streaming run: opens POST /api/agents/{name}/runs and yields parsed
    // agent events. The auto-form's built value is the POST body.
    streamAgentRun: (name: string, input: unknown, signal?: AbortSignal) =>
      streamAgentRun(config, name, input, signal),
    // The streaming run of an AUTHORED agent (POST /api/agents/authored/{name}/runs).
    // The body carries only the non-baked ToolInput fields; the baked spec is
    // resolved server-side. Reuses the same SSE parser (never EventSource).
    streamAuthoredAgentRun: (name: string, input: unknown, signal?: AbortSignal) =>
      streamAuthoredAgentRun(config, name, input, signal),

    // -- hooks --------------------------------------------------------
    listHooks: (topic?: string, signal?: AbortSignal) =>
      req('/api/hooks', s.hookList, { signal, query: topic === undefined ? undefined : { topic } }),
    registerHook: (params: s.HookParams) =>
      req('/api/hooks', s.hookRegistered, { method: 'POST', body: params }),
    unregisterHook: (name: string) =>
      req(`/api/hooks/${encodeSegment(name)}`, s.hookRemoved, { method: 'DELETE' }),
    // The registered webhook-verifier catalog — the only source the bind picker
    // reads (names only; an empty registry is a valid empty list).
    listHookVerifiers: (signal?: AbortSignal) =>
      req('/api/hooks/verifiers', s.hookVerifiers, { signal }),
    // Bind a verifier to a topic (locks its otherwise-open public ingress). A PUT
    // replaces any existing binding; an unknown verifier name is a loud 400.
    setTopicVerifier: (topic: string, body: TopicVerifierBody) =>
      req(`/api/hooks/topics/${encodeSegment(topic)}/verifier`, s.topicVerifierSet, {
        method: 'PUT',
        body,
      }),
    // Unbind a topic's verifier (re-opens its public ingress). 404 when no binding.
    deleteTopicVerifier: (topic: string) =>
      req(`/api/hooks/topics/${encodeSegment(topic)}/verifier`, s.topicVerifierRemoved, {
        method: 'DELETE',
      }),

    // -- hooks: trigger links -------------------------------------------------
    // Mint a trigger link for a topic. `ttl_seconds` is sent EXPLICITLY
    // (including `null` for a permanent link) — the server requires the key present
    // and 400s a dropped one; `tool_kwargs` is omitted when undefined. The raw
    // `token` rides the response ONCE (composed into the QR URL client-side).
    createTriggerLink: (body: TriggerLinkCreateBody) =>
      req('/api/hooks/trigger-links', s.triggerLinkCreated, {
        method: 'POST',
        body: {
          topic: body.topic,
          name: body.name,
          execution_key: body.execution_key,
          require_api_key: body.require_api_key,
          ttl_seconds: body.ttl_seconds,
          tool_kwargs: body.tool_kwargs,
        },
      }),
    // Every live trigger-link record (hash prefix only — never a raw token).
    listTriggerLinks: (signal?: AbortSignal) =>
      req('/api/hooks/trigger-links', s.triggerLinkList, { signal }),
    // Revoke a link by name (immediate + durable). 404 when the name is unknown.
    deleteTriggerLink: (name: string) =>
      req(`/api/hooks/trigger-links/${encodeSegment(name)}`, s.triggerLinkDeleted, {
        method: 'DELETE',
      }),

    // -- mcp config schema (manifest McpTab form) ----------------------------
    getMcpConfigSchema: (signal?: AbortSignal) =>
      req('/api/mcp-config/schema', s.jsonSchema, { signal }),

    // -- settings schema -----------------------------------------------------
    getSettingsSchema: (signal?: AbortSignal) =>
      req('/api/config/settings-schema', s.settingsSchema, { signal }),

    // -- auth: scopes --------------------------------------------------------
    listScopes: (signal?: AbortSignal) => req('/api/auth/scopes', s.authScopes, { signal }),
    addUrlToScope: (body: AddUrlToScopeBody) =>
      req('/api/auth/scopes', s.addUrlToScopeResult, { method: 'POST', body }),
    removeUrlFromScope: (body: { url: string }) =>
      req('/api/auth/scopes/urls', s.removeUrlFromScopeResult, { method: 'DELETE', body }),
    removeScope: (scopeId: string) =>
      req(`/api/auth/scopes/${encodeSegment(scopeId)}`, s.removeScopeResult, {
        method: 'DELETE',
      }),
    // The app's HTTP route catalog with each route's current mapping — the only
    // source of the mapper's unassigned-routes bucket (`mapped: null` entries).
    listAuthRoutes: (signal?: AbortSignal) => req('/api/auth/routes', s.authRoutes, { signal }),
    // The urls pinned to the public marker; pinning/unpinning is the dedicated
    // public-routes writer, never the scope machinery.
    listPublicRoutes: (signal?: AbortSignal) =>
      req('/api/auth/public-routes', s.publicRoutes, { signal }),
    pinRoutePublic: (body: PinRoutePublicBody) =>
      req('/api/auth/public-routes', s.pinPublicResult, { method: 'POST', body }),
    // Unpin a public url. A url that is absent or scope-mapped is a loud 404.
    unpinPublicRoute: (url: string) =>
      req('/api/auth/public-routes', s.unpinPublicResult, { method: 'DELETE', body: { url } }),

    // -- auth: roles (editable per-tag RBAC) ---------------------------------
    // The seeded + operator-authored roles as full bodies (base-tier ceiling +
    // editable per-tag grant map). ADMIN-ONLY — the route is `secret` (a listing
    // exposes each role's raw base-tier jq); a non-admin projection never reaches it.
    listRoles: (signal?: AbortSignal) => req('/api/auth/roles', s.roleList, { signal }),
    // Create an operator-authored role. The server validates the grant map + base
    // tier and 409s on a name collision; the reserved `admin` role cannot be created.
    createRole: (body: RoleCreateBody) =>
      req('/api/auth/roles', s.roleBody, { method: 'POST', body }),
    // Edit a role's per-tag grant map + description (omit-means-keep). The reserved
    // `admin` role and any `allow_all` role are block-downgrade guarded server-side.
    updateRole: (name: string, body: RoleUpdateBody) =>
      req(`/api/auth/roles/${encodeSegment(name)}`, s.roleBody, { method: 'PUT', body }),
    // Delete a role. The reserved `admin` role is undeletable; a role still assigned
    // to any principal is a loud 409.
    deleteRole: (name: string) =>
      req(`/api/auth/roles/${encodeSegment(name)}`, s.roleDeleted, { method: 'DELETE' }),
    // A role's append-only version history + who/action/before→after audit trail.
    // ADMIN-ONLY (`secret`).
    listRoleVersions: (name: string, signal?: AbortSignal) =>
      req(`/api/auth/roles/${encodeSegment(name)}/versions`, s.roleVersions, { signal }),
    // Re-point a role's active version to a prior one (LIVE — holders follow on
    // their next request); returns the re-pointed role body.
    rollbackRole: (name: string, version: number) =>
      req(`/api/auth/roles/${encodeSegment(name)}/rollback`, s.roleBody, {
        method: 'POST',
        body: { version },
      }),

    // -- auth: api keys ------------------------------------------------------
    listTokensPayload: (signal?: AbortSignal) =>
      req('/api/auth/tokens-payload', s.tokensPayload, { signal }),
    createApiKey: (body: ApiKeyBody) =>
      req('/api/auth/api-keys', s.createdApiKey, { method: 'POST', body }),
    editApiKey: (userId: string, body: Omit<ApiKeyBody, 'user_id'>) =>
      req(`/api/auth/api-keys/${encodeSegment(userId)}`, s.editApiKeyResult, {
        method: 'PUT',
        body,
      }),
    revokeApiKey: (userId: string) =>
      req(`/api/auth/api-keys/${encodeSegment(userId)}`, s.revokeApiKeyResult, {
        method: 'DELETE',
      }),
    // Mint a one-time claim link carrying a raw key to another device (the QR
    // onboarding leg). The token rides the URL fragment; the server returns a
    // relative `claim_path` and the raw token ONCE.
    createClaimLink: (body: ClaimLinkBody) =>
      req('/api/auth/claim-links', s.claimLinkCreated, { method: 'POST', body }),

    // -- auth: the caller's capability projection ----------------------------
    // The derived (path, method) surface + tools/agents the caller can reach
    // right now — the projection the Studio filters its nav and pages on.
    getMe: (signal?: AbortSignal) => req('/api/auth/me', s.meProjection, { signal }),

    // -- login: the public sign-in aggregator --------------------------------
    // PUBLIC by design: `apiRequest` attaches `x-api-key` only when a token
    // exists, so the unauthenticated call carries no auth header — no transport
    // change needed.
    getLoginMethods: (options?: { signal?: AbortSignal }) =>
      req('/api/login/methods', s.loginMethods, { signal: options?.signal }),
    // Submit a `form` method's field VALUES as a flat top-level JSON body (the
    // server's request models take the declared field names top-level). `path`
    // is re-checked with the same relative-`/api/` guard the renderer uses — an
    // off-origin path is a PROGRAMMING error (loud `Error`), not a login failure.
    // A refused credential becomes an inline `ApiLoginFailedError`.
    submitLoginForm: async (path: string, values: Record<string, string>) => {
      if (!isSafeApiPath(path)) {
        throw new Error(
          `login submit_path must be a relative /api/ path; received ${JSON.stringify(path)}`,
        );
      }
      try {
        return await req(path, s.loginResult, { method: 'POST', body: values });
      } catch (error) {
        return asLoginError(error);
      }
    },
    // Exchange a one-time SSO hand-back code for a session (never a token in the
    // URL). An expired/reused code is a login failure, surfaced inline.
    exchangeSsoCode: async (code: string) => {
      try {
        return await req('/api/login/sso/exchange', s.loginResult, {
          method: 'POST',
          body: { code },
        });
      } catch (error) {
        return asLoginError(error);
      }
    },
    // Exchange a one-time claim token (read from the login URL fragment, never a
    // query param) for a session. PUBLIC. The token is single-use and burns
    // server-side; a used/unknown/expired token answers the uniform 404, which —
    // like the SSO leg — maps to an inline `ApiLoginFailedError`, not a global
    // unauthorized redirect. The caller latches the exchange so it fires once.
    claimLogin: async (body: { token: string }) => {
      try {
        return await req('/api/login/claim', s.loginResult, { method: 'POST', body });
      } catch (error) {
        return asLoginError(error);
      }
    },
    // Whether this deployment can mint API keys locally (the settings key-create
    // UI gates on `mintable`). AUTHED.
    getAuthCapabilities: (signal?: AbortSignal) =>
      req('/api/auth/capabilities', s.authCapabilities, { signal }),

    // -- auth: session logout ------------------------------------------------
    // The single authed logout dispatcher — revokes the caller's accounts
    // session server-side before the shell clears local state. A plain `sk-` key
    // has nothing to revoke and answers 404 (surfaced as an `ApiError`, quiet at
    // the call site); a 5xx/network failure is a real revoke failure the shell
    // surfaces loudly.
    logout: () => req('/api/auth/logout', s.logoutResult, { method: 'POST' }),

    // -- auth: policy authoring + versioning ---------------------------------
    // The fail-closed jq guard: compiles (and, with `sample_context`, evaluates) a
    // condition without persisting anything, so a broken condition is caught at
    // author time instead of locking a key out at enforcement. A broken condition
    // is a 400 the transport throws — never a false-positive `ok`.
    validateCondition: (body: ValidateConditionBody) =>
      req('/api/auth/validate-condition', s.validateConditionResult, { method: 'POST', body }),
    // The user's append-only policy version history (each row's `is_current`
    // derived from the active pointer). SECRET-ADJACENT — the body carries the raw
    // condition, so its fixtures are hand-authored.
    listPolicyVersions: (userId: string, signal?: AbortSignal) =>
      req(`/api/auth/api-keys/${encodeSegment(userId)}/policy/versions`, s.policyVersionList, {
        signal,
      }),
    // Re-point the enforced policy to a prior version; returns the re-pointed
    // active version. Enforcement follows on cache invalidation.
    rollbackPolicy: (userId: string, version: number) =>
      req(`/api/auth/api-keys/${encodeSegment(userId)}/policy/rollback`, s.policyRollback, {
        method: 'POST',
        body: { version },
      }),

    // -- backup --------------------------------------------------------------
    listBackupSections: (signal?: AbortSignal) =>
      req('/api/backup/sections', s.backupSections, { signal }),
    exportBackup: (sections: string[], signal?: AbortSignal): Promise<Blob> =>
      apiDownload(config, '/api/backup/export', { method: 'POST', body: { sections }, signal }),
    importBackup: (body: { document: unknown; sections: string[] }) =>
      req('/api/backup/import', s.backupImportReport, { method: 'POST', body }),

    // -- schedules -----------------------------------------------------------
    listSchedules: (signal?: AbortSignal) => req('/api/schedules', s.scheduleList, { signal }),
    getServerDateTime: (signal?: AbortSignal) =>
      req('/api/schedules/server-datetime', s.serverDateTime, { signal }),
    addSchedule: (body: {
      tool_name: string;
      tool_kwargs: Record<string, unknown>;
      schedule_kwargs: Record<string, unknown>;
    }) => req('/api/schedules', s.jsonValue, { method: 'POST', body }),
    deleteSchedule: (name: string) =>
      req(`/api/schedules/${encodeSegment(name)}`, s.jsonValue, { method: 'DELETE' }),

    // -- observability -------------------------------------------------------
    // The monitoring-backend dashboard rollups (`GET /api/observability/metrics`),
    // a JSON aggregate distinct from any raw process-metrics text endpoint.
    getObservabilityMetrics: (params: MetricsQuery = {}, signal?: AbortSignal) =>
      req('/api/observability/metrics', s.dashboardMetrics, {
        query: { from: params.from, to: params.to, granularity: params.granularity },
        signal,
      }),
    listRuns: (params: RunsQuery = {}, signal?: AbortSignal) =>
      req('/api/observability/runs', s.runsPage, { query: runsQueryToParams(params), signal }),
    getRunTrace: (traceId: string, signal?: AbortSignal) =>
      req(`/api/observability/runs/${encodeSegment(traceId)}/trace`, s.runTrace, { signal }),
    exportTrace: (traceId: string, signal?: AbortSignal): Promise<Blob> =>
      apiDownload(config, `/api/observability/runs/${encodeSegment(traceId)}/trace/export`, {
        signal,
      }),
    exportRuns: (
      params: RunsQuery & { format: 'csv' | 'json' },
      signal?: AbortSignal,
    ): Promise<Blob> =>
      apiDownload(config, '/api/observability/runs/export', {
        query: { ...runsQueryToParams(params), format: params.format },
        signal,
      }),

    // -- marketplace ---------------------------------------------------------
    // Browse/search proxy the registry through the app (one origin, one auth);
    // install/uninstall/update mutate the RUNNING app (pip install + manifest
    // patch + reload) and return synchronous receipts.
    searchMarketplace: (query: MarketplaceSearchQuery = {}, signal?: AbortSignal) =>
      req('/api/marketplace/search', s.marketplaceSearchPage, {
        query: {
          q: query.q,
          kind: query.kind,
          category: query.category,
          tags: query.tags,
          namespace: query.namespace,
          tier: query.tier,
          contract: query.contract,
          sort: query.sort,
          page: query.page,
          page_size: query.page_size,
        },
        signal,
      }),
    getMarketplacePlugin: (namespace: string, name: string, signal?: AbortSignal) =>
      req(
        `/api/marketplace/plugins/${encodeSegment(namespace)}/${encodeSegment(name)}`,
        s.marketplacePluginDetail,
        { signal },
      ),
    listMarketplaceCategories: (signal?: AbortSignal) =>
      req('/api/marketplace/categories', s.marketplaceCategories, { signal }),
    listMarketplaceKinds: (signal?: AbortSignal) =>
      req('/api/marketplace/kinds', s.marketplaceKinds, { signal }),
    listInstalledMarketplacePlugins: (signal?: AbortSignal) =>
      req('/api/marketplace/installed', s.marketplaceInstalled, { signal }),
    installMarketplacePlugin: (body: MarketplaceInstallBody) =>
      req('/api/marketplace/install', s.marketplaceInstallResult, { method: 'POST', body }),
    uninstallMarketplacePlugin: (body: MarketplaceUninstallBody) =>
      req('/api/marketplace/uninstall', s.marketplaceUninstallResult, { method: 'POST', body }),
    updateMarketplacePlugin: (body: MarketplaceInstallBody) =>
      req('/api/marketplace/update', s.marketplaceInstallResult, { method: 'POST', body }),
    // Upgrade EVERY installed plugin to its newest compatible version in one
    // pass; the response is the per-plugin outcome readout.
    upgradeAllMarketplacePlugins: () =>
      req('/api/marketplace/upgrade-all', s.marketplaceUpgradeAllResult, { method: 'POST' }),
    getMarketplaceAdvisories: (signal?: AbortSignal) =>
      req('/api/marketplace/advisories', s.marketplaceAdvisories, { signal }),

    // -- system (plain-text ops endpoint) ------------------------------------
    getHealth: (signal?: AbortSignal) => apiText(config, '/health', { signal }),

    // The pluggable-kind status table (`GET /api/system/kinds`) — a JSON `{data}`
    // envelope, one row per kind with its active/default/off state.
    getSystemKinds: (signal?: AbortSignal) =>
      req('/api/system/kinds', s.kindStatusList, { signal }),

    /**
     * Open the authed interactions SSE stream. The caller drives reconnect +
     * backlog-replay dedup. Returns the raw frame iterator; the interactions
     * feature maps frames to typed events.
     */
    streamInteractions: async (signal?: AbortSignal) => {
      const doFetch = config.fetch ?? globalThis.fetch;
      const token = config.getToken();
      const headers: Record<string, string> = { accept: 'text/event-stream' };
      if (token) headers['x-api-key'] = token;
      // Distinct-URL per open — see the canonical constraint on `sseOpenToken`.
      const url = `${config.baseUrl ?? ''}/api/interactions/stream?_=${sseOpenToken()}`;
      const response = await doFetch(url, {
        headers,
        signal,
      });
      if (response.status === 401) throw new ApiUnauthorizedError();
      // A non-ok stream open (5xx/4xx) still carries a body, which would parse to
      // zero frames and look like a silently-empty stream — surface it loudly so
      // the caller shows an error instead of hanging on a reconnect loop. Read the
      // `{ "error" }` envelope so a load-bearing server message (e.g. the OFF
      // store's 501 remediation line) surfaces verbatim instead of collapsing to
      // the bare status text.
      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new ApiError(response.statusText || 'stream failed', response.status);
        }
        const { message, code } = extractError(payload);
        throw new ApiError(
          message ?? (response.statusText || 'stream failed'),
          response.status,
          code,
        );
      }
      return readSseFrames(response, signal);
    },
  } as const;
}

export type ApiClient = ReturnType<typeof createApiClient>;
