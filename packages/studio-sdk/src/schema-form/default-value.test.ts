import { describe, expect, it } from 'vitest';

import { defaultValueForSchema } from './default-value';
import type { JsonSchema } from './types';

describe('defaultValueForSchema', () => {
  it('seeds an optional property that carries a default and omits one that does not', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        count: { type: 'integer', default: 5 },
        note: { type: 'string' },
      },
    };
    expect(defaultValueForSchema(schema)).toEqual({ count: 5 });
  });

  it('omits a required scalar with no default so validation can flag it', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    expect(defaultValueForSchema(schema)).toEqual({});
  });

  it('seeds a const value', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { kind: { const: 'widget' } },
      required: ['kind'],
    };
    expect(defaultValueForSchema(schema)).toEqual({ kind: 'widget' });
  });

  it('seeds a required nested object structure', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        inner: {
          type: 'object',
          properties: { flag: { type: 'boolean', default: false } },
        },
      },
      required: ['inner'],
    };
    expect(defaultValueForSchema(schema)).toEqual({ inner: { flag: false } });
  });

  it('returns an explicit array default and undefined for a bare scalar', () => {
    expect(
      defaultValueForSchema({ type: 'array', items: { type: 'string' }, default: ['a'] }),
    ).toEqual(['a']);
    expect(defaultValueForSchema({ type: 'string' })).toBeUndefined();
  });

  it('does not seed an optional null-union field', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        nickname: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
    };
    expect(defaultValueForSchema(schema)).toEqual({});
  });
});
