/**
 * Unit tests for templates virtual-folder derivation. Beyond the ordinary prefix
 * folding, two corrections are pinned: an empty path segment (leading `/`, trailing
 * `/`, `a//b`) never mints a phantom `''` folder — the key files literally at the
 * root; and a key that is both a file and a folder prefix (`a` beside `a/b`) yields
 * BOTH a root item and a navigable folder.
 */
import { describe, expect, it } from 'vitest';

import { deriveTemplateFolders, isPathShaped, templateFolderId, templateLabel } from './folders';

describe('isPathShaped', () => {
  it('accepts keys whose every segment is non-empty', () => {
    expect(isPathShaped('a.md')).toBe(true);
    expect(isPathShaped('prompts/summary.md')).toBe(true);
    expect(isPathShaped('a/b/c')).toBe(true);
  });

  it('rejects keys with an empty segment', () => {
    expect(isPathShaped('')).toBe(false);
    expect(isPathShaped('/leading')).toBe(false);
    expect(isPathShaped('trailing/')).toBe(false);
    expect(isPathShaped('a//b')).toBe(false);
  });
});

describe('templateFolderId', () => {
  it('is null for a root-level key', () => {
    expect(templateFolderId('a.md')).toBeNull();
  });

  it('is the prefix before the final segment for a nested key', () => {
    expect(templateFolderId('prompts/2026/x.md')).toBe('prompts/2026');
  });

  it('files a malformed key (empty segment) at the root, never under a phantom folder', () => {
    expect(templateFolderId('/leading')).toBeNull();
    expect(templateFolderId('a//b')).toBeNull();
  });
});

describe('deriveTemplateFolders', () => {
  it('yields no folders for root-level keys only', () => {
    expect(deriveTemplateFolders(['a.md', 'b.md'])).toEqual([]);
  });

  it('derives one folder per ancestor prefix of a nested key', () => {
    expect(deriveTemplateFolders(['prompts/2026/x.md'])).toEqual([
      { id: 'prompts', name: 'prompts', parentId: null },
      { id: 'prompts/2026', name: '2026', parentId: 'prompts' },
    ]);
  });

  it('never mints a phantom "" folder from an empty path segment', () => {
    // A leading slash, a double slash, and a trailing slash each carry an empty
    // path segment; none of them contributes a '' folder to the listing.
    expect(deriveTemplateFolders(['/leading', 'a//b', 'trailing/'])).toEqual([]);
  });

  it('renders BOTH the file and the folder when a name is used as each', () => {
    const folders = deriveTemplateFolders(['a', 'a/b']);
    // The folder `a` exists (from `a/b`)…
    expect(folders).toEqual([{ id: 'a', name: 'a', parentId: null }]);
    // …while the file `a` still files at the root as its own item.
    expect(templateFolderId('a')).toBeNull();
    expect(templateFolderId('a/b')).toBe('a');
  });
});

describe('templateLabel', () => {
  it('shows the final segment of a well-formed key', () => {
    expect(templateLabel('prompts/summary.md')).toBe('summary.md');
    expect(templateLabel('a.md')).toBe('a.md');
  });

  it('shows a malformed key in full rather than masquerading as a leaf', () => {
    expect(templateLabel('a//b')).toBe('a//b');
    expect(templateLabel('/leading')).toBe('/leading');
  });
});
