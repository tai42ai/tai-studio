/**
 * TanStack Query key factory for the extensions surface. Centralising the keys
 * keeps the query definitions and the post-mutation invalidations referring to the
 * exact same tuples — no drift.
 *
 * The read-only catalog is keyed `['extensions']`. The "apply to a tool" panel's
 * reads are namespaced under `['extensions', 'apply', …]`: the tool universe and
 * the preset list feeding the picker/classifier, and a per-tool combos load keyed
 * by ORIGIN + name (a manifest tool and a same-named preset never share a cache
 * entry).
 *
 * `extensionsQueryKey` is also invalidated by the tools feature (a tool's
 * extension-combo save rebinds branch tools), so it is the authoritative SDK
 * constant, re-exported here so this feature's call sites import it by the same
 * local name.
 */
export { extensionsQueryKey } from '@tai42/studio-sdk';

/** The tool universe feeding the apply panel's `ToolPicker` + branch-tool refresh. */
export const applyToolsKey = ['extensions', 'apply', 'tools'] as const;

/** The preset list feeding the apply panel's origin classification. */
export const applyPresetsKey = ['extensions', 'apply', 'presets'] as const;

/** Native tool tags + plugin-declared visibility, for the picker's hidden exclusion. */
export const applyToolTagsKey = ['extensions', 'apply', 'tool-tags'] as const;

/** The tool_meta overlay, for the picker's effective-hidden exclusion. */
export const applyToolMetaKey = ['extensions', 'apply', 'tool-meta'] as const;

/** The origin a tool's extensions are read/written through. */
export type ToolExtensionsOrigin = 'manifest' | 'preset';

/** Key for a tool's current combos, keyed by origin + name (never shared). */
export function comboLoadKey(
  origin: ToolExtensionsOrigin,
  tool: string,
): readonly ['extensions', 'apply', 'combos', ToolExtensionsOrigin, string] {
  return ['extensions', 'apply', 'combos', origin, tool];
}
