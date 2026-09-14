/**
 * The shared JSON-object textarea parser: blank omits the field, valid objects pass
 * through, and every non-object / unparseable value throws a loud labelled message.
 */
import { describe, expect, it } from 'vitest';

import { parseJsonObject } from './jsonObjectField';

describe('parseJsonObject', () => {
  it('returns undefined for a blank (or whitespace-only) value', () => {
    expect(parseJsonObject('', 'config')).toBeUndefined();
    expect(parseJsonObject('   ', 'config')).toBeUndefined();
  });

  it('parses a JSON object', () => {
    expect(parseJsonObject('{ "a": 1 }', 'config')).toEqual({ a: 1 });
  });

  it('throws a loud message naming the field on unparseable JSON', () => {
    expect(() => parseJsonObject('not json', 'tool_kwargs')).toThrow(/Invalid JSON/);
  });

  it('throws when the value parses but is not a plain object', () => {
    expect(() => parseJsonObject('"x"', 'tool params')).toThrow(
      /tool params must be a JSON object\./,
    );
    expect(() => parseJsonObject('[1, 2]', 'config')).toThrow(/config must be a JSON object\./);
    expect(() => parseJsonObject('null', 'config')).toThrow(/config must be a JSON object\./);
  });
});
