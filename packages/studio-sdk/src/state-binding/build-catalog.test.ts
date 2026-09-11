import { describe, expect, it } from 'vitest';
import type { StateListItem, StateTemplateListItem } from '@tai42/api-client';

import {
  fieldPathsFromSchema,
  statesCatalogFromList,
  templatesCatalogFromList,
} from './build-catalog';

describe('templatesCatalogFromList', () => {
  it('maps each template and its template jq, tolerating a null template_jq', () => {
    const items = [
      {
        name: 'tally',
        description: 'a tally',
        template_jq: {
          current: {
            purpose: 'input',
            description: 'head',
            params: ['as_of'],
            reads: [],
            writes: [],
            jq: { content: '.b' },
          },
          bump: {
            purpose: 'update',
            description: '',
            params: ['total'],
            reads: [],
            writes: [['tally']],
            jq: { content: '[]' },
          },
        },
      },
      { name: 'empty', description: '', template_jq: null },
    ] as unknown as StateTemplateListItem[];

    const catalog = templatesCatalogFromList(items);
    expect(catalog).toHaveLength(2);
    expect(catalog[0]?.templateJq.map((jq) => jq.name).sort()).toEqual(['bump', 'current']);
    expect(catalog[0]?.templateJq.find((jq) => jq.name === 'bump')?.writes).toEqual([['tally']]);
    expect(catalog[1]?.templateJq).toEqual([]);
  });
});

describe('statesCatalogFromList', () => {
  it('maps state names', () => {
    const states = [{ name: 'counters' }, { name: 'notes' }] as unknown as StateListItem[];
    expect(statesCatalogFromList(states)).toEqual([{ name: 'counters' }, { name: 'notes' }]);
  });
});

describe('fieldPathsFromSchema', () => {
  it('flattens top-level and nested object properties into labelled paths', () => {
    const schema = {
      type: 'object',
      properties: {
        total: { type: 'number' },
        account: { type: 'object', properties: { id: { type: 'string' } } },
      },
    };
    expect(fieldPathsFromSchema(schema)).toEqual([
      { path: ['total'], label: 'total' },
      { path: ['account'], label: 'account' },
      { path: ['account', 'id'], label: 'account.id' },
    ]);
  });

  it('yields nothing for a null / property-less / non-object schema', () => {
    expect(fieldPathsFromSchema(null)).toEqual([]);
    expect(fieldPathsFromSchema({ type: 'string' })).toEqual([]);
    expect(fieldPathsFromSchema(42)).toEqual([]);
  });
});
