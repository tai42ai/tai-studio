/**
 * One preset's projection of the tool_meta overlay read: its overlay row's display
 * name, tags and folder (each defaulting when the preset has no row yet), plus the
 * full folder tree its folder field offers. Pure; one linear scan of the rows.
 */
import type { ToolMetaOverlay } from '@tai42/api-client';
import { type Folder, toFolders } from '@tai42/studio-sdk';

export interface PresetOverlay {
  readonly displayName: string | null;
  readonly tags: readonly string[];
  readonly folderId: string | null;
  readonly folders: readonly Folder[];
}

/** The overlay as it applies to the preset whose tool is `toolName`; `overlay` is
 *  `undefined` while the read loads or after it failed. */
export function presetOverlay(
  overlay: ToolMetaOverlay | undefined,
  toolName: string,
): PresetOverlay {
  const row = overlay?.meta.find((entry) => entry.tool_name === toolName);
  return {
    displayName: row?.display_name ?? null,
    tags: row?.tags ?? [],
    folderId: row?.folder_id ?? null,
    folders: toFolders(overlay?.folders ?? []),
  };
}
