/**
 * The merged per-tool view model the tools screen renders from three reads: the flat
 * tool names (`listTools`), each tool's native tags + plugin-declared visibility
 * (`listToolTags`), and the tool_meta overlay (`listToolMeta`).
 *
 * The merge rules are the platform contract:
 *  - label   = overlay `display_name` else the real name (`display_name ?? name`);
 *  - tags    = the UNION of native + overlay tags, deduped and sorted (merged
 *              everywhere; only the edit dialog shows the two apart);
 *  - badges  = the UNION of native + overlay badges, deduped and sorted — the
 *              tool's DECLARED, informational capability labels, never a gate;
 *  - hidden  = the overlay's tri-state OVERRIDE: `overlay.hidden` when it has an
 *              opinion (`true`/`false`), else the plugin's own declaration — so an
 *              overlay `false` unhides a plugin-hidden tool and `null` defers;
 *  - folder  = overlay `folder_id` else unfiled (`null`).
 */
import type { FolderRecord, ToolMetaRecord, ToolTagEntry } from '@tai42/api-client';
import { effectiveHidden, mergeToolBadges, type Folder } from '@tai42/studio-sdk';

export interface ToolView {
  readonly name: string;
  /** `display_name ?? name` — what the list renders as the primary label. */
  readonly displayName: string;
  /** The raw overlay override (`null` = no override), for prefilling the editor. */
  readonly overlayDisplayName: string | null;
  readonly hasCustomName: boolean;
  readonly nativeTags: readonly string[];
  readonly overlayTags: readonly string[];
  /** Native ∪ overlay, deduped + sorted — the tags every non-edit surface groups by. */
  readonly tags: readonly string[];
  readonly nativeBadges: readonly string[];
  readonly overlayBadges: readonly string[];
  /** Native ∪ overlay, deduped + sorted — the declared badges every surface shows. */
  readonly badges: readonly string[];
  readonly folderId: string | null;
  /** The EFFECTIVE visibility after the tri-state override. */
  readonly hidden: boolean;
  /** The raw overlay tri-state (`null` = defer), for the editor's three-way control. */
  readonly overlayHidden: boolean | null;
}

/** Native ∪ overlay tags, deduped and locale-sorted. */
function mergeTags(nativeTags: readonly string[], overlayTags: readonly string[]): string[] {
  return [...new Set([...nativeTags, ...overlayTags])].sort((a, b) => a.localeCompare(b));
}

/** Native ∪ overlay badges, deduped and sorted (the SDK's merge). */
function mergeBadgesFor(
  nativeBadges: readonly string[],
  overlayBadges: readonly string[],
): readonly string[] {
  return mergeToolBadges(nativeBadges, overlayBadges);
}

/** The display label parts: `display_name ?? name`, the raw override, and whether one is set. */
function nameParts(
  name: string,
  overlay: ToolMetaRecord | undefined,
): { displayName: string; overlayDisplayName: string | null; hasCustomName: boolean } {
  const overlayDisplayName = overlay?.display_name ?? null;
  return {
    displayName: overlayDisplayName ?? name,
    overlayDisplayName,
    hasCustomName: overlayDisplayName !== null,
  };
}

/** The effective visibility after the overlay's tri-state override, plus the raw tri-state. */
function visibility(
  native: ToolTagEntry | undefined,
  overlay: ToolMetaRecord | undefined,
): { hidden: boolean; overlayHidden: boolean | null } {
  const overlayHidden = overlay?.hidden ?? null;
  return { hidden: effectiveHidden(overlayHidden, native?.hidden ?? false), overlayHidden };
}

/** The merged view model for one tool from its native tag entry and overlay row. */
function toolViewFor(
  name: string,
  native: ToolTagEntry | undefined,
  overlay: ToolMetaRecord | undefined,
): ToolView {
  const nativeTags = native?.tags ?? [];
  const overlayTags = overlay?.tags ?? [];
  const nativeBadges = native?.badges ?? [];
  const overlayBadges = overlay?.badges ?? [];
  return {
    name,
    ...nameParts(name, overlay),
    nativeTags,
    overlayTags,
    tags: mergeTags(nativeTags, overlayTags),
    nativeBadges,
    overlayBadges,
    badges: mergeBadgesFor(nativeBadges, overlayBadges),
    folderId: overlay?.folder_id ?? null,
    ...visibility(native, overlay),
  };
}

export function buildToolViews(
  names: readonly string[],
  tagEntries: readonly ToolTagEntry[],
  overlayRows: readonly ToolMetaRecord[],
): ToolView[] {
  const nativeByName = new Map(tagEntries.map((entry) => [entry.name, entry]));
  const overlayByName = new Map(overlayRows.map((row) => [row.tool_name, row]));
  return names.map((name) => toolViewFor(name, nativeByName.get(name), overlayByName.get(name)));
}

/** Case-insensitive substring over a tool's real name and display label. */
export function toolMatches(view: ToolView, query: string): boolean {
  const needle = query.toLowerCase();
  return (
    view.name.toLowerCase().includes(needle) || view.displayName.toLowerCase().includes(needle)
  );
}

/** Map the overlay's folder records into the SDK's camelCase folder shape. */
export function toFolders(records: readonly FolderRecord[]): Folder[] {
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    parentId: record.parent_id,
  }));
}
