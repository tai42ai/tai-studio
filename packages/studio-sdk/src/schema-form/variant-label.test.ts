import { describe, expect, it } from 'vitest';

import type { JsonSchema } from './types';
import { variantLabels } from './variant-label';

const ROOT: JsonSchema = {
  $defs: {
    MediaRef: { type: 'object', properties: { url: { type: 'string' } } },
    Titled: { type: 'object', title: 'Upload', properties: { id: { type: 'string' } } },
  },
};

function labels(variants: readonly JsonSchema[], tags: readonly unknown[] = []): string[] {
  return variantLabels(variants, tags, ROOT);
}

describe('variantLabels', () => {
  it('reads a discriminator tag first, then a title', () => {
    expect(
      labels(
        [
          { type: 'object', title: 'Ignored' },
          { type: 'object', title: 'Plain' },
        ],
        ['card', undefined],
      ),
    ).toEqual(['card', 'Plain']);
  });

  it('names a referenced definition by its title, else by its name as words', () => {
    expect(labels([{ $ref: '#/$defs/Titled' }, { $ref: '#/$defs/MediaRef' }])).toEqual([
      'Upload',
      'Media ref',
    ]);
  });

  it('names a constant by its value and a value set by its first values', () => {
    expect(
      labels([{ const: 'auto' }, { enum: ['low', 'mid', 'high', 'max'] }, { enum: ['on'] }]),
    ).toEqual(['auto', 'One of low, mid, high, …', 'on']);
  });

  it('names a scalar by its type and a string by its format', () => {
    expect(
      labels([
        { type: 'string' },
        { type: 'integer' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'string', format: 'date-time' },
        { type: 'string', format: 'not-a-known-format' },
      ]),
    ).toEqual(['Text (1)', 'Whole number', 'Number', 'True or false', 'Date and time', 'Text (6)']);
  });

  it('names a list by its items, an object by its properties and a map by its values', () => {
    expect(
      labels([
        { type: 'array', items: { type: 'string' } },
        { type: 'array', items: { $ref: '#/$defs/MediaRef' } },
        { type: 'object', properties: { a: {}, b: {}, c: {}, d: {} } },
        { type: 'object', additionalProperties: { type: 'integer' } },
        { type: 'object' },
        { properties: { name: {} } },
        {},
      ]),
    ).toEqual([
      'List of text',
      'List of media ref',
      'Object with a, b, c, …',
      'Map of whole number',
      'Object',
      'Object with name',
      'Any value',
    ]);
  });

  it("keeps a titled definition's own case inside a list or a map, as pydantic titles it", () => {
    const root: JsonSchema = {
      $defs: {
        MediaRef: {
          type: 'object',
          title: 'MediaRef',
          properties: { url: { type: 'string', title: 'Url' } },
          required: ['url'],
        },
        URL: { type: 'object', title: 'URL', properties: { href: { type: 'string' } } },
      },
    };
    expect(
      variantLabels(
        [
          { type: 'array', items: { $ref: '#/$defs/MediaRef' } },
          { type: 'array', items: { $ref: '#/$defs/URL' } },
          { type: 'object', additionalProperties: { $ref: '#/$defs/URL' } },
          { type: 'array', items: { const: 'Auto' } },
        ],
        [],
        root,
      ),
    ).toEqual(['List of MediaRef', 'List of URL', 'Map of URL', 'List of Auto']);
  });

  it('names a list of a union by its members', () => {
    const root: JsonSchema = {
      $defs: { MediaRef: { type: 'object', title: 'MediaRef', properties: {} } },
    };
    expect(
      variantLabels(
        [
          { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'integer' }] } },
          { type: 'array', items: { anyOf: [{ $ref: '#/$defs/MediaRef' }, { type: 'null' }] } },
          { type: 'array', items: { oneOf: [{ type: 'boolean' }, { $ref: '#/$defs/MediaRef' }] } },
        ],
        [],
        root,
      ),
    ).toEqual([
      'List of text or whole number',
      'List of MediaRef or none',
      'List of true or false or MediaRef',
    ]);
  });

  it('joins the names of a schema that allows several types', () => {
    expect(labels([{ type: ['string', 'integer'] }, { type: 'boolean' }])).toEqual([
      'Text or whole number',
      'True or false',
    ]);
  });

  it('names a reference to the whole document as the whole value, inside its own shape too', () => {
    const root: JsonSchema = {
      type: 'object',
      additionalProperties: { anyOf: [{ type: 'string' }, { $ref: '#' }] },
    };
    expect(variantLabels([{ type: 'string' }, { $ref: '#' }], [], root)).toEqual([
      'Text',
      'Same shape as the whole value',
    ]);
    expect(variantLabels([{ type: 'array', items: { $ref: '#' } }], [], root)).toEqual([
      'List of same shape as the whole value',
    ]);
  });

  it('names the whole value through a root that is itself a reference', () => {
    const root: JsonSchema = {
      $ref: '#/$defs/Tree',
      $defs: {
        Tree: {
          type: 'object',
          additionalProperties: { anyOf: [{ type: 'string' }, { $ref: '#' }] },
        },
      },
    };
    expect(variantLabels([{ type: 'string' }, { $ref: '#' }], [], root)).toEqual([
      'Text',
      'Same shape as the whole value',
    ]);
  });

  it('names a reference whose definition name holds no words by its pointer', () => {
    const keys = ['_', '__', '___', '-', '--', '_-', '-_', '__-', '--_', '_-_'];
    const each = keys.map((key) => ({ type: 'array' as const, items: { $ref: `#/$defs/${key}` } }));
    const root: JsonSchema = {
      $defs: Object.fromEntries(keys.map((key) => [key, { anyOf: each }])),
    };
    expect(variantLabels([{ type: 'integer' }, { $ref: '#/$defs/__' }], [], root)).toEqual([
      'Whole number',
      '#/$defs/__',
    ]);
    expect(variantLabels(each.slice(0, 2), [], root)).toEqual([
      'List of #/$defs/_',
      'List of #/$defs/__',
    ]);
  });

  it('names a single-member allOf by the schema it wraps', () => {
    expect(labels([{ allOf: [{ $ref: '#/$defs/MediaRef' }] }, { type: 'string' }])).toEqual([
      'Media ref',
      'Text',
    ]);
  });

  it('tells apart variants that read the same by their position', () => {
    expect(
      labels([
        { type: 'object', title: 'Entry' },
        { type: 'object', title: 'Entry' },
        { type: 'string' },
      ]),
    ).toEqual(['Entry (1)', 'Entry (2)', 'Text']);
  });

  it('keeps every name distinct when a position matches another variant name', () => {
    expect(labels([{ type: 'string' }, { type: 'string' }, { title: 'Text (2)' }])).toEqual([
      'Text (1)',
      'Text (2) (2)',
      'Text (2) (3)',
    ]);
  });

  it('reads a type listed twice once', () => {
    let schema: JsonSchema = { type: 'string' };
    for (let depth = 0; depth < 40; depth += 1)
      schema = { type: ['array', 'array'], items: schema };
    expect(labels([{ type: ['string', 'string'] }, { type: 'integer' }])).toEqual([
      'Text',
      'Whole number',
    ]);
    expect(labels([schema, { type: 'integer' }])[0]).toMatch(/^List of list of /);
  });
});
