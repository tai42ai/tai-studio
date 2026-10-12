/** Pluggable-kind status and MCP status/reload response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import { fleetResult } from './fleet';
import { reloadConfigResult } from './manifest-mcp';

// `GET /api/system/kinds` — one row per pluggable kind (identity, accounts,
// monitoring, storage, backend, channels, webhook_verifiers, config,
// studio_plugins). `state` is the kind's active/default/off status: `active` = a
// real plugin serves it, `default` = a built-in fallback serves it, `off` =
// nothing is registered (a legal state, reported not "fixed"). `plugin` is the
// provider/module name when known, else null.

export const kindStatus = openapi.kindStatus;
export const kindStatusList = openapi.systemKindsListing;
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
// `GET /api/mcp-status` — the bound-server map, the servers the viability check
// skipped, and each server's health record. Each failed entry carries the coarse,
// credential-free failure detail the platform records: `category` (`auth` for a 401/403,
// `unreachable` for a transport error or timeout, `error` otherwise), the redacted
// `message`, and the `http_status` the failure carried (`null` for a pure transport
// failure).
export const mcpStatus = openapi.mcpStatusSnapshot;

/**
 * `POST /api/mcp-status/{title}/reload` — re-probe a single MCP server and broadcast
 * the reload to the fleet. The response is the bare per-worker {@link fleetResult}
 * (the serving worker's re-probe rides its own `results` entry as the payload); there
 * is no local/workers split. A drift throws `ApiSchemaError`.
 */
export const mcpReloadResult = fleetResult;
export type McpReloadResult = z.infer<typeof mcpReloadResult>;
