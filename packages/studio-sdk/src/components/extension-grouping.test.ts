import type { Extension } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import { baseNameOf, groupByKind, groupIntoFamilies, kindVariant } from './extension-grouping';

describe('baseNameOf', () => {
  it('returns the whole name when there is no underscore', () => {
    expect(baseNameOf('search')).toBe('search');
  });

  it('returns the segment before the first underscore', () => {
    expect(baseNameOf('tool_a')).toBe('tool');
    expect(baseNameOf('tool_a_b')).toBe('tool');
    expect(baseNameOf('x_ask_external')).toBe('x');
  });
});

describe('groupIntoFamilies', () => {
  it('groups branch variants under their base tool name', () => {
    const extensions: Extension[] = [
      { name: 'tool_a_b', kind: 'wrapper', multiple: true },
      { name: 'tool', kind: 'backend', multiple: false },
      { name: 'tool_a', kind: 'transformer', multiple: true },
    ];
    const families = groupIntoFamilies(extensions);
    expect(families).toHaveLength(1);
    expect(families[0]?.base).toBe('tool');
    expect(families[0]?.members.map((m) => m.name)).toEqual(['tool', 'tool_a', 'tool_a_b']);
  });

  it('orders families by base name and separates distinct tools', () => {
    const extensions: Extension[] = [
      { name: 'zeta_chain', kind: 'transformer', multiple: true },
      { name: 'alpha', kind: 'backend', multiple: false },
      { name: 'alpha_batch', kind: 'transformer', multiple: true },
    ];
    const families = groupIntoFamilies(extensions);
    expect(families.map((f) => f.base)).toEqual(['alpha', 'zeta']);
    expect(families[0]?.members).toHaveLength(2);
    expect(families[1]?.members).toHaveLength(1);
  });

  it('returns an empty array for an empty catalog', () => {
    expect(groupIntoFamilies([])).toEqual([]);
  });
});

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
