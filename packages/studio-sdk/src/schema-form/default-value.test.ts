import { describe, expect, it } from 'vitest';

import { defaultValueForSchema, skeletonValueForSchema } from './default-value';
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

describe('skeletonValueForSchema', () => {
  it("mints every required field's empty value, consistently across types", () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'integer' },
        flag: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        extra: { type: 'string' },
      },
      required: ['name', 'count', 'flag', 'tags'],
    };
    // The default seed would leave name/count/flag absent while minting tags —
    // an inconsistent value that fails its own schema. The skeleton is whole.
    expect(skeletonValueForSchema(schema)).toEqual({ name: '', count: 0, flag: false, tags: [] });
  });

  it('still honors explicit defaults and consts over the minted empty', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        kind: { const: 'widget' },
        label: { type: 'string', default: 'untitled' },
      },
      required: ['kind', 'label'],
    };
    expect(skeletonValueForSchema(schema)).toEqual({ kind: 'widget', label: 'untitled' });
  });

  it('recurses through required nested objects and leaves optional fields absent', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        inner: {
          type: 'object',
          properties: { id: { type: 'string' }, note: { type: 'string' } },
          required: ['id'],
        },
        outerNote: { type: 'string' },
      },
      required: ['inner'],
    };
    expect(skeletonValueForSchema(schema)).toEqual({ inner: { id: '' } });
  });

  it('never invents a choice: required enums and unions stay absent', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        level: { enum: ['low', 'high'] },
        either: {
          anyOf: [
            { type: 'object', title: 'A', properties: { a: { type: 'string' } }, required: ['a'] },
            { type: 'object', title: 'B', properties: { b: { type: 'string' } }, required: ['b'] },
          ],
        },
      },
      required: ['level', 'either'],
    };
    expect(skeletonValueForSchema(schema)).toEqual({});
  });
});

describe('a property named __proto__', () => {
  // JSON.parse keeps `__proto__` as an ordinary own key, as a schema from the wire carries it.
  const optionalWithDefault = JSON.parse(
    '{"type":"object","properties":{"__proto__":{"type":"string","default":"abc"}}}',
  ) as JsonSchema;
  const required = JSON.parse(
    '{"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"]}',
  ) as JsonSchema;

  it('seeds its default as an own entry of an ordinary object', () => {
    for (const seeded of [
      defaultValueForSchema(optionalWithDefault),
      skeletonValueForSchema(optionalWithDefault),
    ]) {
      expect(Object.getPrototypeOf(seeded)).toBe(Object.prototype);
      expect(Object.getOwnPropertyDescriptor(seeded, '__proto__')?.value).toBe('abc');
    }
  });

  it('seeds a required one as an own entry in the skeleton', () => {
    const seeded = skeletonValueForSchema(required);
    expect(Object.getPrototypeOf(seeded)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(seeded, '__proto__')?.value).toBe('');
  });
});
