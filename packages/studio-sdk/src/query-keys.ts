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
 * The extension catalog (`GET /api/extensions`). The extensions feature keys its
 * read-only catalog on it; a tool's extension-combo save (in the tools feature)
 * creates or tears down branch tools, so it invalidates this key too — a
 * cross-feature reference that must resolve to one authoritative constant.
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
