/**
 * The merged per-tool view model the tools screen renders from three reads: the flat
 * tool names (`listTools`), each tool's native tags + plugin-declared visibility
 * (`listToolTags`), and the tool_meta overlay (`listToolMeta`).
 *
 * The merge rules are the platform contract:
 *  - label   = overlay `display_name` else the real name (`display_name ?? name`);
 *  - tags    = the UNION of native + overlay tags, deduped and sorted (merged
 *              everywhere; only the edit dialog shows the two apart);
 *  - hidden  = the overlay's tri-state OVERRIDE: `overlay.hidden` when it has an
 *              opinion (`true`/`false`), else the plugin's own declaration — so an
 *              overlay `false` unhides a plugin-hidden tool and `null` defers;
 *  - folder  = overlay `folder_id` else unfiled (`null`).
 */
import type { FolderRecord, ToolMetaRecord, ToolTagEntry } from '@tai42/api-client';
import { effectiveHidden, type Folder } from '@tai42/studio-sdk';

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
  readonly folderId: string | null;
  /** The EFFECTIVE visibility after the tri-state override. */
  readonly hidden: boolean;
  /** The raw overlay tri-state (`null` = defer), for the editor's three-way control. */
  readonly overlayHidden: boolean | null;
}

export function buildToolViews(
  names: readonly string[],
  tagEntries: readonly ToolTagEntry[],
  overlayRows: readonly ToolMetaRecord[],
): ToolView[] {
  const nativeByName = new Map(tagEntries.map((entry) => [entry.name, entry]));
  const overlayByName = new Map(overlayRows.map((row) => [row.tool_name, row]));

  return names.map((name) => {
    const native = nativeByName.get(name);
    const overlay = overlayByName.get(name);

    const nativeTags = native?.tags ?? [];
    const overlayTags = overlay?.tags ?? [];
    const tags = [...new Set([...nativeTags, ...overlayTags])].sort((a, b) => a.localeCompare(b));

    const overlayDisplayName = overlay?.display_name ?? null;
    const declaredHidden = native?.hidden ?? false;
    const overlayHidden = overlay?.hidden ?? null;

    return {
      name,
      displayName: overlayDisplayName ?? name,
      overlayDisplayName,
      hasCustomName: overlayDisplayName !== null,
      nativeTags,
      overlayTags,
      tags,
      folderId: overlay?.folder_id ?? null,
      hidden: effectiveHidden(overlayHidden, declaredHidden),
      overlayHidden,
    };
  });
}

/** Map the overlay's folder records into the SDK's camelCase folder shape. */
export function toFolders(records: readonly FolderRecord[]): Folder[] {
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    parentId: record.parent_id,
  }));
}
