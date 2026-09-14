/** Live-manifest MCP section, env-ref and config-reload schemas. */
import { z } from 'zod';
import { fleetReportFanout } from './fleet';

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
