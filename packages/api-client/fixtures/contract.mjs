/**
 * The fixtures capture CONTRACT — the single source of truth shared by the
 * `fixtures:refresh` capture script and the api-client guard + zod-validation
 * tests.
 *
 * Two classes of GET endpoint:
 *
 *  - ALLOW-LISTED: GETs whose payload can carry NO secret, captured automatically
 *    from the live e2e skeleton into `fixtures/<name>.json`.
 *  - EXCLUDED: secret-bearing (or secret-CAPABLE) GETs, never captured
 *    automatically — a live secret committed into public fixtures is the exact
 *    regression the guard test pins against. env-config and every connector
 *    endpoint are excluded OUTRIGHT; manifest / mcp-config / config-mode are
 *    excluded from AUTOMATED capture because a live manifest can embed MCP tokens
 *    (they get hand-authored redacted fixtures instead).
 *
 * `schema` names a zod schema exported by `@tai42/api-client`'s `schemas` module;
 * the zod-validation test parses each captured fixture with it.
 */

/** GETs safe to capture automatically. `schema` = the exported zod schema name. */
export const FIXTURE_ENDPOINTS = [
  { name: 'tools', path: '/api/tools', schema: 'toolNames' },
  { name: 'tools-schema', path: '/api/tools-schema', schema: 'allToolSchemas' },
  {
    name: 'tool-schema.studio_demo_form',
    path: '/api/tools/studio_demo_form/schema',
    schema: 'toolSchema',
  },
  { name: 'extensions', path: '/api/extensions', schema: 'extensions' },
  { name: 'tools-tags', path: '/api/tools/tags', schema: 'toolTags' },
  { name: 'tool-meta', path: '/api/tool-meta', schema: 'toolMetaOverlay' },
  { name: 'mcp-status', path: '/api/mcp-status', schema: 'mcpStatus' },
  { name: 'plugins', path: '/api/plugins', schema: 'studioPluginRegistry' },
];

/**
 * Class 2 fixtures — hand-authored, never captured, still zod-validated in CI.
 *
 * These carry NO live secret material, so they live outside the capture pipeline
 * and outside `assertCaptureSetSafe` (which guards only the auto-capture set). The
 * authored-fixtures test parses each `file` with its named `schema`, so a fixture
 * drifting from the canonical schema fails CI. Each entry:
 *   - `name`   human-readable fixture id (also the test title).
 *   - `path`   the API endpoint the fixture represents.
 *   - `file`   fixture location relative to this `fixtures/` directory.
 *   - `schema` the exported `@tai42/api-client` zod schema that consumes it.
 */

/**
 * MUTATION endpoints (POST/DELETE/PATCH). No live capture exists for these, so the
 * canonical response shape is pinned by a hand-authored fixture per variant. Union
 * schemas get one fixture per meaningful variant (connect-start: oauth vs manual;
 * oauth-complete: success/failed/cancelled).
 */
export const MUTATION_FIXTURES = [
  {
    name: 'run-tool',
    path: '/api/run-tool',
    file: 'mutations/run-tool.json',
    schema: 'runToolResult',
  },
  {
    // The MEDIA variant of the run-tool response: a returned
    // Image/Audio MediaBlock serialized to the MCP content object the
    // ResultViewer media-renders. Same union endpoint, distinct meaningful shape.
    name: 'run-tool-media',
    path: '/api/run-tool',
    file: 'mutations/run-tool-media.json',
    schema: 'toolMediaResult',
  },
  {
    name: 'submit-tool-run',
    path: '/api/tool-runs',
    file: 'mutations/submit-tool-run.json',
    schema: 'toolRunSubmitResult',
  },
  {
    name: 'template-detail',
    path: '/api/template',
    file: 'mutations/template-detail.json',
    schema: 'templateDetail',
  },
  {
    name: 'upload-template',
    path: '/api/upload-template',
    file: 'mutations/upload-template.json',
    schema: 'templateUploaded',
  },
  {
    name: 'delete-template',
    path: '/api/delete-template',
    file: 'mutations/delete-template.json',
    schema: 'templateDeleted',
  },
  {
    name: 'render-template',
    path: '/api/render-template',
    file: 'mutations/render-template.json',
    schema: 'templateRendered',
  },
  {
    name: 'clear-templates-cache',
    path: '/api/clear-templates-cache',
    file: 'mutations/clear-templates-cache.json',
    schema: 'templateCacheCleared',
  },
  {
    name: 'mcp-config',
    path: '/api/mcp-config',
    file: 'mutations/mcp-config.json',
    schema: 'reloadConfigResult',
  },
  {
    name: 'mcp-reload',
    path: '/api/mcp-status/{title}/reload',
    file: 'mutations/mcp-reload.json',
    schema: 'mcpReloadResult',
  },
  {
    name: 'sub-mcp-create',
    path: '/api/sub-mcp',
    file: 'mutations/sub-mcp-create.json',
    schema: 'subMcpCreated',
  },
  {
    name: 'sub-mcp-delete',
    path: '/api/sub-mcp/{slug}',
    file: 'mutations/sub-mcp-delete.json',
    schema: 'subMcpRemoved',
  },
  {
    name: 'env-config',
    path: '/api/config/env',
    file: 'mutations/env-config.json',
    schema: 'reloadConfigResult',
  },
  {
    name: 'answer',
    path: '/api/interactions/{id}/answer',
    file: 'mutations/answer.json',
    schema: 'interactionAnswered',
  },
  {
    name: 'connect-start.oauth',
    path: '/api/connectors/connections/start',
    file: 'mutations/connect-start.oauth.json',
    schema: 'startConnectResult',
  },
  {
    name: 'connect-start.manual',
    path: '/api/connectors/connections/start',
    file: 'mutations/connect-start.manual.json',
    schema: 'startConnectResult',
  },
  {
    name: 'disconnect',
    path: '/api/connectors/connections/{id}',
    file: 'mutations/disconnect.json',
    schema: 'disconnectResult',
  },
  {
    name: 'reconnect',
    path: '/api/connectors/connections/{id}/reconnect',
    file: 'mutations/reconnect.json',
    schema: 'reconnectResult',
  },
  {
    name: 'patch-sub-services',
    path: '/api/connectors/connections/{id}/sub-services',
    file: 'mutations/patch-sub-services.json',
    schema: 'patchSubServicesResult',
  },
  {
    name: 'oauth-complete.success',
    path: '/api/connectors/oauth/complete',
    file: 'mutations/oauth-complete.success.json',
    schema: 'oauthCompleteResult',
  },
  {
    name: 'oauth-complete.failed',
    path: '/api/connectors/oauth/complete',
    file: 'mutations/oauth-complete.failed.json',
    schema: 'oauthCompleteResult',
  },
  {
    name: 'oauth-complete.cancelled',
    path: '/api/connectors/oauth/complete',
    file: 'mutations/oauth-complete.cancelled.json',
    schema: 'oauthCompleteResult',
  },
  {
    name: 'register-hook',
    path: '/api/hooks',
    file: 'mutations/register-hook.json',
    schema: 'hookRegistered',
  },
  {
    name: 'unregister-hook',
    path: '/api/hooks/{name}',
    file: 'mutations/unregister-hook.json',
    schema: 'hookRemoved',
  },
  {
    name: 'set-topic-verifier',
    path: '/api/hooks/topics/{topic}/verifier',
    file: 'mutations/set-topic-verifier.json',
    schema: 'topicVerifierSet',
  },
  {
    name: 'delete-topic-verifier',
    path: '/api/hooks/topics/{topic}/verifier',
    file: 'mutations/delete-topic-verifier.json',
    schema: 'topicVerifierRemoved',
  },
  {
    name: 'pin-public-route',
    path: '/api/auth/public-routes',
    file: 'mutations/pin-public-route.json',
    schema: 'pinPublicResult',
  },
  {
    name: 'unpin-public-route',
    path: '/api/auth/public-routes',
    file: 'mutations/unpin-public-route.json',
    schema: 'unpinPublicResult',
  },
  {
    name: 'create-api-key',
    path: '/api/auth/api-keys',
    file: 'mutations/create-api-key.json',
    schema: 'createdApiKey',
  },
  {
    name: 'edit-api-key',
    path: '/api/auth/api-keys/{user_id}',
    file: 'mutations/edit-api-key.json',
    schema: 'editApiKeyResult',
  },
  {
    name: 'revoke-api-key',
    path: '/api/auth/api-keys/{user_id}',
    file: 'mutations/revoke-api-key.json',
    schema: 'revokeApiKeyResult',
  },
  {
    name: 'validate-condition',
    path: '/api/auth/validate-condition',
    file: 'mutations/validate-condition.json',
    schema: 'validateConditionResult',
  },
  {
    name: 'policy-rollback',
    path: '/api/auth/api-keys/{user_id}/policy/rollback',
    file: 'mutations/policy-rollback.json',
    schema: 'policyRollback',
  },
  {
    name: 'add-url-to-scope',
    path: '/api/auth/scopes',
    file: 'mutations/add-url-to-scope.json',
    schema: 'addUrlToScopeResult',
  },
  {
    name: 'remove-url-from-scope',
    path: '/api/auth/scopes/urls',
    file: 'mutations/remove-url-from-scope.json',
    schema: 'removeUrlFromScopeResult',
  },
  {
    name: 'remove-scope',
    path: '/api/auth/scopes/{scope_id}',
    file: 'mutations/remove-scope.json',
    schema: 'removeScopeResult',
  },
  {
    name: 'backup-import',
    path: '/api/backup/import',
    file: 'mutations/backup-import.json',
    schema: 'backupImportReport',
  },
  {
    name: 'add-schedule',
    path: '/api/schedules',
    file: 'mutations/add-schedule.json',
    schema: 'jsonValue',
  },
  {
    name: 'delete-schedule',
    path: '/api/schedules/{name}',
    file: 'mutations/delete-schedule.json',
    schema: 'jsonValue',
  },
  // Storage is dead by default in the capture skeleton (no provider plugin), so its
  // reads AND mutations are hand-authored rather than auto-captured. Ids and
  // provider names carry no secret; each fixture still pins its response shape.
  {
    name: 'storage-info',
    path: '/api/storage',
    file: 'mutations/storage-info.json',
    schema: 'storageInfo',
  },
  {
    name: 'storage-resources',
    path: '/api/storage/resources',
    file: 'mutations/storage-resources.json',
    schema: 'storageResourceList',
  },
  {
    name: 'storage-stat',
    path: '/api/storage/resources/{id}/stat',
    file: 'mutations/storage-stat.json',
    schema: 'storageResourceStat',
  },
  {
    name: 'storage-upload',
    path: '/api/storage/resources',
    file: 'mutations/storage-upload.json',
    schema: 'storageResourceStored',
  },
  {
    name: 'storage-delete',
    path: '/api/storage/resources/{id}',
    file: 'mutations/storage-delete.json',
    schema: 'storageResourceDeleted',
  },
  {
    name: 'storage-delete-dir',
    path: '/api/storage/dirs/{path}',
    file: 'mutations/storage-delete-dir.json',
    schema: 'storageDirDeleted',
  },
  // Backend IDENTITY is dead by default in the capture skeleton (no backend plugin),
  // and the FLEET doors ride the worker bus, which the single-process capture
  // skeleton runs without — so all three are hand-authored rather than
  // auto-captured. Worker origins/kinds and class/module identity carry no secret;
  // each fixture pins its response shape. `fleet-workers` is the bus presence census
  // (every subscribed worker); `fleet-reload-config` is the per-worker fleet report.
  {
    name: 'backend-info',
    path: '/api/backend',
    file: 'mutations/backend-info.json',
    schema: 'backendInfo',
  },
  {
    name: 'fleet-workers',
    path: '/api/fleet/workers',
    file: 'mutations/fleet-workers.json',
    schema: 'fleetWorkers',
  },
  {
    name: 'fleet-reload-config',
    path: '/api/fleet/reload-config',
    file: 'mutations/fleet-reload-config.json',
    schema: 'fleetReloadResult',
  },
];

/**
 * REDACTED fixtures for the secret-bearing GETs the UI actually reads. These stand
 * in for the EXCLUDED-from-capture endpoints (env-config, config-mode, manifest, and
 * the connector reads) so those response shapes are still pinned in CI — but authored
 * by hand with placeholder/redacted values (e.g. env values as `"***"`) so no live
 * secret is ever committed. Every `path` here MUST match an `EXCLUDED_FROM_CAPTURE`
 * prefix; the authored-fixtures test asserts that alignment.
 */
export const REDACTED_FIXTURES = [
  {
    name: 'env-config',
    path: '/api/config/env',
    file: 'redacted/env-config.json',
    schema: 'envConfig',
  },
  {
    name: 'config-mode',
    path: '/api/config/mode',
    file: 'redacted/config-mode.json',
    schema: 'configMode',
  },
  {
    name: 'manifest',
    path: '/api/manifest',
    file: 'redacted/manifest.json',
    schema: 'manifestView',
  },
  {
    name: 'providers',
    path: '/api/connectors/providers',
    file: 'redacted/providers.json',
    schema: 'providers',
  },
  {
    name: 'connections',
    path: '/api/connectors/connections',
    file: 'redacted/connections.json',
    schema: 'connectionsList',
  },
  {
    name: 'connection',
    path: '/api/connectors/connections/conn_9f8e7d6c',
    file: 'redacted/connection.json',
    schema: 'connectionView',
  },
  {
    name: 'settings-schema',
    path: '/api/config/settings-schema',
    file: 'redacted/settings-schema.json',
    schema: 'settingsSchema',
  },
  {
    name: 'mcp-config-schema',
    path: '/api/mcp-config/schema',
    file: 'redacted/mcp-config-schema.json',
    schema: 'jsonSchema',
  },
  {
    name: 'sub-mcp',
    path: '/api/sub-mcp',
    file: 'redacted/sub-mcp.json',
    schema: 'subMcpList',
  },
  {
    name: 'tokens-payload',
    path: '/api/auth/tokens-payload',
    file: 'redacted/tokens-payload.json',
    schema: 'tokensPayload',
  },
  {
    name: 'auth-scopes',
    path: '/api/auth/scopes',
    file: 'redacted/auth-scopes.json',
    schema: 'authScopes',
  },
  {
    name: 'auth-routes',
    path: '/api/auth/routes',
    file: 'redacted/auth-routes.json',
    schema: 'authRoutes',
  },
  {
    name: 'public-routes',
    path: '/api/auth/public-routes',
    file: 'redacted/public-routes.json',
    schema: 'publicRoutes',
  },
  {
    name: 'hook-verifiers',
    path: '/api/hooks/verifiers',
    file: 'redacted/hook-verifiers.json',
    schema: 'hookVerifiers',
  },
  {
    name: 'policy-versions',
    path: '/api/auth/api-keys/u1/policy/versions',
    file: 'redacted/policy-versions.json',
    schema: 'policyVersionList',
  },
  {
    name: 'backup-sections',
    path: '/api/backup/sections',
    file: 'redacted/backup-sections.json',
    schema: 'backupSections',
  },
  {
    name: 'schedules',
    path: '/api/schedules',
    file: 'redacted/schedules.json',
    schema: 'scheduleList',
  },
  {
    name: 'server-datetime',
    path: '/api/schedules/server-datetime',
    file: 'redacted/server-datetime.json',
    schema: 'serverDateTime',
  },
  {
    name: 'presets',
    path: '/api/presets',
    file: 'redacted/presets.json',
    schema: 'presetList',
  },
  {
    name: 'preset',
    path: '/api/presets/paris_weather',
    file: 'redacted/preset.json',
    schema: 'presetDetail',
  },
  {
    name: 'preset-versions',
    path: '/api/presets/paris_weather/versions',
    file: 'redacted/preset-versions.json',
    schema: 'presetVersionList',
  },
  {
    name: 'observability-metrics',
    path: '/api/observability/metrics',
    file: 'redacted/observability-metrics.json',
    schema: 'dashboardMetrics',
  },
  {
    name: 'observability-runs',
    path: '/api/observability/runs',
    file: 'redacted/observability-runs.json',
    schema: 'runsPage',
  },
  {
    name: 'observability-trace',
    path: '/api/observability/runs/trace_9f8e7d6c/trace',
    file: 'redacted/observability-trace.json',
    schema: 'runTrace',
  },
  {
    name: 'tool-run',
    path: '/api/tool-runs/run_9f8e7d6c5b4a3210',
    file: 'redacted/tool-run.json',
    schema: 'toolRunRecord',
  },
  {
    name: 'tool-runs',
    path: '/api/tool-runs',
    file: 'redacted/tool-runs.json',
    schema: 'toolRunList',
  },
];

/**
 * Endpoints that must NEVER be captured automatically. Each entry is a PREFIX: a
 * captured path is excluded when it equals or starts with one of these. The
 * connector prefix covers the whole `/api/connectors/*` surface.
 */
export const EXCLUDED_FROM_CAPTURE = [
  '/api/config/env', // env-config — raw secret material, excluded outright
  '/api/config/mode', // config-mode — audited class; not auto-captured
  '/api/config/settings-schema', // settings-schema — field `value`s can carry secrets
  '/api/manifest', // live manifest can embed MCP tokens — audited class
  '/api/mcp-config', // mcp-config (+ /schema) — audited class
  '/api/sub-mcp', // sub-MCP configs can embed MCP tokens/credentials — excluded outright
  '/api/connectors', // every connector endpoint — excluded outright
  '/api/hooks', // hook tool_kwargs can carry secrets — excluded outright
  '/api/auth', // scopes / tokens / api-keys — secret-bearing, excluded outright
  '/api/backup', // backup sections/export — secret-bearing, excluded outright
  '/api/schedules', // schedule tool kwargs can carry secrets — excluded outright
  '/api/presets', // preset fixed_kwargs can embed credentials — excluded outright
  '/api/observability', // run inputs/outputs can carry secrets — excluded outright
  '/api/tool-runs', // background run records embed tool arguments/output — secret-bearing
];

/** True when `path` is on the excluded list (equal or prefix match). */
export function isExcluded(path) {
  return EXCLUDED_FROM_CAPTURE.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

/**
 * Guard the capture set: throw LOUDLY if any endpoint slated for automated capture
 * is on the excluded list. Called by the capture script before writing anything AND
 * asserted by the guard test — so adding an excluded endpoint to FIXTURE_ENDPOINTS
 * fails both the live capture and CI (the regression is a live secret committed into
 * public fixtures).
 */
export function assertCaptureSetSafe(endpoints = FIXTURE_ENDPOINTS) {
  for (const endpoint of endpoints) {
    if (isExcluded(endpoint.path)) {
      throw new Error(
        `fixtures capture set includes an EXCLUDED (secret-bearing) endpoint: ${endpoint.path} — ` +
          'secret-bearing endpoints must never be captured into public fixtures.',
      );
    }
  }
}
