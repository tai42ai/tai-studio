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
});
