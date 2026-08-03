/**
 * Virtual folders for the templates explorer: a folder exists only through its
 * members — each '/'-separated ancestor prefix of a path-shaped key becomes a folder,
 * none on its own. Two invariants:
 *
 *  - A key with an empty path segment (leading/trailing `/` or internal `//`) is
 *    MALFORMED: it derives no folder and files at the root, so no phantom `''` folder
 *    appears.
 *  - A key that is also another key's folder prefix (`a` beside `a/b`) is both a root
 *    file AND the folder `a`; both must show.
 */
import type { Folder } from '@tai42/studio-sdk';

/** True when a key names a real path: every '/'-separated segment is non-empty. */
export function isPathShaped(key: string): boolean {
  return key.length > 0 && !key.split('/').some((segment) => segment.length === 0);
}

/**
 * The folder a key is filed under: the prefix before its final `/`, or `null` for a
 * root-level key. A malformed key (an empty segment) files at the root so it renders
 * literally rather than under a phantom `''` folder.
 */
export function templateFolderId(key: string): string | null {
  if (!isPathShaped(key)) return null;
  const cut = key.lastIndexOf('/');
  return cut === -1 ? null : key.slice(0, cut);
}

/**
 * The folder tree implied by `keys`: each ancestor prefix of a path-shaped key
 * becomes a {@link Folder} (`id` = the prefix, `name` = its final segment,
 * `parentId` = the parent prefix). Malformed keys contribute no folder. One folder
 * per distinct prefix; the explorer name-sorts.
 */
export function deriveTemplateFolders(keys: readonly string[]): Folder[] {
  const byId = new Map<string, Folder>();
  for (const key of keys) {
    if (!isPathShaped(key)) continue;
    for (let cut = key.indexOf('/'); cut !== -1; cut = key.indexOf('/', cut + 1)) {
      const prefix = key.slice(0, cut);
      if (byId.has(prefix)) continue;
      const parentCut = prefix.lastIndexOf('/');
      byId.set(prefix, {
        id: prefix,
        name: parentCut === -1 ? prefix : prefix.slice(parentCut + 1),
        parentId: parentCut === -1 ? null : prefix.slice(0, parentCut),
      });
    }
  }
  return [...byId.values()];
}

/**
 * The label a key shows in its row/card: its final segment (the breadcrumb carries
 * the folder path). A malformed key shows in full so its oddity is visible rather
 * than masquerading as a plain leaf name.
 */
export function templateLabel(key: string): string {
  if (!isPathShaped(key)) return key;
  const cut = key.lastIndexOf('/');
  return cut === -1 ? key : key.slice(cut + 1);
}
