import { describe, expect, it } from 'vitest';

import { lintSchemaText } from './lint';

describe('lintSchemaText', () => {
  it('treats empty text as a valid, unset schema (null)', () => {
    expect(lintSchemaText('   ', false)).toEqual({ schema: null, valid: true, error: undefined });
  });

  it('reports the parser message verbatim on malformed JSON', () => {
    const text = '{ not json';
    let parserMessage = '';
    try {
      JSON.parse(text.trim());
    } catch (error) {
      parserMessage = error instanceof Error ? error.message : '';
    }
    const result = lintSchemaText(text, false);
    expect(result.valid).toBe(false);
    expect(result.schema).toBeNull();
    // Verbatim: the exact JSON parser message, never a generic replacement.
    expect(parserMessage.length).toBeGreaterThan(0);
    expect(result.error).toBe(parserMessage);
  });

  it('rejects a top-level value that is not a JSON object', () => {
    expect(lintSchemaText('[1, 2]', false)).toEqual({
      schema: null,
      valid: false,
      error: 'The schema must be a JSON object.',
    });
    expect(lintSchemaText('"a string"', false).valid).toBe(false);
  });

  it('requires a top-level string title only when requireTitle is set', () => {
    const noTitle = '{ "type": "object", "properties": {} }';
    // requireTitle=false → valid without a title.
    expect(lintSchemaText(noTitle, false).valid).toBe(true);
    // requireTitle=true → invalid, but still carries the parsed dict for the preview.
    const strict = lintSchemaText(noTitle, true);
    expect(strict.valid).toBe(false);
    expect(strict.error).toMatch(/title/i);
    expect(strict.schema).toEqual({ type: 'object', properties: {} });
    // requireTitle=true with a title → valid.
    expect(lintSchemaText('{ "type": "object", "title": "Report" }', true).valid).toBe(true);
  });

  it('returns the parsed dict untouched (no normalization or reordering)', () => {
    const text = JSON.stringify({
      $defs: { Item: { type: 'string' } },
      type: 'object',
      properties: { any: { anyOf: [{ $ref: '#/$defs/Item' }, { type: 'null' }] } },
    });
    const result = lintSchemaText(text, false);
    expect(result.valid).toBe(true);
    expect(result.schema).toEqual(JSON.parse(text));
  });
});
