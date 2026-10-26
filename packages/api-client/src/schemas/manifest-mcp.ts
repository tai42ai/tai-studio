/** Live-manifest MCP section, env-ref and config-reload schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import { presetExtensionElement } from './extensions';
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
 * One entry of the live manifest's MCP section, hand-typed: the spec publishes an entry as
 * an open object. Only the `managed` provenance
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

const extensionMap = z.record(z.string(), z.array(z.array(presetExtensionElement)));

/**
 * The preserved manifest's extension settings: the extension modules, the backend
 * module, and the `extensions` maps of the `tools`, `mcp` and `api_tools` sections,
 * each combo element refined to the client's extension-element schema.
 */
export const manifestExtensionSettings = openapi.manifestExtensionSettings.extend({
  tools: z.array(openapi.manifestExtensionMap.extend({ extensions: extensionMap })),
  mcp: z.array(openapi.manifestExtensionMap.extend({ extensions: extensionMap })),
  api_tools: extensionMap,
});
export type ManifestExtensionSettings = z.infer<typeof manifestExtensionSettings>;

export const manifestView = openapi.preservedManifestView.extend({
  mcp: z.array(manifestMcpEntry),
  extension_settings: manifestExtensionSettings,
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
export const mcpEnvRef = openapi.mcpEnvRef;
export type McpEnvRef = z.infer<typeof mcpEnvRef>;
export const mcpEnvRefs = openapi.mcpEnvRefList;
export type McpEnvRefs = z.infer<typeof mcpEnvRefs>;
/**
 * The apply result every config-writer mutation returns (`POST /api/mcp-config`,
 * `POST /api/config/env`): the serving worker's local reload result (`status` +
 * `env_keys`), the mode-wrapped fleet fan-out of the reload it broadcast, `recycle` — the
 * fleet recycle roll an env change carrying a recycle-class key ran (`null` when it carried
 * none) — and `awaiting_respawn`, the workers (name + keys) still awaiting a respawn after
 * it, empty when its roll converged. The `fanout` is hand-typed (the spec publishes it as
 * one object with optional fields) so the shared fleet-report handler can surface a failed
 * propagation. A drift throws `ApiSchemaError`.
 */
export const reloadConfigResult = openapi.applyResponse.extend({ fanout: fleetReportFanout });
export type ReloadConfigResult = z.infer<typeof reloadConfigResult>;

/**
 * `POST /api/mcp-status/{title}/advertised-tools` — every tool the server advertises
 * (before the entry's include/exclude filter), each with whether it is selected and
 * bound, and why not (`unbound_reason`, or `null` when bound or unselected).
 */
export const mcpAdvertisedTools = openapi.mcpAdvertisedTools;
export type McpAdvertisedTools = z.infer<typeof mcpAdvertisedTools>;
export type { McpAdvertisedTool } from '../generated/openapi-schemas';
