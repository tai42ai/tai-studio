import type { Extension } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import { groupByKind, kindVariant } from './extension-grouping';

describe('groupByKind', () => {
  it('groups the catalog by kind, ordered by kind then name', () => {
    const extensions: Extension[] = [
      { name: 'markb', kind: 'wrapper', multiple: true },
      { name: 'backendx', kind: 'backend', multiple: false },
      { name: 'marka', kind: 'wrapper', multiple: true },
    ];
    const groups = groupByKind(extensions);
    expect(groups.map((g) => g.kind)).toEqual(['backend', 'wrapper']);
    expect(groups[1]?.members.map((m) => m.name)).toEqual(['marka', 'markb']);
  });

  it("carries each kind's served multiple flag", () => {
    const extensions: Extension[] = [
      { name: 'backendx', kind: 'backend', multiple: false },
      { name: 'marka', kind: 'wrapper', multiple: true },
      { name: 'routea', kind: 'router', multiple: false },
    ];
    const groups = groupByKind(extensions);
    expect(groups.map((g) => [g.kind, g.multiple])).toEqual([
      ['backend', false],
      ['router', false],
      ['wrapper', true],
    ]);
  });

  it('refuses a kind the catalog serves as both single- and multi-select', () => {
    const extensions: Extension[] = [
      { name: 'marka', kind: 'wrapper', multiple: true },
      { name: 'markb', kind: 'wrapper', multiple: false },
    ];
    expect(() => groupByKind(extensions)).toThrow(
      'extension kind wrapper is served as both single- and multi-select',
    );
  });

  it('returns an empty array for an empty catalog', () => {
    expect(groupByKind([])).toEqual([]);
  });
});

describe('kindVariant', () => {
  it('maps known kinds to themed variants', () => {
    expect(kindVariant('wrapper')).toBe('primary');
    expect(kindVariant('transformer')).toBe('success');
    expect(kindVariant('backend')).toBe('warning');
  });

  it('falls back to neutral for an unknown kind', () => {
    expect(kindVariant('something-new')).toBe('neutral');
  });
});
