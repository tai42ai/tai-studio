import { describe, expect, it } from 'vitest';

import { describeZone } from './scope-announcements';

describe('describeZone', () => {
  it('names every zone kind', () => {
    expect(describeZone({ kind: 'scope', scopeId: 's1' })).toBe('scope s1');
    expect(describeZone({ kind: 'unassigned' })).toBe('the Unassigned bucket');
    expect(describeZone({ kind: 'public' })).toBe('the Public zone');
  });
});
