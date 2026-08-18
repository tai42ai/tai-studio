/**
 * The per-tool DECLARED capability badges, shared by every surface that shows them:
 * the tools screen's list rows and every single-select tool picker that carries a
 * SELECTED value. A badge is INFORMATIONAL — it names what a tool touches (e.g.
 * `network`, `filesystem`) — never a gate the server enforces.
 *
 * The merge is the platform contract, held here ONCE so the list and the pickers can
 * never drift: a tool's badges are its plugin-DECLARED badges (`listToolTags`) UNIONED
 * with the operator's tool_meta overlay badges (`listToolMeta`), deduped and sorted.
 */
import type { ToolMetaRecord, ToolTagEntry } from '@tai42/api-client';

/**
 * A tool's effective badges: native ∪ overlay, deduped and case-insensitively sorted.
 * The atomic rule every badge surface merges by, so the tools list and the pickers
 * show one and the same set.
 */
export function mergeToolBadges(
  nativeBadges: readonly string[],
  overlayBadges: readonly string[],
): readonly string[] {
  return [...new Set([...nativeBadges, ...overlayBadges])].sort((a, b) => a.localeCompare(b));
}

/**
 * The raw-name → merged-badges map a tool picker reads to render the SELECTED tool's
 * badges, from the native declarations (`listToolTags`) merged with the tool_meta
 * overlay (`listToolMeta`) — the SAME union the tools list shows. Only tools with at
 * least one badge appear; a name with none is simply absent (the picker shows no
 * chips). Both sources' names are walked, so an overlay row that badges a tool
 * carrying no native tag entry is still surfaced.
 */
export function toolBadgesByName(
  tagEntries: readonly ToolTagEntry[],
  overlayRows: readonly ToolMetaRecord[],
): Readonly<Record<string, readonly string[]>> {
  const nativeByName = new Map(tagEntries.map((entry) => [entry.name, entry.badges]));
  const overlayByName = new Map(overlayRows.map((row) => [row.tool_name, row.badges]));
  const names = new Set<string>([...nativeByName.keys(), ...overlayByName.keys()]);

  const map: Record<string, readonly string[]> = {};
  for (const name of names) {
    const merged = mergeToolBadges(nativeByName.get(name) ?? [], overlayByName.get(name) ?? []);
    if (merged.length > 0) map[name] = merged;
  }
  return map;
}
