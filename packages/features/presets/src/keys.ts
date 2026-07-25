/**
 * TanStack Query key factory for the presets surface. Centralising the keys keeps
 * the query definitions and the post-mutation invalidations referring to the exact
 * same tuples — no drift.
 *
 * The management list is keyed `['presets', 'list']`; a single preset's detail
 * (record + active baked kwargs) `['presets', 'detail', name]`, and its version
 * history `['presets', 'versions', name]`. The create form's supporting reads are
 * SIBLINGS (never a prefix of the list), so invalidating the list after a mutation
 * does not also refetch the tool universe, the extension catalog, or the tags map.
 */

/** The root segment every presets query key shares. */
export const PRESETS_KEY_ROOT = 'presets';

/** Key for the preset management list (store-backed rows, including conflicted). */
export const presetsListKey = [PRESETS_KEY_ROOT, 'list'] as const;

/** Key for a single preset's detail (record + active baked kwargs), by name. */
export function presetDetailKey(
  name: string,
): readonly [typeof PRESETS_KEY_ROOT, 'detail', string] {
  return [PRESETS_KEY_ROOT, 'detail', name];
}

/** Key for a single preset's version history, by name. */
export function presetVersionsKey(
  name: string,
): readonly [typeof PRESETS_KEY_ROOT, 'versions', string] {
  return [PRESETS_KEY_ROOT, 'versions', name];
}

/** Key for a preset's referees (the presets that name it as a tool), by name. */
export function presetRefereesKey(
  name: string,
): readonly [typeof PRESETS_KEY_ROOT, 'referees', string] {
  return [PRESETS_KEY_ROOT, 'referees', name];
}

/** Key for the full tool-name universe feeding the create form's `ToolPicker`. */
export const presetToolsKey = [PRESETS_KEY_ROOT, 'tools'] as const;

/** Key for the per-tool native-tags map feeding the `ToolPicker` tag grouping. */
export const presetToolTagsKey = [PRESETS_KEY_ROOT, 'tool-tags'] as const;

/** Key for the extension catalog feeding the `ExtensionComboBuilder`. */
export const presetExtensionsKey = [PRESETS_KEY_ROOT, 'extensions'] as const;

/** Key for the agent-summary list feeding the create form's agent-tool labels. */
export const presetAgentsKey = [PRESETS_KEY_ROOT, 'agents'] as const;

/** Key for a base tool's params JSON schema (the create form's field hints). */
export function presetSchemaKey(
  baseTool: string,
): readonly [typeof PRESETS_KEY_ROOT, 'schema', string] {
  return [PRESETS_KEY_ROOT, 'schema', baseTool];
}
