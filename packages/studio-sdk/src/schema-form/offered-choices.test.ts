import { describe, expect, it } from 'vitest';

import {
  isArraySchema,
  schemaWithSendOptions,
  withFoldedUpdate,
  withinOfferedChoices,
} from './offered-choices';
import type { JsonSchema } from './types';

describe('isArraySchema', () => {
  it('reads an array type alone or in a union, and nothing else', () => {
    expect(isArraySchema({ type: 'array' })).toBe(true);
    expect(isArraySchema({ type: ['array', 'null'] })).toBe(true);
    expect(isArraySchema({ type: 'string' })).toBe(false);
    expect(isArraySchema({})).toBe(false);
  });
});

describe('schemaWithSendOptions', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      colour: { type: 'string', enum: ['r'] },
      tags: { type: 'array', items: { type: 'string' } },
      note: { type: 'string' },
    },
  };

  it("stamps a choice list's values as the enum of a string field and of an array's items", () => {
    const result = schemaWithSendOptions(schema, {
      colour: [{ value: 'g' }],
      tags: [{ value: 'a' }],
    });

    expect(result.properties?.colour).toEqual({ type: 'string', enum: ['g'] });
    expect(result.properties?.tags).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['a'] },
    });
    expect(result.properties?.note).toBe(schema.properties?.note);
    expect(schema.properties?.colour).toEqual({ type: 'string', enum: ['r'] });
  });

  it('returns the schema itself when no field carries a non-empty choice list', () => {
    expect(schemaWithSendOptions(schema, { colour: [] })).toBe(schema);
  });

  it('skips a listed field the schema does not declare, a built-in member name included', () => {
    const result = schemaWithSendOptions(schema, {
      constructor: [{ value: 'x' }],
      other: [{ value: 'y' }],
    });

    expect(Object.keys(result.properties ?? {})).toEqual(['colour', 'tags', 'note']);
  });
});

describe('withinOfferedChoices', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      tags: { type: ['array', 'null'], items: { type: 'string' } },
      colour: { type: 'string' },
    },
  };

  it("keeps only the entries an array field's new choice list offers", () => {
    const value = { tags: ['a', 'b', 'c'], colour: 'r' };
    expect(
      withinOfferedChoices(schema, value, {
        tags: [{ value: 'c' }, { value: 'a' }],
        colour: [{ value: 'r' }],
      }),
    ).toEqual({ tags: ['a', 'c'], colour: 'r' });
    expect(value.tags).toEqual(['a', 'b', 'c']);
  });

  it('clears a single-choice field whose value its new choice list does not offer', () => {
    const value = { tags: ['a'], colour: 'r' };
    expect(withinOfferedChoices(schema, value, { colour: [{ value: 'g' }] })).toEqual({
      tags: ['a'],
    });
    expect(value.colour).toBe('r');
  });

  it('leaves a field the schema does not declare, or one with no value yet, as it is', () => {
    const value = { other: ['x'], tags: null };
    expect(
      withinOfferedChoices(schema, value, {
        other: [{ value: 'y' }],
        tags: [{ value: 'a' }],
      }),
    ).toEqual({ other: ['x'], tags: null });
  });

  it('keeps a field named after a built-in object member as its own key', () => {
    const named: JsonSchema = {
      type: 'object',
      properties: Object.fromEntries([['__proto__', { type: 'string' }]]),
    };
    const value = Object.fromEntries([['__proto__', 'r']]);

    const kept = withinOfferedChoices(
      named,
      value,
      Object.fromEntries([['__proto__', [{ value: 'r' }]]]),
    );

    expect(Object.hasOwn(kept as object, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
  });

  it('returns a value that is not an object unchanged', () => {
    expect(withinOfferedChoices(schema, 'x', { tags: [{ value: 'a' }] })).toBe('x');
  });
});

describe('withFoldedUpdate', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string' } },
      colour: { type: 'string' },
      qty: { type: 'string' },
    },
  };

  it('drops the choices the new lists no longer offer, then lays the values on unfiltered', () => {
    const value = { tags: ['a', 'b'], colour: 'r', qty: 'x' };
    expect(
      withFoldedUpdate(schema, value, {
        options: { tags: [{ value: 'b' }], colour: [{ value: 'g' }] },
        values: { qty: 'y', colour: 'z' },
      }),
    ).toEqual({ tags: ['b'], colour: 'z', qty: 'y' });
    expect(value).toEqual({ tags: ['a', 'b'], colour: 'r', qty: 'x' });
  });

  it('removes a field the update sets to null', () => {
    expect(
      withFoldedUpdate(schema, { colour: 'r', qty: 'x' }, { options: {}, values: { qty: null } }),
    ).toEqual({ colour: 'r' });
  });

  it('starts from an empty value when the form value is not an object', () => {
    expect(withFoldedUpdate(schema, 'x', { options: {}, values: { qty: 'y' } })).toEqual({
      qty: 'y',
    });
  });
});
