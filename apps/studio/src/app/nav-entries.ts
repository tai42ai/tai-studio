/**
 * Pure placement and ordering rules for plugin-contributed nav entries: which core
 * section an entry targets (or the generic Plugins section), the in-section render
 * order, the registry key, and the single-winner active-entry choice. No React.
 */
import type { RegisteredNavEntry } from '@tai42/studio-sdk';

import { NAV_SECTIONS } from './routes';
import { pathHasPrefix } from './plugin-page-resolve';

/** Plugin id → its version, for the provenance badge. */
export type PluginVersions = ReadonlyMap<string, string>;

/** The core section labels a plugin nav entry may target. */
const CORE_SECTION_LABELS: ReadonlySet<string> = new Set(NAV_SECTIONS.map((s) => s.label));

/** The label of the single generic section that collects every plugin nav entry
 * naming no core section. Rendered AFTER the core sections; not itself a core
 * section, so it never appears in {@link CORE_SECTION_LABELS}. */
export const PLUGINS_SECTION_LABEL = 'Plugins';

/**
 * The CORE section a plugin nav entry targets, or `null` when it names none — an absent
 * field, or any value that is not a live core section (a bundle newer than this host).
 * A `null` result renders the entry in the generic {@link PLUGINS_SECTION_LABEL} section.
 * Tolerant by design: the field is a placement hint, not a hard contract.
 */
export function coreSectionOf(entry: RegisteredNavEntry): string | null {
  if (entry.section === undefined) return null;
  return CORE_SECTION_LABELS.has(entry.section) ? entry.section : null;
}

/**
 * Nav entries in render order WITHIN a section: ascending `order`, every entry that
 * omits it AFTER the ordered ones, ties broken by registration order. `Array.sort`
 * is stable (ES2019+), so equal keys keep their incoming (registration) order, and a
 * missing `order` sorts as +∞ so it always trails an explicit weight.
 */
export function sortNavEntries(entries: readonly RegisteredNavEntry[]): RegisteredNavEntry[] {
  return [...entries].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
}

/**
 * The entries that name no core section, in render order for the single generic
 * {@link PLUGINS_SECTION_LABEL} section: sorted by {@link sortNavEntries} across ALL
 * contributing plugins. Entries from different plugins INTERLEAVE by those same rules —
 * ascending `order`, absent last, ties broken by registration order — because the
 * incoming array is already in registration order and the sort is stable. There is no
 * per-plugin grouping or header: multiple plugins share this one section, so each entry
 * keeps its own self-identifying title and carries its own per-entry provenance badge
 * (the section header cannot name any single plugin).
 */
export function pluginSectionEntries(entries: readonly RegisteredNavEntry[]): RegisteredNavEntry[] {
  return sortNavEntries(entries.filter((entry) => coreSectionOf(entry) === null));
}

/** The registry key of a nav entry — its owner + page path, unique across plugins. */
export function navEntryKey(entry: RegisteredNavEntry): string {
  return `${entry.pluginId}/${entry.path}`;
}

/**
 * The key of the SINGLE nav entry that owns the current pathname, or undefined when
 * none matches. The winner is the entry whose href is the LONGEST prefix of the
 * pathname under the shared `/`-boundary rule ({@link pathHasPrefix}), mirroring the
 * page resolver's longest-prefix single-winner choice. When a plugin registers nested
 * entries that share a prefix, a deep link under the child highlights only the deepest
 * match, so exactly one row carries `aria-current="page"`; the ordinary single-entry
 * deep link still highlights its one entry.
 */
export function activeNavKey(
  entries: readonly RegisteredNavEntry[],
  pathname: string,
): string | undefined {
  let winner: RegisteredNavEntry | undefined;
  let winnerHrefLength = -1;
  for (const entry of entries) {
    const href = `/plugins/${entry.pluginId}/${entry.path}`;
    if (pathHasPrefix(pathname, href) && href.length > winnerHrefLength) {
      winner = entry;
      winnerHrefLength = href.length;
    }
  }
  return winner === undefined ? undefined : navEntryKey(winner);
}
