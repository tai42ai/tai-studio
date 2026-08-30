/**
 * Direct tests for the `json` fallback branches of `classifySchema` — the
 * "never silently drop a field" safety net. Each construct here is one a form
 * cannot build a STRUCTURED editor for; classification must land it on the free-
 * form `json` kind (rather than falling through to a wrong, silently-lossy field),
 * carrying the container constraint (`jsonType`) the editor and validator enforce.
 * A regression that drops one of these, or picks the wrong container, fails a test.
 */
import { describe, expect, it } from 'vitest';

import { classifySchema } from './classify';
import type { JsonSchema } from './types';

/** Classify a self-contained schema (it is its own `$ref` resolution root). */
function classify(schema: JsonSchema): ReturnType<typeof classifySchema> {
  return classifySchema(schema, schema);
}

describe('classifySchema — json fallback constructs', () => {
  it('lands an array schema without an items schema on a json (array) field', () => {
    const model = classify({ type: 'array' }).model;
    expect(model).toMatchObject({ kind: 'json', jsonType: 'array' });
  });

  it('lands a free-form object without properties on a json (object) field', () => {
    const model = classify({ type: 'object' }).model;
    expect(model).toMatchObject({ kind: 'json', jsonType: 'object' });
  });

  it('lands an open schema with no declared type on a json (any) field', () => {
    const model = classify({}).model;
    expect(model).toMatchObject({ kind: 'json', jsonType: 'any' });
  });

  it('lands multiple non-null JSON types without a discriminator on a json (any) field', () => {
    const model = classify({ type: ['string', 'number'] }).model;
    expect(model).toMatchObject({ kind: 'json', jsonType: 'any' });
  });

  it('lands an allOf intersection of multiple schemas on a json (any) field', () => {
    const model = classify({
      allOf: [{ type: 'object', properties: {} }, { type: 'string' }],
    }).model;
    expect(model).toMatchObject({ kind: 'json', jsonType: 'any' });
  });

  it('keeps an allOf intersection nullable — its null-acceptance is undecidable', () => {
    // `allOf: [{}, {}]` genuinely permits null; whether any given intersection
    // does is not decidable here, so the escape hatch never rejects null.
    const classified = classify({ allOf: [{}, { description: 'extra' }] });
    expect(classified.model).toMatchObject({ kind: 'json', jsonType: 'any' });
    expect(classified.nullable).toBe(true);
  });

  it('carries nullability onto a nullable free-form object', () => {
    // `type: ['object', 'null']` with no properties: a json (object) field that
    // also accepts `null`, so the editor and validator let `null` through.
    const classified = classify({ type: ['object', 'null'] });
    expect(classified.model).toMatchObject({ kind: 'json', jsonType: 'object' });
    expect(classified.nullable).toBe(true);
  });

  it('lands an object with a boolean additionalProperties on a json (object) field', () => {
    // `additionalProperties: true`/`false` admits values but names no schema to
    // build an entry editor from, so it edits as free-form JSON rather than a record.
    expect(classify({ type: 'object', additionalProperties: true }).model).toMatchObject({
      kind: 'json',
      jsonType: 'object',
    });
    expect(classify({ type: 'object', additionalProperties: false }).model).toMatchObject({
      kind: 'json',
      jsonType: 'object',
    });
  });

  it('does NOT treat a null additionalProperties as a record (no value schema)', () => {
    // `typeof null === 'object'`, so without the null guard this would classify as a
    // record whose value schema is `null` — an entry editor built from nothing.
    const model = classify({
      type: 'object',
      additionalProperties: null as unknown as JsonSchema,
    }).model;
    expect(model).toMatchObject({ kind: 'json', jsonType: 'object' });
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
