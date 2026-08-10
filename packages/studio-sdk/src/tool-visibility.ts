/**
 * The tool-visibility tri-state, shared by every surface that must honor it: the
 * tools screen's list (and its "show hidden" toggle) and every tool picker.
 *
 * EFFECTIVE hidden is the overlay's tri-state OVERRIDE of the plugin's own
 * declaration: an overlay opinion (`true`/`false`) wins, else the plugin
 * declaration stands. So an overlay `false` UNHIDES a plugin-hidden tool, `true`
 * force-hides, and `null` (no overlay row is the same) DEFERS to the declaration.
 * The rule lives here ONCE so the list-exclusion and
 * the picker-exclusion can never drift apart.
 */
import type { ToolMetaRecord, ToolTagEntry } from '@tai42/api-client';

/**
 * Effective hidden after the tri-state override. `overlayHidden` is the overlay's
 * `hidden` (`true`/`false`), or `null`/`undefined` when the overlay defers or has
 * no row; `declaredHidden` is the plugin's own `hidden`. Overlay opinion wins;
 * absence defers to the declaration.
 */
export function effectiveHidden(
  overlayHidden: boolean | null | undefined,
  declaredHidden: boolean,
): boolean {
  return overlayHidden ?? declaredHidden;
}

/**
 * The set of tool names whose EFFECTIVE visibility is hidden, from the native
 * declarations (`listToolTags`) merged with the tool_meta overlay (`listToolMeta`).
 * A picker excludes exactly these names from its options; the server stays the
 * authority (a slipped-through name is rejected loudly there), so a name in the set
 * that is not among a picker's options is simply inert.
 *
 * The union of both sources is walked so an overlay row that force-hides a tool
 * carrying no native tag entry is still caught, and an overlay `false` on a
 * plugin-hidden tool correctly keeps it OUT of the set (unhidden).
 */
export function hiddenToolNames(
  tagEntries: readonly ToolTagEntry[],
  overlayRows: readonly ToolMetaRecord[],
): Set<string> {
  const declaredByName = new Map(tagEntries.map((entry) => [entry.name, entry.hidden]));
  const overlayByName = new Map(overlayRows.map((row) => [row.tool_name, row.hidden]));
  const names = new Set<string>([...declaredByName.keys(), ...overlayByName.keys()]);

  const hidden = new Set<string>();
  for (const name of names) {
    if (effectiveHidden(overlayByName.get(name) ?? null, declaredByName.get(name) ?? false)) {
      hidden.add(name);
    }
  }
  return hidden;
}
