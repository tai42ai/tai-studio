import { describe, expect, it } from 'vitest';

import { resolveRef } from './resolve';
import type { JsonSchema } from './types';

describe('resolveRef', () => {
  const root: JsonSchema = {
    type: 'object',
    $defs: {
      Address: { type: 'object', properties: { street: { type: 'string' } } },
      Alias: { $ref: '#/$defs/Address' },
    },
  };

  it('returns a schema without a $ref unchanged', () => {
    const schema: JsonSchema = { type: 'string' };
    expect(resolveRef(schema, root)).toBe(schema);
  });

  it('resolves an internal #/$defs pointer', () => {
    const resolved = resolveRef({ $ref: '#/$defs/Address' }, root);
    expect(resolved.type).toBe('object');
    expect(resolved.properties?.street).toEqual({ type: 'string' });
  });

  it('follows a chained $ref to the final target', () => {
    const resolved = resolveRef({ $ref: '#/$defs/Alias' }, root);
    expect(resolved.properties?.street).toEqual({ type: 'string' });
  });

  it('throws loudly on an unresolvable pointer', () => {
    expect(() => resolveRef({ $ref: '#/$defs/Missing' }, root)).toThrow(/unresolvable/);
  });

  it('throws loudly on an external ref', () => {
    expect(() => resolveRef({ $ref: 'https://example.com/schema' }, root)).toThrow(/same-document/);
  });

  it('throws loudly on a circular ref chain', () => {
    const cyclic: JsonSchema = { $defs: { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } } };
    expect(() => resolveRef({ $ref: '#/$defs/A' }, cyclic)).toThrow(/circular/);
  });
});
