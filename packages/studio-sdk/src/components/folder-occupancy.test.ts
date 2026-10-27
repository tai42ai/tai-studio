import { describe, expect, it, vi } from 'vitest';

import type { Folder } from './folder-nav';
import { foldersForView } from './folder-occupancy';

const folder = (id: string, parentId: string | null = null): Folder => ({
  id,
  name: id,
  parentId,
});

const row = (toolName: string, folderId: string | null) => ({
  tool_name: toolName,
  folder_id: folderId,
});

/** `items` behind a proxy that counts the element reads made through it. */
function countingReads<T>(items: readonly T[]): { array: readonly T[]; reads: () => number } {
  let reads = 0;
  const array = new Proxy(items, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1;
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  return { array, reads: () => reads };
}

const ids = (folders: readonly Folder[]): string[] => folders.map((f) => f.id);

describe('foldersForView', () => {
  it('draws a folder that holds one of the screen items', () => {
    const shown = foldersForView([folder('a')], [row('mine', 'a')], new Set(['mine']));
    expect(ids(shown)).toEqual(['a']);
  });

  it('draws a folder that holds no tool at all', () => {
    const shown = foldersForView([folder('empty')], [], new Set(['mine']));
    expect(ids(shown)).toEqual(['empty']);
  });

  it('does not draw a folder that holds only other tools', () => {
    const shown = foldersForView([folder('theirs')], [row('other', 'theirs')], new Set(['mine']));
    expect(shown).toEqual([]);
  });

  it('draws a mixed folder', () => {
    const shown = foldersForView(
      [folder('mixed')],
      [row('other', 'mixed'), row('mine', 'mixed')],
      new Set(['mine']),
    );
    expect(ids(shown)).toEqual(['mixed']);
  });

  it('draws every ancestor of a folder holding a screen item, however deep', () => {
    const folders = [folder('top'), folder('mid', 'top'), folder('leaf', 'mid')];
    const shown = foldersForView(
      folders,
      [row('other', 'top'), row('other-2', 'mid'), row('mine', 'leaf')],
      new Set(['mine']),
    );
    expect(ids(shown)).toEqual(['top', 'mid', 'leaf']);
  });

  it('drops a whole subtree that holds only other tools', () => {
    const folders = [folder('top'), folder('child', 'top')];
    const shown = foldersForView(folders, [row('other', 'child')], new Set(['mine']));
    expect(shown).toEqual([]);
  });

  it('keeps an empty subfolder reachable by drawing its parent, even when the parent holds only other tools', () => {
    const folders = [folder('top'), folder('fresh', 'top')];
    const shown = foldersForView(folders, [row('other', 'top')], new Set(['mine']));
    expect(ids(shown)).toEqual(['top', 'fresh']);
  });

  it('counts every overlay row as occupancy, whether or not the tool is listed anywhere', () => {
    // A row of a tool no screen lists (hidden, or no longer registered) still fills
    // its folder, so the folder is not offered as empty.
    const shown = foldersForView([folder('kept')], [row('gone', 'kept')], new Set());
    expect(shown).toEqual([]);
  });

  it('ignores unfiled rows and rows filed into a folder that does not exist', () => {
    const shown = foldersForView(
      [folder('a')],
      [row('other', null), row('other-2', 'missing')],
      new Set(['mine']),
    );
    expect(ids(shown)).toEqual(['a']);
  });

  it('draws the whole tree when the population is every tool', () => {
    const folders = [folder('a'), folder('b', 'a'), folder('c')];
    const rows = [row('t1', 'a'), row('t2', 'b'), row('t3', 'c')];
    const shown = foldersForView(folders, rows, new Set(['t1', 't2', 't3']));
    expect(ids(shown)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the input order', () => {
    const folders = [folder('z'), folder('a')];
    const shown = foldersForView(
      folders,
      [row('mine', 'a'), row('mine-2', 'z')],
      new Set(['mine', 'mine-2']),
    );
    expect(ids(shown)).toEqual(['z', 'a']);
  });

  it('terminates on a cyclic parent chain with a bounded result', () => {
    // x and y are each other's parent. The walk from x reaches y, finds x already on the
    // path and stops: y holds nothing (drawn as a fresh folder) and x is drawn as y's
    // ancestor.
    const folders = [folder('x', 'y'), folder('y', 'x')];
    const shown = foldersForView(folders, [row('other', 'x')], new Set(['mine']));
    expect(ids(shown)).toEqual(['x', 'y']);
  });

  it('does linear work on a large tree', () => {
    // A 2,000-deep chain with 5,000 rows. The work is counted, not timed: every input
    // element is read a fixed number of times (a per-folder rescan of the rows or the
    // folders would read them once per folder) and the Map lookups grow with
    // folders + rows (a subtree walk without its memo would grow with depth squared).
    const folderList: Folder[] = [];
    for (let i = 0; i < 2000; i += 1)
      folderList.push(folder(`f${String(i)}`, i === 0 ? null : `f${String(i - 1)}`));
    const rowList = Array.from({ length: 5000 }, (_, i) =>
      row(`t${String(i)}`, `f${String(i % 2000)}`),
    );
    const folders = countingReads(folderList);
    const rows = countingReads(rowList);
    const mapGet = vi.spyOn(Map.prototype, 'get');
    let shown: Folder[];
    let lookups: number;
    try {
      shown = foldersForView(folders.array, rows.array, new Set(['t4999']));
      lookups = mapGet.mock.calls.length;
    } finally {
      mapGet.mockRestore();
    }
    expect(folders.reads()).toBeLessThanOrEqual(2 * folderList.length);
    expect(rows.reads()).toBeLessThanOrEqual(rowList.length);
    expect(lookups).toBeLessThanOrEqual(4 * (folderList.length + rowList.length));
    // t4999 sits in f999, so f0..f999 are drawn (f999 and its ancestors); deeper ones hold only other tools.
    expect(shown).toHaveLength(1000);
  });
});
