import { describe, expect, it } from 'vitest';

import { changedTopLevelKeys } from './changed-fields';

describe('changedTopLevelKeys', () => {
  it('reports the keys whose value differs, treating a non-object as empty', () => {
    expect(changedTopLevelKeys({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
    expect(changedTopLevelKeys(null, { a: 1 })).toEqual(['a']);
    expect(changedTopLevelKeys({ a: 1 }, 'x')).toEqual(['a']);
  });
});
