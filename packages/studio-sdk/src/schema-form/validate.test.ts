import { describe, expect, it } from 'vitest';

import type { JsonSchema } from './types';
import { validateAgainstSchema } from './validate';

describe('validateAgainstSchema', () => {
  it('flags a missing required field', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name'],
    };
    const errors = validateAgainstSchema(schema, {});
    expect(errors.name).toMatch(/required/);
    expect(errors.age).toBeUndefined();
  });

  it('accepts an absent optional null-union field (no value is valid)', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { nickname: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
    };
    expect(validateAgainstSchema(schema, {})).toEqual({});
    expect(validateAgainstSchema(schema, { nickname: null })).toEqual({});
  });

  it('accepts null for a const-null field and rejects everything else', () => {
    // The one shape whose null-acceptance is pinned BY the schema itself; the
    // seeded default (null) must validate, or the field is permanently invalid.
    const schema: JsonSchema = {
      type: 'object',
      properties: { tombstone: { const: null } },
      required: ['tombstone'],
    };
    expect(validateAgainstSchema(schema, { tombstone: null })).toEqual({});
    const errors = validateAgainstSchema(schema, { tombstone: 'x' });
    expect(errors.tombstone).toMatch(/must equal/);
  });

  it('flags a type mismatch on a number field', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { age: { type: 'integer' } },
      required: ['age'],
    };
    const errors = validateAgainstSchema(schema, { age: 'not a number' });
    expect(errors.age).toMatch(/integer/);
  });

  it('flags an out-of-enum value and a bad email format', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        color: { enum: ['red', 'green'] },
        email: { type: 'string', format: 'email' },
      },
      required: ['color', 'email'],
    };
    const errors = validateAgainstSchema(schema, { color: 'purple', email: 'nope' });
    expect(errors.color).toBeDefined();
    expect(errors.email).toMatch(/email/);
  });

  it('accepts any JSON for a free-form (any) field', () => {
    // A property with no declared type is a free-form JSON field: any JSON value
    // passes, so no error is raised for it.
    const schema: JsonSchema = {
      type: 'object',
      properties: { anything: {} },
      required: ['anything'],
    };
    expect(validateAgainstSchema(schema, { anything: 42 }).anything).toBeUndefined();
    expect(validateAgainstSchema(schema, { anything: { a: 1 } }).anything).toBeUndefined();
  });

  it('enforces the container of a free-form json field', () => {
    // A property-less object is a json (object) field; a non-object value is flagged,
    // and a bare-array (json array) field rejects a non-array.
    const objectSchema: JsonSchema = {
      type: 'object',
      properties: { config: { type: 'object' } },
      required: ['config'],
    };
    expect(validateAgainstSchema(objectSchema, { config: 'nope' }).config).toMatch(/object/);
    expect(validateAgainstSchema(objectSchema, { config: { any: true } }).config).toBeUndefined();

    const arraySchema: JsonSchema = {
      type: 'object',
      properties: { items: { type: 'array' } },
      required: ['items'],
    };
    expect(validateAgainstSchema(arraySchema, { items: { not: 'an array' } }).items).toMatch(
      /array/,
    );
    expect(validateAgainstSchema(arraySchema, { items: [1, 2] }).items).toBeUndefined();
  });

  it('validates array items by index', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: { type: 'integer' },
    };
    const errors = validateAgainstSchema(schema, [1, 'two', 3]);
    expect(errors['[1]']).toMatch(/integer/);
    expect(errors['[0]']).toBeUndefined();
  });

  it('routes a discriminated union to the active variant', () => {
    const schema: JsonSchema = {
      $defs: {
        Cat: {
          type: 'object',
          properties: { kind: { const: 'cat' }, lives: { type: 'integer' } },
          required: ['kind', 'lives'],
        },
        Dog: {
          type: 'object',
          properties: { kind: { const: 'dog' }, bark: { type: 'boolean' } },
          required: ['kind', 'bark'],
        },
      },
      discriminator: { propertyName: 'kind' },
      oneOf: [{ $ref: '#/$defs/Cat' }, { $ref: '#/$defs/Dog' }],
    };
    expect(validateAgainstSchema(schema, { kind: 'cat', lives: 9 })).toEqual({});
    const errors = validateAgainstSchema(schema, { kind: 'dog', bark: 'loud' });
    expect(errors.bark).toMatch(/true or false/);
  });
});

describe('validateAgainstSchema — media byte cap', () => {
  // A media-annotated string field, optionally pinning a per-field `contentMaxBytes`.
  const mediaSchema = (contentMaxBytes?: number): JsonSchema => ({
    type: 'object',
    properties: {
      avatar: {
        type: 'string',
        format: 'data-url',
        contentMediaType: 'image/*',
        ...(contentMaxBytes !== undefined ? { contentMaxBytes } : {}),
      },
    },
    required: ['avatar'],
  });

  it('flags a media value whose DECODED size exceeds contentMaxBytes', () => {
    // "aGVsbG8gd29ybGQ=" decodes to 11 bytes, over the 4-byte field cap.
    const errors = validateAgainstSchema(mediaSchema(4), { avatar: 'aGVsbG8gd29ybGQ=' });
    expect(errors.avatar).toMatch(/over the/i);
  });

  it('passes a media value under contentMaxBytes', () => {
    // "aGk=" decodes to 2 bytes, under the 4-byte cap.
    expect(validateAgainstSchema(mediaSchema(4), { avatar: 'aGk=' })).toEqual({});
  });

  it('measures a data-url value by its decoded body, not its character length', () => {
    // The 30-character string carries an 8-character base64 body decoding to 5 bytes.
    const value = { avatar: 'data:image/png;base64,aGVsbG8=' };
    expect(validateAgainstSchema(mediaSchema(5), value)).toEqual({});
    expect(validateAgainstSchema(mediaSchema(4), value).avatar).toMatch(/over the/i);
  });

  it('applies the maxUploadBytes option when the field pins no cap', () => {
    const errors = validateAgainstSchema(
      mediaSchema(),
      { avatar: 'aGVsbG8gd29ybGQ=' },
      { maxUploadBytes: 4 },
    );
    expect(errors.avatar).toMatch(/over the/i);
  });

  it('lets the field contentMaxBytes override a stingier maxUploadBytes option', () => {
    expect(
      validateAgainstSchema(
        mediaSchema(100),
        { avatar: 'aGVsbG8gd29ybGQ=' },
        { maxUploadBytes: 4 },
      ),
    ).toEqual({});
  });
});

describe('validateAgainstSchema — value/length/items bounds (parity with the server)', () => {
  it('enforces minLength and maxLength on a string', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string', minLength: 2, maxLength: 4 } },
    };
    expect(validateAgainstSchema(schema, { name: 'a' }).name).toMatch(/at least 2/);
    expect(validateAgainstSchema(schema, { name: 'abcde' }).name).toMatch(/at most 4/);
    expect(validateAgainstSchema(schema, { name: 'abc' })).toEqual({});
  });

  it('enforces a string pattern, and surfaces an uncompilable pattern loudly', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { code: { type: 'string', pattern: '^[A-Z]{3}$' } },
    };
    expect(validateAgainstSchema(schema, { code: 'abc' }).code).toMatch(/pattern/);
    expect(validateAgainstSchema(schema, { code: 'ABC' })).toEqual({});

    const broken: JsonSchema = {
      type: 'object',
      properties: { code: { type: 'string', pattern: '(' } },
    };
    expect(validateAgainstSchema(broken, { code: 'x' }).code).toMatch(/invalid pattern/);
  });

  it('enforces minimum and maximum on a number', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1, maximum: 3 } },
    };
    expect(validateAgainstSchema(schema, { count: 0 }).count).toMatch(/at least 1/);
    expect(validateAgainstSchema(schema, { count: 4 }).count).toMatch(/at most 3/);
    expect(validateAgainstSchema(schema, { count: 2 })).toEqual({});
  });

  it('enforces minItems and maxItems on an array', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 } },
    };
    expect(validateAgainstSchema(schema, { tags: [] }).tags).toMatch(/at least 1/);
    expect(validateAgainstSchema(schema, { tags: ['a', 'b', 'c'] }).tags).toMatch(/at most 2/);
    expect(validateAgainstSchema(schema, { tags: ['a'] })).toEqual({});
  });

  it('does not stack a bound error on a wrong-typed value', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1 } },
      required: ['count'],
    };
    expect(validateAgainstSchema(schema, { count: 'nope' }).count).toMatch(/integer/);
  });
});

describe('validateAgainstSchema — date constraints', () => {
  const dateSchema = (extra: Partial<JsonSchema>): JsonSchema => ({
    type: 'object',
    properties: { day: { type: 'string', format: 'date', ...extra } },
  });

  it('enforces inclusive minDate and maxDate bounds', () => {
    const schema = dateSchema({ minDate: '2026-01-10', maxDate: '2026-01-20' });
    expect(validateAgainstSchema(schema, { day: '2026-01-09' }).day).toMatch(/on or after/);
    expect(validateAgainstSchema(schema, { day: '2026-01-21' }).day).toMatch(/on or before/);
    expect(validateAgainstSchema(schema, { day: '2026-01-10' })).toEqual({});
    expect(validateAgainstSchema(schema, { day: '2026-01-20' })).toEqual({});
  });

  it('rejects an unavailable day', () => {
    const schema = dateSchema({ unavailableDates: ['2026-01-15'] });
    expect(validateAgainstSchema(schema, { day: '2026-01-15' }).day).toMatch(/not an available/);
    expect(validateAgainstSchema(schema, { day: '2026-01-16' })).toEqual({});
  });

  it('enforces a range as two date fields: ordering and inclusive span on the end field', () => {
    // The range is two ordinary date strings; the end field names its start field and
    // carries the span. Nothing is recombined — the facet reads the two plain values.
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        start: { type: 'string', format: 'date' },
        end: { type: 'string', format: 'date', rangeStart: 'start', minDays: 2, maxDays: 5 },
      },
    };
    // end before start
    expect(validateAgainstSchema(schema, { start: '2026-01-10', end: '2026-01-09' }).end).toMatch(
      /on or after the start/,
    );
    // span too short (same day = 1 day, below minDays 2)
    expect(validateAgainstSchema(schema, { start: '2026-01-10', end: '2026-01-10' }).end).toMatch(
      /at least 2 day/,
    );
    // span too long (10..16 inclusive = 7 days, above maxDays 5)
    expect(validateAgainstSchema(schema, { start: '2026-01-10', end: '2026-01-16' }).end).toMatch(
      /at most 5 day/,
    );
    // in-range (10..13 inclusive = 4 days)
    expect(validateAgainstSchema(schema, { start: '2026-01-10', end: '2026-01-13' })).toEqual({});
  });
});

describe('validateAgainstSchema — multi-select', () => {
  const multi: JsonSchema = {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string', enum: ['a', 'b', 'c'] }, minItems: 1 },
    },
  };

  it('accepts a selection drawn from the option set', () => {
    expect(validateAgainstSchema(multi, { tags: ['a', 'c'] })).toEqual({});
  });

  it('rejects a value outside the option set', () => {
    expect(validateAgainstSchema(multi, { tags: ['a', 'z'] }).tags).toMatch(/allowed values/);
  });

  it('applies minItems to the selection', () => {
    expect(validateAgainstSchema(multi, { tags: [] }).tags).toMatch(/at least 1/);
  });
});

describe('validateAgainstSchema — conditional fields', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      hasPet: { type: 'boolean' },
      // Required, but only when hasPet is true; hidden otherwise.
      petName: { type: 'string', minLength: 2, visibleWhen: { field: 'hasPet', equals: true } },
    },
    required: ['petName'],
  };

  it('does not require or validate a field hidden by its predicate', () => {
    // hasPet false → petName hidden → not required, and a stale value is not validated.
    expect(validateAgainstSchema(schema, { hasPet: false })).toEqual({});
    expect(validateAgainstSchema(schema, { hasPet: false, petName: 'x' })).toEqual({});
  });

  it('requires and validates the field when its predicate holds', () => {
    expect(validateAgainstSchema(schema, { hasPet: true }).petName).toMatch(/required/);
    expect(validateAgainstSchema(schema, { hasPet: true, petName: 'x' }).petName).toMatch(
      /at least 2/,
    );
    expect(validateAgainstSchema(schema, { hasPet: true, petName: 'Rex' })).toEqual({});
  });
});

describe('validateAgainstSchema — per-field invalid wording', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' },
      code: { type: 'string', pattern: '^[A-Z]{3}$' },
      codeNote: { type: 'string', pattern: '^[a-z]+$' },
      count: { type: 'integer', minimum: 1 },
      tags: { type: 'array', items: { type: 'string', minLength: 2 } },
      address: {
        type: 'object',
        properties: { street: { type: 'string' }, zip: { type: 'string', pattern: '^\\d{5}$' } },
        required: ['street'],
      },
    },
    required: ['email', 'code'],
  };
  const fieldWording = {
    email: { invalid: 'Type your work address' },
    code: { invalid: 'Use three capital letters' },
    count: { invalid: 'Pick one or more' },
    tags: { invalid: 'Each tag needs two letters' },
    address: { invalid: 'Check the address' },
  };

  it("replaces a format, pattern or minimum error with the field's own sentence", () => {
    const errors = validateAgainstSchema(
      schema,
      { email: 'nope', code: 'abc', count: 0 },
      { fieldWording },
    );
    expect(errors.email).toBe('Type your work address');
    expect(errors.code).toBe('Use three capital letters');
    expect(errors.count).toBe('Pick one or more');
  });

  it('keeps the SDK word on a field with no invalid sentence, even one sharing a name prefix', () => {
    const errors = validateAgainstSchema(
      schema,
      { email: 'a@b.co', code: 'ABC', codeNote: 'ABC' },
      { fieldWording },
    );
    expect(errors.codeNote).toBe('must match the required pattern');
  });

  it('never replaces a missing required value, at the top level or inside the field', () => {
    const errors = validateAgainstSchema(schema, { address: { zip: '1' } }, { fieldWording });
    expect(errors.email).toBe('"email" is required');
    expect(errors.code).toBe('"code" is required');
    expect(errors['address.street']).toBe('"street" is required');
    expect(errors['address.zip']).toBe('Check the address');
  });

  it('replaces an error on an array item of the field', () => {
    const errors = validateAgainstSchema(
      schema,
      { email: 'a@b.co', code: 'ABC', tags: ['ok', 'x'] },
      { fieldWording },
    );
    expect(errors['tags[1]']).toBe('Each tag needs two letters');
    expect(errors['tags[0]']).toBeUndefined();
  });

  it('leaves a valid value without an error', () => {
    expect(
      validateAgainstSchema(schema, { email: 'a@b.co', code: 'ABC', count: 2 }, { fieldWording }),
    ).toEqual({});
  });

  it('never replaces the error of a pattern that cannot compile', () => {
    const withBadPattern: JsonSchema = {
      type: 'object',
      properties: { code: { type: 'string', pattern: '(?i)^abc$' } },
    };
    const errors = validateAgainstSchema(
      withBadPattern,
      { code: 'ABC' },
      { fieldWording: { code: { invalid: 'Enter abc' } } },
    );
    expect(errors.code).toBe('has an invalid pattern constraint');
  });

  it('replaces the ordering or span error on a date range end', () => {
    const range: JsonSchema = {
      type: 'object',
      properties: {
        from: { type: 'string', format: 'date' },
        to: { type: 'string', format: 'date', rangeStart: 'from', maxDays: 2 },
      },
    };
    const wording = { fieldWording: { to: { invalid: 'Pick a later end' } } };
    expect(validateAgainstSchema(range, { from: '2026-01-05', to: '2026-01-01' }, wording)).toEqual(
      { to: 'Pick a later end' },
    );
    expect(validateAgainstSchema(range, { from: '2026-01-01', to: '2026-01-05' }, wording)).toEqual(
      { to: 'Pick a later end' },
    );
  });

  describe('a property whose name contains a dot', () => {
    const dotted: JsonSchema = {
      type: 'object',
      properties: {
        a: { type: 'string', pattern: '^x$' },
        'a.b': { type: 'string', minLength: 3 },
      },
    };

    it('does not take the sentence of the field its name starts with', () => {
      const errors = validateAgainstSchema(
        dotted,
        { a: 'y', 'a.b': 'q' },
        { fieldWording: { a: { invalid: 'A sentence' } } },
      );
      expect(errors).toEqual({ a: 'A sentence', 'a.b': 'must be at least 3 character(s)' });
    });

    it('gets its own sentence whatever the order of the wording keys', () => {
      const expected = { a: 'A sentence', 'a.b': 'AB sentence' };
      expect(
        validateAgainstSchema(
          dotted,
          { a: 'y', 'a.b': 'q' },
          { fieldWording: { 'a.b': { invalid: 'AB sentence' }, a: { invalid: 'A sentence' } } },
        ),
      ).toEqual(expected);
      expect(
        validateAgainstSchema(
          dotted,
          { a: 'y', 'a.b': 'q' },
          { fieldWording: { a: { invalid: 'A sentence' }, 'a.b': { invalid: 'AB sentence' } } },
        ),
      ).toEqual(expected);
    });
  });
});

describe('validateAgainstSchema — a property named like a built-in object member', () => {
  it('checks the bounds of a field named toString', () => {
    const field: JsonSchema = { type: 'string', minLength: 3 };
    const schema: JsonSchema = { type: 'object', properties: { toString: field } };
    expect(validateAgainstSchema(schema, { toString: 'x' })).toEqual({
      toString: 'must be at least 3 character(s)',
    });
  });

  it('checks the date range on an end field named constructor', () => {
    const end: JsonSchema = { type: 'string', format: 'date', rangeStart: 'from' };
    const schema: JsonSchema = {
      type: 'object',
      properties: { from: { type: 'string', format: 'date' }, constructor: end },
    };
    expect(
      validateAgainstSchema(schema, { from: '2026-01-05', constructor: '2026-01-01' }),
    ).toEqual({ constructor: 'must be on or after the start date' });
  });

  it('reports the error of a field named __proto__ as its own key', () => {
    // JSON.parse keeps `__proto__` as an ordinary own key, as a schema and value from
    // the wire carry it.
    const schema = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"string"}}}',
    ) as JsonSchema;
    const errors = validateAgainstSchema(schema, JSON.parse('{"__proto__":5}'));
    expect(Object.keys(errors)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(errors, '__proto__')?.value).toBe('must be a string');
  });

  it("puts the field's invalid sentence on a field named __proto__", () => {
    const schema = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"string","minLength":3}}}',
    ) as JsonSchema;
    const errors = validateAgainstSchema(schema, JSON.parse('{"__proto__":"x"}'), {
      fieldWording: JSON.parse('{"__proto__":{"invalid":"Three letters"}}') as Record<
        string,
        { invalid?: string }
      >,
    });
    expect(Object.getOwnPropertyDescriptor(errors, '__proto__')?.value).toBe('Three letters');
  });

  it('leaves an optional blank field named toString without an error', () => {
    const field: JsonSchema = { type: 'string' };
    expect(validateAgainstSchema({ type: 'object', properties: { toString: field } }, {})).toEqual(
      {},
    );
  });

  it('reports a required blank field named toString as required', () => {
    const field: JsonSchema = { type: 'string' };
    const schema: JsonSchema = {
      type: 'object',
      properties: { toString: field },
      required: ['toString'],
    };
    expect(validateAgainstSchema(schema, {})).toEqual({ toString: '"toString" is required' });
  });

  it("keeps the required message over the field's invalid sentence on a blank toString", () => {
    const field: JsonSchema = { type: 'string', minLength: 3 };
    const schema: JsonSchema = {
      type: 'object',
      properties: { toString: field },
      required: ['toString'],
    };
    expect(
      validateAgainstSchema(
        schema,
        {},
        { fieldWording: { toString: { invalid: 'Three letters' } } },
      ),
    ).toEqual({ toString: '"toString" is required' });
  });

  it('reports a required key named constructor that no property declares', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['constructor'],
    };
    expect(validateAgainstSchema(schema, {})).toEqual({
      constructor: '"constructor" is required',
    });
  });

  it('hides a field whose visibleWhen reads a blank field named toString', () => {
    const field: JsonSchema = { type: 'string' };
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        toString: field,
        extra: { type: 'string', visibleWhen: { field: 'toString', notEmpty: true } },
      },
      required: ['extra'],
    };
    expect(validateAgainstSchema(schema, {})).toEqual({});
  });

  it('picks the union variant by the required keys the value itself holds', () => {
    const named: JsonSchema = { type: 'string' };
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        pick: {
          anyOf: [
            { type: 'object', properties: { toString: named }, required: ['toString'] },
            {
              type: 'object',
              properties: { b: { type: 'string', minLength: 2 } },
              required: ['b'],
            },
          ],
        },
      },
    };
    expect(validateAgainstSchema(schema, { pick: { b: 'xy' } })).toEqual({});
  });

  it('returns an ordinary object', () => {
    const errors = validateAgainstSchema(
      { type: 'object', properties: { a: { type: 'string' } } },
      { a: 1 },
    );
    expect(Object.getPrototypeOf(errors)).toBe(Object.prototype);
  });
});
