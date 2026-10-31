/**
 * TanStack Query key factory for the tools surface. The master list is
 * keyed `['tools']`; a single tool's params schema is keyed `['tool-schema',
 * name]`. Centralising the keys keeps the query definitions and any later
 * invalidations referring to the exact same tuples.
 *
 * `toolsListKey` (another feature also invalidates it: a preset mutation changes the
 * registered-tool population) and `toolTagsKey` (other features' tool pickers read
 * the same declarations) are authoritative SDK constants, re-exported here so this
 * feature's call sites import them by the same local name.
 */
export { toolsListKey, toolTagsKey } from '@tai42/studio-sdk';

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
