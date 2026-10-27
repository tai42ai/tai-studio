/** TanStack Query keys for the agents feature. */

/** The full registered-agents list (`GET /api/agents`), shared with the route form. */
export { agentsListKey } from '@tai42/studio-sdk';

/** The authorable subset (`GET /api/agents/spec-runnable`) — the compose base picker. */
export const specRunnableAgentsKey = ['agents', 'spec-runnable'] as const;

/**
 * The default preset list (`GET /api/presets`) the authored-agents list derives
 * from (rows whose `base_tool` is an agent-tool). Namespaced under `agents` so it
 * never collides with the presets feature's own keys — features don't share keys.
 */
export const authoredPresetsKey = ['agents', 'authored', 'presets'] as const;

/** The tool universe (`GET /api/tools`) feeding the compose pickers. */
export const authoredToolsKey = ['agents', 'authored', 'tools'] as const;

/** Per-tool native tags (`GET /api/tools/tags`) feeding the ToolPicker grouping. */
export const authoredToolTagsKey = ['agents', 'authored', 'tool-tags'] as const;

/**
 * The tool_meta overlay (`GET /api/tool-meta`): the folder tree and the per-tool rows
 * the agents explorer files its entries by, and the compose pickers' effective-hidden
 * exclusion — one read, one key, refreshed after every folder write on this page.
 */
export const agentsToolMetaKey = ['agents', 'tool-meta'] as const;

/** One authored agent's detail (`GET /api/presets/{name}`) — its baked spec keys. */
export function authoredPresetKey(name: string): readonly ['agents', 'authored', 'preset', string] {
  return ['agents', 'authored', 'preset', name];
}
