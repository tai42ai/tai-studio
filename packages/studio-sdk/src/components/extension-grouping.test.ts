import type { Extension } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import { groupByKind } from './extension-grouping';

describe('groupByKind', () => {
  it('groups the catalog by kind, ordered by kind then name', () => {
    const extensions: Extension[] = [
      { name: 'markb', kind: 'wrapper', multiple: true, config_schema: null },
      {
        name: 'backendx',
        kind: 'backend',
        multiple: false,
        config_schema: null,
      },
      { name: 'marka', kind: 'wrapper', multiple: true, config_schema: null },
    ];
    const groups = groupByKind(extensions);
    expect(groups.map((g) => g.kind)).toEqual(['backend', 'wrapper']);
    expect(groups[1]?.members.map((m) => m.name)).toEqual(['marka', 'markb']);
  });

  it("carries each kind's served multiple flag", () => {
    const extensions: Extension[] = [
      {
        name: 'backendx',
        kind: 'backend',
        multiple: false,
        config_schema: null,
      },
      { name: 'marka', kind: 'wrapper', multiple: true, config_schema: null },
      { name: 'routea', kind: 'router', multiple: false, config_schema: null },
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
      { name: 'marka', kind: 'wrapper', multiple: true, config_schema: null },
      { name: 'markb', kind: 'wrapper', multiple: false, config_schema: null },
    ];
    expect(() => groupByKind(extensions)).toThrow(
      'extension kind wrapper is served as both single- and multi-select',
    );
  });

  it('returns an empty array for an empty catalog', () => {
    expect(groupByKind([])).toEqual([]);
  });
});
