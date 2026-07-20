import { describe, expect, it } from 'vitest';

import type { Extension } from '@tai42/api-client';

import {
  NON_STACKABLE_KIND,
  baseNameOf,
  groupByKind,
  groupIntoFamilies,
  kindVariant,
} from './extension-grouping';

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
      { name: 'tool_a_b', kind: 'wrapper' },
      { name: 'tool', kind: 'backend' },
      { name: 'tool_a', kind: 'transformer' },
    ];
    const families = groupIntoFamilies(extensions);
    expect(families).toHaveLength(1);
    expect(families[0]?.base).toBe('tool');
    expect(families[0]?.members.map((m) => m.name)).toEqual(['tool', 'tool_a', 'tool_a_b']);
  });

  it('orders families by base name and separates distinct tools', () => {
    const extensions: Extension[] = [
      { name: 'zeta_chain', kind: 'transformer' },
      { name: 'alpha', kind: 'backend' },
      { name: 'alpha_batch', kind: 'transformer' },
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
      { name: 'markb', kind: 'wrapper' },
      { name: 'backendx', kind: 'backend' },
      { name: 'marka', kind: 'wrapper' },
    ];
    const groups = groupByKind(extensions);
    expect(groups.map((g) => g.kind)).toEqual(['backend', 'wrapper']);
    expect(groups[1]?.members.map((m) => m.name)).toEqual(['marka', 'markb']);
  });

  it('flags only the backend kind as non-stackable', () => {
    const extensions: Extension[] = [
      { name: 'backendx', kind: 'backend' },
      { name: 'marka', kind: 'wrapper' },
    ];
    const groups = groupByKind(extensions);
    const backend = groups.find((g) => g.kind === NON_STACKABLE_KIND);
    const wrapper = groups.find((g) => g.kind === 'wrapper');
    expect(backend?.nonStackable).toBe(true);
    expect(wrapper?.nonStackable).toBe(false);
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
