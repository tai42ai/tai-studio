/**
 * The pure fixed-kwargs row model: parse ⇄ serialise round-trips, the `!ENV` marker
 * grammar, and the per-row validity the editor's submit gate reads.
 */
import { describe, expect, it } from 'vitest';

import {
  formatMarker,
  type KwargRow,
  parseMarker,
  parseRows,
  rowError,
  rowsValid,
  serializeRows,
} from './kwargs-rows';

/** A shorthand for building a row of a given kind for the validity tests. */
function row(patch: Partial<KwargRow> & Pick<KwargRow, 'key' | 'kind'>): KwargRow {
  return { text: '', bool: false, reference: { key: '' }, json: null, ...patch };
}

describe('kwargs-rows model', () => {
  it('classifies every scalar kind and a non-scalar as json, in document order', () => {
    const parsed = parseRows(
      JSON.stringify({
        note: 'hello',
        retries: 3,
        enabled: true,
        cleared: null,
        token: '!ENV ${API_TOKEN}',
        shape: { a: 1 },
      }),
    );
    if (!('rows' in parsed)) throw new Error(parsed.error);
    expect(parsed.rows.map((r) => [r.key, r.kind])).toEqual([
      ['note', 'text'],
      ['retries', 'number'],
      ['enabled', 'boolean'],
      ['cleared', 'null'],
      ['token', 'reference'],
      ['shape', 'json'],
    ]);
  });

  it('round-trips rows ⇄ JSON preserving key order and every value', () => {
    const text = JSON.stringify(
      { note: 'hi', retries: 3, enabled: false, token: '!ENV ${API_TOKEN}', shape: [1, 2] },
      null,
      2,
    );
    const parsed = parseRows(text);
    if (!('rows' in parsed)) throw new Error(parsed.error);
    expect(JSON.parse(serializeRows(parsed.rows))).toEqual({
      note: 'hi',
      retries: 3,
      enabled: false,
      token: '!ENV ${API_TOKEN}',
      shape: [1, 2],
    });
  });

  it('formats and parses a bare marker and one carrying a default', () => {
    expect(formatMarker('API_TOKEN')).toBe('!ENV ${API_TOKEN}');
    expect(formatMarker('API_TOKEN', 'dev')).toBe('!ENV ${API_TOKEN:dev}');
    expect(parseMarker('!ENV ${API_TOKEN}')).toEqual({ key: 'API_TOKEN', default: undefined });
    expect(parseMarker('!ENV ${API_TOKEN:dev}')).toEqual({ key: 'API_TOKEN', default: 'dev' });
  });

  it('rejects a marker with surrounding text or an extra reference (matches the server)', () => {
    expect(parseMarker('prefix !ENV ${VAR}')).toBeNull();
    expect(parseMarker('!ENV ${VAR} tail')).toBeNull();
    expect(parseMarker('!ENV ${A}${B}')).toBeNull();
    expect(parseMarker('a literal string')).toBeNull();
  });

  it('serialises a reference row to the exact marker, with and without a default', () => {
    expect(
      JSON.parse(
        serializeRows([row({ key: 'token', kind: 'reference', reference: { key: 'T' } })]),
      ),
    ).toEqual({ token: '!ENV ${T}' });
    expect(
      JSON.parse(
        serializeRows([
          row({ key: 'token', kind: 'reference', reference: { key: 'T', default: 'x' } }),
        ]),
      ),
    ).toEqual({ token: '!ENV ${T:x}' });
  });

  it('flags a blank key, a duplicate key, an unparseable number, and a variable-less reference', () => {
    const rows = [
      row({ key: '', kind: 'text' }),
      row({ key: 'dup', kind: 'text' }),
      row({ key: 'dup', kind: 'text' }),
      row({ key: 'n', kind: 'number', text: 'abc' }),
      row({ key: 'ref', kind: 'reference', reference: { key: '' } }),
    ];
    expect(rowError(rows, 0)).toBe('Key is required');
    expect(rowError(rows, 1)).toBe('Duplicate key');
    expect(rowError(rows, 2)).toBe('Duplicate key');
    expect(rowError(rows, 3)).toBe('Not a number');
    expect(rowError(rows, 4)).toBe('Environment variable is required');
    expect(rowsValid(rows)).toBe(false);
  });

  it('flags a reference default containing a brace (it cannot round-trip as a marker)', () => {
    const rows = [
      row({ key: 'token', kind: 'reference', reference: { key: 'API_TOKEN', default: 'a{b' } }),
    ];
    expect(rowError(rows, 0)).toBe('Default must not contain { or }');
    expect(rowsValid(rows)).toBe(false);
  });

  it('accepts a well-formed set of rows', () => {
    const rows = [
      row({ key: 'note', kind: 'text', text: 'hi' }),
      row({ key: 'retries', kind: 'number', text: '3' }),
      row({ key: 'token', kind: 'reference', reference: { key: 'API_TOKEN' } }),
    ];
    expect(rowsValid(rows)).toBe(true);
  });

  it('returns a loud parser message for malformed or non-object text', () => {
    expect('error' in parseRows('not json')).toBe(true);
    const nonObject = parseRows('123');
    expect('error' in nonObject && nonObject.error).toBe('Fixed kwargs must be a JSON object.');
  });
});
