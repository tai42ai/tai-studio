/**
 * Unit tests for the pure conflict oracle behind the multi-file template upload.
 */
import { describe, expect, it } from 'vitest';

import { computeConflicts, type FileEntry } from './use-files-upload';

function entry(path: string): FileEntry {
  return { path, file: new File([''], path), status: 'pending', error: null };
}

describe('computeConflicts', () => {
  it('flags a path already on the server', () => {
    expect(computeConflicts([entry('a.md')], new Set(['a.md']))).toEqual(['a.md']);
  });

  it('flags a name repeated in the batch', () => {
    expect(computeConflicts([entry('dup.md'), entry('dup.md')], new Set())).toEqual([
      'dup.md',
      'dup.md',
    ]);
  });

  it('is empty when every path is unique and new', () => {
    expect(computeConflicts([entry('a.md'), entry('b.md')], new Set(['c.md']))).toEqual([]);
  });
});
