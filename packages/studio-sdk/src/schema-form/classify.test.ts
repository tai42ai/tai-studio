/**
 * Direct tests for the `unsupported` branches of `classifySchema` — the
 * "never silently drop a field" safety net. Each construct here is one a form
 * cannot faithfully render; classification must land it on `unsupported` (rather
 * than falling through to a wrong, silently-lossy field), so a regression that
 * drops one of these fails a test.
 */
import { describe, expect, it } from 'vitest';

import { classifySchema } from './classify';
import type { JsonSchema } from './types';

/** Classify a self-contained schema (it is its own `$ref` resolution root). */
function classify(schema: JsonSchema): ReturnType<typeof classifySchema> {
  return classifySchema(schema, schema);
}

describe('classifySchema — unsupported constructs', () => {
  it('flags an array schema without an items schema', () => {
    const model = classify({ type: 'array' }).model;
    expect(model.kind).toBe('unsupported');
  });

  it('flags a free-form object without properties', () => {
    const model = classify({ type: 'object' }).model;
    expect(model.kind).toBe('unsupported');
  });

  it('flags multiple non-null JSON types without a discriminator', () => {
    const model = classify({ type: ['string', 'number'] }).model;
    expect(model.kind).toBe('unsupported');
  });

  it('flags an allOf intersection of multiple schemas', () => {
    const model = classify({
      allOf: [{ type: 'object', properties: {} }, { type: 'string' }],
    }).model;
    expect(model.kind).toBe('unsupported');
  });

  it('still flags an object with a boolean additionalProperties (no value type)', () => {
    // `additionalProperties: true` admits any value but names no schema to build
    // an entry editor from, so it stays unsupported rather than becoming a record.
    expect(classify({ type: 'object', additionalProperties: true }).model.kind).toBe('unsupported');
    expect(classify({ type: 'object', additionalProperties: false }).model.kind).toBe(
      'unsupported',
    );
  });

  it('does NOT treat a null additionalProperties as a record (no value schema)', () => {
    // `typeof null === 'object'`, so without the null guard this would classify as a
    // record whose value schema is `null` — an entry editor built from nothing.
    const model = classify({
      type: 'object',
      additionalProperties: null as unknown as JsonSchema,
    }).model;
    expect(model.kind).toBe('unsupported');
  });
});

describe('classifySchema — record (additionalProperties map)', () => {
  it('classifies a string→X map as a record and surfaces the value schema', () => {
    const model = classify({
      type: 'object',
      additionalProperties: { type: 'string' },
    }).model;
    expect(model.kind).toBe('record');
    if (model.kind === 'record') {
      expect(model.values).toEqual({ type: 'string' });
    }
  });

  it('does NOT classify an object WITH fixed properties as a record', () => {
    const model = classify({
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: { type: 'string' },
    }).model;
    expect(model.kind).toBe('object');
  });

  it('passes the value schema through as written for the entry editor to resolve', () => {
    const model = classify({
      type: 'object',
      additionalProperties: { $ref: '#/$defs/Entry' },
    }).model;
    expect(model.kind).toBe('record');
    if (model.kind === 'record') {
      expect(model.values).toEqual({ $ref: '#/$defs/Entry' });
    }
  });
});
