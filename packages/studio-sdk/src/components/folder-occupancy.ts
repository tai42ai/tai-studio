/**
 * Which folders of the ONE tool-organization tree a screen draws. Every tool has one
 * folder; a screen lists only its own population (a subset of the tools), so it draws
 * only the part of the tree that concerns that population:
 *
 *  - a folder whose subtree holds at least one of the screen's items is drawn;
 *  - a folder whose subtree holds no tool at all is drawn (a fresh folder belongs to
 *    every screen until something is filed in it);
 *  - a folder whose subtree holds only other tools is not drawn;
 *  - the ancestors of a drawn folder are drawn, so every drawn folder stays reachable
 *    from the root.
 *
 * Occupancy counts EVERY overlay row with a `folder_id` — hidden tools and rows of
 * tools no longer registered included — so a folder never reads as empty while it
 * still holds something. A screen whose population is every tool draws the whole tree.
 */
import type { ToolMetaRecord } from '@tai42/api-client';

import type { Folder } from './folder-nav';

/** What a folder's subtree holds, and whether the folder is drawn. */
interface SubtreeState {
  readonly own: boolean;
  readonly any: boolean;
  readonly drawn: boolean;
}

const NOTHING: SubtreeState = { own: false, any: false, drawn: false };

/**
 * The folders a screen draws, in the input order.
 *
 * `rows` are the overlay rows (each tool's `folder_id`), `population` the tool names
 * the screen lists. Linear in folders + rows; the subtree walk is cycle-guarded, so a
 * malformed parent chain yields a bounded result rather than looping.
 */
export function foldersForView(
  folders: readonly Folder[],
  rows: readonly Pick<ToolMetaRecord, 'tool_name' | 'folder_id'>[],
  population: ReadonlySet<string>,
): Folder[] {
  const direct = new Map<string, { own: boolean; any: boolean }>();
  for (const row of rows) {
    if (row.folder_id === null) continue;
    const entry = direct.get(row.folder_id) ?? { own: false, any: false };
    entry.any = true;
    if (population.has(row.tool_name)) entry.own = true;
    direct.set(row.folder_id, entry);
  }

  const childrenByParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId === null) continue;
    const siblings = childrenByParent.get(folder.parentId) ?? [];
    siblings.push(folder.id);
    childrenByParent.set(folder.parentId, siblings);
  }

  const settled = new Map<string, SubtreeState>();
  const visiting = new Set<string>();
  const stateOf = (id: string): SubtreeState => {
    const cached = settled.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return NOTHING;
    visiting.add(id);
    const held = direct.get(id);
    let own = held?.own ?? false;
    let any = held?.any ?? false;
    let childDrawn = false;
    for (const childId of childrenByParent.get(id) ?? []) {
      const child = stateOf(childId);
      own = own || child.own;
      any = any || child.any;
      childDrawn = childDrawn || child.drawn;
    }
    visiting.delete(id);
    const state = { own, any, drawn: own || !any || childDrawn };
    settled.set(id, state);
    return state;
  };

  return folders.filter((folder) => stateOf(folder.id).drawn);
}
