/**
 * TanStack Query key factory for the tools surface. The master list is
 * keyed `['tools']`; a single tool's params schema is keyed `['tool-schema',
 * name]`. Centralising the keys keeps the query definitions and any later
 * invalidations referring to the exact same tuples.
 *
 * `toolsListKey` is the one key another feature also invalidates (a preset
 * mutation changes the registered-tool population), so it is the authoritative
 * SDK constant, re-exported here so this feature's call sites import it by the
 * same local name.
 */
export { toolsListKey } from '@tai42/studio-sdk';

/** Key for a single tool's params JSON schema, by tool name. */
export function toolSchemaKey(name: string): readonly ['tool-schema', string] {
  return ['tool-schema', name];
}

/** Key for a tool's authored extension combos + catalog, by tool name. */
export function toolExtensionsKey(name: string): readonly ['tools', 'extensions', string] {
  return ['tools', 'extensions', name];
}

/**
 * The preset list (`GET /api/presets`), read by the tool-extensions card to tell a
 * preset tool (authored through its preset) from a manifest tool (authored here).
 */
export const toolPresetsKey = ['tools', 'presets'] as const;

/** The per-tool native tags (`GET /api/tools/tags`), feeding the tag filter + grouping. */
export const toolTagsKey = ['tools', 'tags'] as const;

/** The tool_meta overlay (`GET /api/tool-meta`): folder tree + per-tool display
 * name / tags / folder / visibility, merged onto the native reads. A write through
 * `upsertToolMeta` invalidates this key. */
export const toolMetaKey = ['tools', 'tool-meta'] as const;
