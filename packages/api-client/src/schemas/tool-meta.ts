/** Tool-organization overlay (folders and per-tool meta) schemas. */
import { z } from 'zod';

/**
 * One folder in the tool-organization tree (`tool_folders`). `parent_id` is `null`
 * for a root folder and otherwise the containing folder's `id`; nesting is endless
 * via the parent chain. Ids are UUID strings. A drift throws `ApiSchemaError`.
 */
export const folderRecord = z.object({
  id: z.string(),
  name: z.string(),
  parent_id: z.string().nullable(),
});
export type FolderRecord = z.infer<typeof folderRecord>;

/**
 * The organizational overlay for one tool, keyed by `tool_name`. `display_name`
 * overrides the rendered label (`display_name ?? name`); `folder_id` places the tool
 * in a folder (`null` = unfiled); `tags` is the user's editable categorization,
 * merged with the tool's read-only native tags by the UI; `badges` is the operator's
 * editable capability-label overlay, merged with the tool's read-only plugin-declared
 * badges by the UI (INFORMATIONAL, never an enforced gate); `hidden` is TRI-STATE —
 * `null` = defer to the plugin declaration, `true` = force hidden, `false` = force
 * visible. A drift throws `ApiSchemaError`.
 */
export const toolMetaRecord = z.object({
  tool_name: z.string(),
  display_name: z.string().nullable(),
  folder_id: z.string().nullable(),
  tags: z.array(z.string()),
  badges: z.array(z.string()),
  hidden: z.boolean().nullable(),
});
export type ToolMetaRecord = z.infer<typeof toolMetaRecord>;

/**
 * `GET /api/tool-meta` — the whole overlay in one read: the flat folder tree plus
 * every per-tool row. The UI builds the tree and merges the rows against the live
 * tool list client-side. A drift throws `ApiSchemaError`.
 */
export const toolMetaOverlay = z.object({
  folders: z.array(folderRecord),
  meta: z.array(toolMetaRecord),
});
export type ToolMetaOverlay = z.infer<typeof toolMetaOverlay>;

/** `DELETE /api/tool-meta/tools/{tool_name}` — the dropped overlay row (idempotent). */
export const toolMetaDeleted = z.object({ tool_name: z.string(), deleted: z.literal(true) });

/** `DELETE /api/tool-meta/folders/{folder_id}` — the removed empty folder. */
export const folderDeleted = z.object({ folder_id: z.string(), deleted: z.literal(true) });
