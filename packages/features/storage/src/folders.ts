/**
 * Virtual folders for the storage explorer, derived from path-shaped resource ids.
 *
 * Virtual — a folder exists only through its members: every '/'-separated ancestor
 * prefix of an id becomes a folder, and none exists on its own.
 */
import type { Folder } from '@tai42/studio-sdk';

/** The parent directory prefix of a path-shaped id — `null` for a root-level id. */
export function parentPrefix(id: string): string | null {
  const cut = id.lastIndexOf('/');
  return cut === -1 ? null : id.slice(0, cut);
}

/**
 * The folder tree implied by `ids`: each ancestor prefix becomes a {@link Folder}
 * (`id` = the prefix, `name` = its final segment, `parentId` = the parent prefix).
 * The explorer name-sorts; this only guarantees one folder per distinct prefix.
 */
export function deriveFolders(ids: readonly string[]): Folder[] {
  const byId = new Map<string, Folder>();
  for (const id of ids) {
    for (let cut = id.indexOf('/'); cut !== -1; cut = id.indexOf('/', cut + 1)) {
      const prefix = id.slice(0, cut);
      if (byId.has(prefix)) continue;
      const parent = parentPrefix(prefix);
      byId.set(prefix, {
        id: prefix,
        name: parent === null ? prefix : prefix.slice(parent.length + 1),
        parentId: parent,
      });
    }
  }
  return [...byId.values()];
}
