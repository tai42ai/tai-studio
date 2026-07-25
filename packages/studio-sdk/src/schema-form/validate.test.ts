import { describe, expect, it } from 'vitest';

import { validateAgainstSchema } from './validate';
import type { JsonSchema } from './types';

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

  it('surfaces an unsupported construct as an error rather than passing silently', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { anything: {} },
      required: ['anything'],
    };
    const errors = validateAgainstSchema(schema, { anything: 42 });
    expect(errors.anything).toMatch(/unsupported/);
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
