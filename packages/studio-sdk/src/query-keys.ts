/**
 * Cross-feature TanStack Query keys.
 *
 * Feature packages cannot import each other — the SDK is their one shared seam — so
 * a query key more than one feature must reference lives here as a single
 * authoritative constant rather than a duplicated literal that could drift.
 *
 * `toolsListKey` is the registered-tool master list. A mutation that changes the
 * registered-tool population — creating, deleting, or rolling back a preset (each
 * binds or tears down a live tool) — invalidates it so the tools page refetches.
 */

/** The registered-tool master list (`GET /api/tools`). */
export const toolsListKey = ['tools'] as const;

/**
 * The extension catalog (`GET /api/extensions`). The manifest feature keys its
 * loaded-extensions list on it; a tool's extension-combo save (in the tools feature)
 * invalidates it too — a cross-feature reference that must resolve to one
 * authoritative constant.
 */
export const extensionsQueryKey = ['extensions'] as const;

/**
 * The discovered sub-MCP mounts (`GET /api/sub-mcp`). The settings feature reads
 * this map (its scope mapper lists the mounts) while the manifest feature owns the
 * create/delete controls that mutate it; both must key and invalidate the exact
 * same tuple, so it lives here rather than as a literal duplicated across the two
 * features (which cannot import each other).
 */
export const subMcpKey = ['sub-mcp'] as const;

/** The api-key payloads; read by settings AND the hooks execution-key picker. */
export const tokensPayloadKey = ['auth-tokens-payload'] as const;

/** The installed channel plugins (`GET /api/channels`): the interactions feature's Delivery channels card and the
 * conversations feature's route form read it under this one key. */
export const channelsListKey = ['channels'] as const;

/** The registered-agent list (`GET /api/agents`): the agents feature and the conversations feature's route form. */
export const agentsListKey = ['agents', 'list'] as const;

/**
 * The state catalog (`GET /api/states`). The states feature owns it, and every door
 * screen that hosts the state-binding editor (a preset, a route, a hook, a schedule)
 * reads the same catalog to populate the binding's state picker — so both key the one
 * authoritative tuple and a single fetch serves both.
 */
export const statesListKey = ['states', 'list'] as const;

/**
 * The state-template document catalog (`GET /api/state-templates`). Read by the states
 * feature AND every state-binding door screen (the templates a binding attaches),
 * keyed here so the two never fetch the same catalog under diverging tuples.
 */
export const stateTemplatesKey = ['states', 'state-templates'] as const;

/**
 * The holders that would refuse detaching `template` from `state`
 * (`GET /api/states/{name}/attachments/{template}/referees`), read by the detach confirm.
 */
export function stateTemplateRefereesKey(
  state: string,
  template: string,
): readonly ['states', 'referees', string, string] {
  return ['states', 'referees', state, template];
}

// -- MCP servers (read by the Manifest screen's MCP block and the Connectors directory)

/**
 * The PRESERVED manifest (`GET /api/manifest/preserved`): `!ENV ${KEY}` markers intact,
 * no resolved secrets. Its own key, never the resolved manifest's, so the two views
 * never collide in the cache.
 */
export const preservedManifestKey = ['manifest', 'preserved'] as const;

/** The mounted MCP servers' live status (`GET /api/mcp-status`). */
export const mcpStatusKey = ['mcp-status'] as const;

/**
 * The fleet-wide failed-MCP roster (`GET /api/mcp-status/failed`). A reload or
 * deregister invalidates it together with {@link mcpStatusKey}, since a re-attached
 * server moves between the two views.
 */
export const mcpFailedKey = ['mcp-status', 'failed'] as const;

/** One server's advertised tools (`POST /api/mcp-status/{title}/advertised-tools`). */
export function mcpAdvertisedToolsKey(
  title: string,
): readonly ['mcp-status', 'advertised-tools', string] {
  return ['mcp-status', 'advertised-tools', title];
}

/** The MCP entry config schema (`GET /api/mcp-config/schema`). */
export const mcpConfigSchemaKey = ['mcp-config-schema'] as const;

/** The extension catalog the MCP tool composer draws from (`GET /api/extensions`). */
export const mcpExtensionsKey = ['mcp-extensions'] as const;

/**
 * The manifest MCP section's `!ENV` marker refs (`GET /api/manifest/mcp-env-refs`):
 * names and set/unset booleans only, never values.
 */
export const mcpEnvRefsKey = ['mcp-env-refs'] as const;

/** The installed marketplace inventory (`GET /api/marketplace/installed`). */
export const installedMarketplacePluginsKey = ['marketplace', 'installed'] as const;

/** One marketplace plugin's detail (`GET /api/marketplace/plugins/{ns}/{name}`), by its ref. */
export function marketplacePluginKey(ref: string): readonly ['marketplace', 'plugin', string] {
  return ['marketplace', 'plugin', ref];
}

/** The deployment env map (`GET /api/config/env` → `{ env, secret_keys }`). */
export const envConfigKey = ['env-config'] as const;
