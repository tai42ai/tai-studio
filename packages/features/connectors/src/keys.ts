/**
 * TanStack Query keys for the connectors surface. Centralised so the queries
 * and the mutations that invalidate them can never drift apart.
 */
export const PROVIDERS_KEY = ['providers'] as const;
export const CONNECTIONS_KEY = ['connections'] as const;

/** The key for a single connection's detail record. */
export function connectionKey(id: string): readonly ['connection', string] {
  return ['connection', id];
}

// -- MCP servers (the unified Connectors page's MCP section) ------------------
//
// These read the same server doors the manifest surface does. React-Query matches
// keys STRUCTURALLY, so several of these mirror the exact tuple VALUE another
// feature owns (its authoritative home noted per key) — a mutation here invalidates
// that feature's read all the same, and vice versa.

/** Key for the skeleton's RESOLVED manifest (`GET /api/manifest`). The MCP config
 * save invalidates it so the manifest artifact view (feature-manifest, its owner)
 * re-reads. Mirror the SAME tuple as `@tai42/feature-manifest`' `manifestKey`. */
export const manifestKey = ['manifest'] as const;

/**
 * Key for the PRESERVED manifest (`GET /api/manifest/preserved`) — `!ENV ${KEY}`
 * markers intact, no resolved secrets. A DEDICATED key, never `manifestKey`: sharing
 * one would collide the resolved and reference-preserving views in the cache. The MCP
 * config editor reads/round-trips this so a raw edit never inlines a resolved secret
 * value over its reference.
 */
export const preservedManifestKey = ['manifest', 'preserved'] as const;

/** Key for the mounted MCP servers' status (`GET /api/mcp-status`). */
export const mcpStatusKey = ['mcp-status'] as const;

/** Key for the MCP entry config schema (`GET /api/mcp-config/schema`). */
export const mcpConfigSchemaKey = ['mcp-config-schema'] as const;

/** Key for the extension catalog the MCP tool composer draws from (`GET /api/extensions`). */
export const mcpExtensionsKey = ['mcp-extensions'] as const;

/**
 * Key for the manifest MCP section's `!ENV` marker refs (`GET /api/manifest/mcp-env-refs`)
 * — NAMES + set/unset booleans only, never values. Feeds the MCP env-refs checklist.
 */
export const mcpEnvRefsKey = ['mcp-env-refs'] as const;

/**
 * Key for the installed marketplace inventory (`GET /api/marketplace/installed`). The
 * MCP section joins each row's mcp-server item names against the manifest's mcp-entry
 * titles to mark an installer-written entry read-only. Mirrors the SAME tuple the
 * marketplace feature owns so React-Query shares the one cache entry.
 */
export const installedMarketplacePluginsKey = ['marketplace', 'installed'] as const;

/**
 * Key for the deployment env map (`GET /api/config/env` → `{ env, secret_keys }`).
 * The AUTHORITATIVE owner is the settings feature (its EnvironmentTab holds the
 * query); the feature-layer import boundary forbids reaching across to it, so this
 * mirrors the SAME tuple VALUE. Keep in lockstep with `@tai42/feature-settings`'
 * `envConfigKey`.
 */
export const envConfigKey = ['env-config'] as const;
