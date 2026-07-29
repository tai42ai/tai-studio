/**
 * Schema-level tests for the single-tier preset + tool-tags contracts. Every
 * preset is store-backed and versioned, so `presetRecord` requires a numeric
 * `active_version` and carries the first-class `output_schema` field; any drift
 * from the pinned shape must throw LOUDLY rather than coerce.
 */
import { describe, expect, it } from 'vitest';

import * as schemas from './schemas';

const record = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: 'Paris weather',
  active_version: 1,
  tags: ['geo'],
  extensions: [],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
};

describe('presetRecord — single-tier store-backed row', () => {
  it('parses a row with a numeric active_version and null output_schema', () => {
    const parsed = schemas.presetRecord.parse(record);
    expect(parsed.active_version).toBe(1);
    expect(parsed.output_schema).toBeNull();
    expect(parsed.conflicted).toBe(false);
  });

  it('parses a row carrying an object output_schema', () => {
    const parsed = schemas.presetRecord.parse({
      ...record,
      output_schema: { type: 'object', properties: {} },
    });
    expect(parsed.output_schema).toEqual({ type: 'object', properties: {} });
  });

  it('parses a combo carrying a {name, config} element (config-bearing extension)', () => {
    const parsed = schemas.presetRecord.parse({
      ...record,
      extensions: [['chain', { name: 'ask_external', config: { verifier: 'hmac' } }]],
    });
    expect(parsed.extensions[0]?.[1]).toEqual({
      name: 'ask_external',
      config: { verifier: 'hmac' },
    });
  });

  it('throws loudly on a null active_version (single-tier is always versioned)', () => {
    expect(() => schemas.presetRecord.parse({ ...record, active_version: null })).toThrow();
  });

  it('throws loudly when a required flag is missing (no silent default)', () => {
    const { conflicted: _omitted, ...withoutConflicted } = record;
    expect(() => schemas.presetRecord.parse(withoutConflicted)).toThrow();
  });

  it('throws loudly when output_schema is absent (the backend always emits it)', () => {
    const { output_schema: _omitted, ...withoutSchema } = record;
    expect(() => schemas.presetRecord.parse(withoutSchema)).toThrow();
  });

  it('parses a conflicted row carrying its server conflicted_reason', () => {
    const parsed = schemas.presetRecord.parse({
      ...record,
      conflicted: true,
      conflicted_reason: 'name collided with an existing tool at startup',
    });
    expect(parsed.conflicted_reason).toBe('name collided with an existing tool at startup');
  });

  it('throws loudly when conflicted_reason is absent (the backend always emits it)', () => {
    const { conflicted_reason: _omitted, ...withoutReason } = record;
    expect(() => schemas.presetRecord.parse(withoutReason)).toThrow();
  });

  it('throws loudly when extensions is a flat string list, not a combos list', () => {
    expect(() => schemas.presetRecord.parse({ ...record, extensions: ['chain'] })).toThrow();
  });
});

describe('presetVersion — immutable version row', () => {
  const version = {
    version: 2,
    body: {
      base_tool: 'weather',
      description: 'Paris weather',
      fixed_kwargs: { units: 'imperial' },
      extensions: [],
      tags: ['geo', 'eu'],
      output_schema: null,
    },
    tags: [],
    created_at: '2024-01-01T00:00:03+00:00',
    is_current: true,
  };

  it('parses a version carrying its full body', () => {
    const parsed = schemas.presetVersion.parse(version);
    expect(parsed.body.fixed_kwargs).toEqual({ units: 'imperial' });
    expect(parsed.body.output_schema).toBeNull();
    expect(parsed.is_current).toBe(true);
  });

  it('throws loudly when the body drops a required field', () => {
    const { base_tool: _dropped, ...brokenBody } = version.body;
    expect(() => schemas.presetVersion.parse({ ...version, body: brokenBody })).toThrow();
  });
});

describe('toolTags — additive per-tool native-tags map', () => {
  it('parses an array of {name, tags} entries', () => {
    const parsed = schemas.toolTags.parse([
      { name: 'echo', tags: [] },
      { name: 'paris_weather', tags: ['geo'] },
    ]);
    expect(parsed[1]?.tags).toEqual(['geo']);
  });

  it('throws loudly on a non-string tag (no coercion)', () => {
    expect(() => schemas.toolTags.parse([{ name: 'echo', tags: [1] }])).toThrow();
  });
});

describe('presetReferees — rename preflight', () => {
  it('parses a name plus its referee list', () => {
    const parsed = schemas.presetReferees.parse({ name: 'weather', referees: ['a', 'b'] });
    expect(parsed.referees).toEqual(['a', 'b']);
  });

  it('throws loudly when referees is not a string array', () => {
    expect(() => schemas.presetReferees.parse({ name: 'weather', referees: [1] })).toThrow();
  });
});

describe('presetValidation — dry-run verdict', () => {
  it('parses a clean verdict (valid, no error)', () => {
    const parsed = schemas.presetValidation.parse({ valid: true, error: null });
    expect(parsed.valid).toBe(true);
    expect(parsed.error).toBeNull();
  });

  it('parses an invalid verdict carrying the server message', () => {
    const parsed = schemas.presetValidation.parse({ valid: false, error: 'base tool missing' });
    expect(parsed.error).toBe('base tool missing');
  });

  it('throws loudly when valid is absent (no silent default)', () => {
    expect(() => schemas.presetValidation.parse({ error: null })).toThrow();
  });
});

describe('presetVersionTags — re-annotated version', () => {
  it('parses the identity plus the new tag list', () => {
    const parsed = schemas.presetVersionTags.parse({
      name: 'weather',
      version: 2,
      tags: ['stable'],
    });
    expect(parsed).toEqual({ name: 'weather', version: 2, tags: ['stable'] });
  });

  it('throws loudly on a non-string tag (no coercion)', () => {
    expect(() =>
      schemas.presetVersionTags.parse({ name: 'weather', version: 2, tags: [1] }),
    ).toThrow();
  });
});
