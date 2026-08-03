/**
 * TanStack Query key factory for the manifest surface. Centralising the keys
 * keeps the query definitions and the post-mutation invalidations referring to
 * the exact same tuples.
 *
 * `subMcpKey` is the one key another feature (settings) also reads, so it is the
 * authoritative SDK constant, re-exported here under the same local name for this
 * feature's call sites.
 */
export { subMcpKey } from '@tai42/studio-sdk';

/** Key for the skeleton's loaded manifest (`GET /api/manifest`). */
export const manifestKey = ['manifest'] as const;

/** Key for the mounted MCP servers' status (`GET /api/mcp-status`). */
export const mcpStatusKey = ['mcp-status'] as const;

/** Key for the MCP entry config schema (`GET /api/mcp-config/schema`). */
export const mcpConfigSchemaKey = ['mcp-config-schema'] as const;

/** Key for the tool names a new sub-MCP entry can curate (`GET /api/tools`). */
export const subMcpAvailableToolsKey = ['sub-mcp-available-tools'] as const;

/** Key for the extension catalog the MCP tool composer draws from (`GET /api/extensions`). */
export const mcpExtensionsKey = ['mcp-extensions'] as const;
