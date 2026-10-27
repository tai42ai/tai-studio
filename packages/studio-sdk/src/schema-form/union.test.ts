import { describe, expect, it } from 'vitest';

import type { UnionVariant } from './field-model';
import type { JsonSchema } from './types';
import { activeVariantIndex } from './union';

const ROOT: JsonSchema = {
  $defs: {
    Text: {
      type: 'object',
      properties: { content: { type: 'string' }, id: { type: 'string' } },
      'x-tai42-templated-text': { language: 'jinja' },
    },
  },
};

function variants(...schemas: JsonSchema[]): UnionVariant[] {
  return schemas.map((schema, index) => ({
    label: `Option ${String(index + 1)}`,
    tag: undefined,
    schema,
  }));
}

describe('activeVariantIndex', () => {
  it('places an object value on an object variant listed after a scalar one', () => {
    const union = variants({ type: 'string' }, { $ref: '#/$defs/Text' });

    expect(activeVariantIndex({ content: '.a' }, union, undefined, ROOT)).toBe(1);
  });

  it('finds no variant for an object value when no variant takes an object', () => {
    const union = variants({ type: 'string' }, { type: 'integer' });

    expect(activeVariantIndex({ content: '.a' }, union, undefined, ROOT)).toBe(-1);
  });
});
