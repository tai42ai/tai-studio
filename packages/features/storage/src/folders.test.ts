/**
 * Unit tests for the virtual-folder derivation: every '/'-separated ancestor prefix
 * of a resource id becomes a folder, a folder exists only through its members, and
 * shared prefixes collapse to one folder.
 */
import { describe, expect, it } from 'vitest';

import { deriveFolders, parentPrefix } from './folders';

describe('parentPrefix', () => {
  it('is null for a root-level id', () => {
    expect(parentPrefix('a.txt')).toBeNull();
  });

  it('is everything before the final segment', () => {
    expect(parentPrefix('reports/2026/x.csv')).toBe('reports/2026');
    expect(parentPrefix('reports/x.csv')).toBe('reports');
  });
});

describe('deriveFolders', () => {
  it('yields no folders for root-level ids only', () => {
    expect(deriveFolders(['a.txt', 'b.bin'])).toEqual([]);
  });

  it('names a folder by its final segment and files it under its parent prefix', () => {
    expect(deriveFolders(['reports/x.csv'])).toEqual([
      { id: 'reports', name: 'reports', parentId: null },
    ]);
  });

  it('derives a folder for each ancestor prefix of a nested id', () => {
    expect(deriveFolders(['reports/2026/x.csv'])).toEqual([
      { id: 'reports', name: 'reports', parentId: null },
      { id: 'reports/2026', name: '2026', parentId: 'reports' },
    ]);
  });

  it('collapses a prefix shared by several ids to one folder', () => {
    const folders = deriveFolders(['reports/a.csv', 'reports/b.csv', 'reports/2026/c.csv']);
    expect(folders).toEqual([
      { id: 'reports', name: 'reports', parentId: null },
      { id: 'reports/2026', name: '2026', parentId: 'reports' },
    ]);
  });

  it('keeps distinct top-level directories side by side', () => {
    const ids = deriveFolders(['reports/a.csv', 'inbox/b.txt']).map((folder) => folder.id);
    expect(new Set(ids)).toEqual(new Set(['reports', 'inbox']));
  });
});
