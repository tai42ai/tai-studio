/** Pluggable-kind status and MCP status/reload response schemas. */
import { z } from 'zod';
import { fleetResult } from './fleet';
import { reloadConfigResult } from './manifest-mcp';

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
