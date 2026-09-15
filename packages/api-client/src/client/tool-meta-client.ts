/** Tool-organization overlay (folders and meta) sub-client. */
import { encodeSegment } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

/**
 * Merge-patch body for a tool's overlay row (PATCH
 * `/api/tool-meta/tools/{tool_name}`). Only the fields PRESENT are written; a
 * present-null clears (`hidden: null` writes the tri-state "defer to the plugin
 * declaration" state, `display_name: null` clears the label, `folder_id: null`
 * unfiles); a present `tags` array replaces the whole set. Absent fields are left
 * untouched — there is no full-row replace, so a display-name+tags editor sends
 * ONLY those two keys with no risk to `folder_id`/`hidden`. At least one field must
 * be present. A blank/whitespace-only `display_name` is rejected by the API (422) —
 * callers map an emptied label to `null`, never `""`. A present `badges` array
 * replaces the whole overlay set (INFORMATIONAL labels, never an enforced gate).
 */
export interface ToolMetaPatch {
  readonly display_name?: string | null;
  readonly folder_id?: string | null;
  readonly tags?: readonly string[];
  readonly badges?: readonly string[];
  readonly hidden?: boolean | null;
}

export function toolMetaClient(t: Transport) {
  const { req } = t;
  return {
    // The folder tree + per-tool overlay rows in one read; the features merge the
    // rows against the live tool list and native tags client-side.
    listToolMeta: (signal?: AbortSignal) => req('/api/tool-meta', s.toolMetaOverlay, { signal }),
    // Merge-patch a tool's overlay row (create it if absent). `patch` carries ONLY
    // the fields to change — a present-null clears, an absent field is untouched,
    // and a present `tags` array replaces the set.
    upsertToolMeta: (toolName: string, patch: ToolMetaPatch) =>
      req(`/api/tool-meta/tools/${encodeSegment(toolName)}`, s.toolMetaRecord, {
        method: 'PATCH',
        body: patch,
      }),
    deleteToolMeta: (toolName: string) =>
      req(`/api/tool-meta/tools/${encodeSegment(toolName)}`, s.toolMetaDeleted, {
        method: 'DELETE',
      }),
    createFolder: (name: string, parentId: string | null = null) =>
      req('/api/tool-meta/folders', s.folderRecord, {
        method: 'POST',
        body: { name, parent_id: parentId },
      }),
    renameFolder: (folderId: string, name: string) =>
      req(`/api/tool-meta/folders/${encodeSegment(folderId)}/rename`, s.folderRecord, {
        method: 'POST',
        body: { name },
      }),
    // `null` re-parents to the root.
    moveFolder: (folderId: string, parentId: string | null) =>
      req(`/api/tool-meta/folders/${encodeSegment(folderId)}/move`, s.folderRecord, {
        method: 'POST',
        body: { parent_id: parentId },
      }),
    deleteFolder: (folderId: string) =>
      req(`/api/tool-meta/folders/${encodeSegment(folderId)}`, s.folderDeleted, {
        method: 'DELETE',
      }),
  };
}
