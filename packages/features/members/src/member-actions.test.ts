import type { MemberActionCatalog, MemberActionDescriptor } from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';
import { describe, expect, it } from 'vitest';

import { catalogByKey, pageActions, rowActions, schemaHasFields } from './member-actions';

const emptySchema = { type: 'object', properties: {} };

/** An opaque descriptor with only the fields the join helpers read. */
function descriptor(key: string, scope: MemberActionDescriptor['scope']): MemberActionDescriptor {
  return {
    key,
    label: key,
    scope,
    destructive: false,
    input_schema: emptySchema,
    result_schema: emptySchema,
  };
}

const catalog: MemberActionCatalog = {
  actions: [
    descriptor('act-page', 'page'),
    descriptor('act-row', 'member_row'),
    descriptor('act-invite-row', 'invite_row'),
  ],
};

describe('pageActions', () => {
  it('keeps only the page-scoped descriptors', () => {
    expect(pageActions(catalog).map((action) => action.key)).toEqual(['act-page']);
  });

  it('is empty when no descriptor is page-scoped', () => {
    const rowsOnly = { actions: [descriptor('act-row', 'member_row')] };
    expect(pageActions(rowsOnly)).toEqual([]);
  });
});

describe('catalogByKey', () => {
  it('indexes every descriptor by its opaque key', () => {
    const byKey = catalogByKey(catalog);
    expect(byKey.size).toBe(3);
    expect(byKey.get('act-row')?.scope).toBe('member_row');
    expect(byKey.get('missing')).toBeUndefined();
  });
});

describe('rowActions', () => {
  const byKey = catalogByKey(catalog);

  it('resolves the row keys to matching-scope descriptors, preserving order', () => {
    const resolved = rowActions(byKey, ['act-row', 'act-page'], 'member_row');
    // act-page is dropped: it resolves but its scope is not member_row.
    expect(resolved.map((action) => action.key)).toEqual(['act-row']);
  });

  it('keeps the row order when several keys match the scope', () => {
    const extended = catalogByKey({
      actions: [descriptor('a', 'member_row'), descriptor('b', 'member_row')],
    });
    expect(rowActions(extended, ['b', 'a'], 'member_row').map((action) => action.key)).toEqual([
      'b',
      'a',
    ]);
  });

  it('drops an unknown key rather than rendering a broken control', () => {
    // 'ghost' is not in the catalog: byKey.get returns undefined, so it is skipped.
    expect(rowActions(byKey, ['ghost', 'act-row'], 'member_row').map((a) => a.key)).toEqual([
      'act-row',
    ]);
  });

  it('is empty when a key resolves but to the wrong scope', () => {
    expect(rowActions(byKey, ['act-page'], 'member_row')).toEqual([]);
  });
});

describe('schemaHasFields', () => {
  it('is false when the schema declares no properties key', () => {
    expect(schemaHasFields({ type: 'object' })).toBe(false);
  });

  it('is false for an empty properties object', () => {
    expect(schemaHasFields(emptySchema as JsonSchema)).toBe(false);
  });

  it('is true when at least one property is declared', () => {
    expect(schemaHasFields({ type: 'object', properties: { note: { type: 'string' } } })).toBe(
      true,
    );
  });
});
