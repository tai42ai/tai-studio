import { describe, expect, it } from 'vitest';

import {
  compileAdapter,
  defaultRowsForInput,
  fieldPathToJq,
  generateTemplateCall,
  jqKey,
  parseAdapter,
  parseFieldPath,
  parseTemplateCall,
  rowValueJq,
  type MappingRow,
} from './adapter';

describe('jqKey', () => {
  it('keeps a bare identifier and quotes anything else', () => {
    expect(jqKey('total')).toBe('total');
    expect(jqKey('_a1')).toBe('_a1');
    expect(jqKey('odd key')).toBe('"odd key"');
    expect(jqKey('1abc')).toBe('"1abc"');
    expect(jqKey('a.b')).toBe('"a.b"');
  });
});

describe('fieldPathToJq', () => {
  it('renders each root with a dotted path', () => {
    expect(fieldPathToJq('output', [])).toBe('.output');
    expect(fieldPathToJq('input', ['user', 'name'])).toBe('.input.user.name');
    expect(fieldPathToJq('input', ['count'])).toBe('.input.count');
  });

  it('brackets a non-identifier segment', () => {
    expect(fieldPathToJq('output', ['odd key'])).toBe('.output["odd key"]');
    expect(fieldPathToJq('output', ['a', '1x', 'b'])).toBe('.output.a["1x"].b');
  });
});

describe('rowValueJq — the per-row "show jq"', () => {
  it('compiles a picked field', () => {
    expect(rowValueJq({ kind: 'field', root: 'output', path: ['total'] })).toEqual({
      ok: true,
      jq: '.output.total',
    });
  });

  it('compiles a JSON literal to a canonical jq literal', () => {
    expect(rowValueJq({ kind: 'literal', json: '"hello"' })).toEqual({ ok: true, jq: '"hello"' });
    expect(rowValueJq({ kind: 'literal', json: ' 42 ' })).toEqual({ ok: true, jq: '42' });
    expect(rowValueJq({ kind: 'literal', json: 'true' })).toEqual({ ok: true, jq: 'true' });
    expect(rowValueJq({ kind: 'literal', json: '{"a":1}' })).toEqual({ ok: true, jq: '{"a":1}' });
  });

  it('rejects an empty or malformed literal loudly', () => {
    expect(rowValueJq({ kind: 'literal', json: '   ' })).toEqual({
      ok: false,
      error: 'Enter a value.',
    });
    expect(rowValueJq({ kind: 'literal', json: '{bad' })).toEqual({
      ok: false,
      error: 'This is not valid JSON.',
    });
  });

  it('passes a jq expression through and rejects an empty one', () => {
    expect(rowValueJq({ kind: 'jq', expr: '.output.total + 1' })).toEqual({
      ok: true,
      jq: '.output.total + 1',
    });
    expect(rowValueJq({ kind: 'jq', expr: '   ' })).toEqual({
      ok: false,
      error: 'Enter a jq expression.',
    });
  });
});

describe('compileAdapter — the whole form compiles into ONE adapter jq', () => {
  it('compiles an empty form to the empty object', () => {
    expect(compileAdapter([])).toEqual({ ok: true, jq: '{}' });
  });

  it('compiles a single picked-field row', () => {
    const rows: MappingRow[] = [
      { target: 'total', source: { kind: 'field', root: 'output', path: ['total'] } },
    ];
    expect(compileAdapter(rows)).toEqual({ ok: true, jq: '{ total: (.output.total) }' });
  });

  it('compiles a literal row', () => {
    const rows: MappingRow[] = [{ target: 'label', source: { kind: 'literal', json: '"on"' } }];
    expect(compileAdapter(rows)).toEqual({ ok: true, jq: '{ label: ("on") }' });
  });

  it('compiles a jq row', () => {
    const rows: MappingRow[] = [
      { target: 'sum', source: { kind: 'jq', expr: '.output.a + .state.b' } },
    ];
    expect(compileAdapter(rows)).toEqual({ ok: true, jq: '{ sum: (.output.a + .state.b) }' });
  });

  it('compiles a mix of all three sources, preserving row order', () => {
    const rows: MappingRow[] = [
      { target: 'total', source: { kind: 'field', root: 'output', path: ['total'] } },
      { target: 'label', source: { kind: 'literal', json: '"on"' } },
      { target: 'note', source: { kind: 'jq', expr: '.input.memo // "n/a"' } },
    ];
    expect(compileAdapter(rows)).toEqual({
      ok: true,
      jq: '{ total: (.output.total), label: ("on"), note: (.input.memo // "n/a") }',
    });
  });

  it('quotes a non-identifier target key', () => {
    const rows: MappingRow[] = [
      { target: 'odd key', source: { kind: 'field', root: 'input', path: [] } },
    ];
    expect(compileAdapter(rows)).toEqual({ ok: true, jq: '{ "odd key": (.input) }' });
  });

  it('rejects a blank target, a duplicate target, and an invalid source', () => {
    expect(
      compileAdapter([{ target: '  ', source: { kind: 'field', root: 'output', path: [] } }]),
    ).toEqual({
      ok: false,
      error: 'Every mapping row needs a target field.',
    });
    expect(
      compileAdapter([
        { target: 'a', source: { kind: 'field', root: 'output', path: [] } },
        { target: 'a', source: { kind: 'literal', json: '1' } },
      ]),
    ).toEqual({ ok: false, error: "The field 'a' is mapped twice." });
    expect(compileAdapter([{ target: 'a', source: { kind: 'literal', json: '{bad' } }])).toEqual({
      ok: false,
      error: 'a: This is not valid JSON.',
    });
  });
});

describe('parseFieldPath', () => {
  it('recovers a field source and rejects a non-path', () => {
    expect(parseFieldPath('.output.total')).toEqual({
      kind: 'field',
      root: 'output',
      path: ['total'],
    });
    expect(parseFieldPath('.input["odd key"].x')).toEqual({
      kind: 'field',
      root: 'input',
      path: ['odd key', 'x'],
    });
    expect(parseFieldPath('.output')).toEqual({ kind: 'field', root: 'output', path: [] });
    expect(parseFieldPath('.output.total + 1')).toBeNull();
    expect(parseFieldPath('.state.x')).toBeNull();
    expect(parseFieldPath('42')).toBeNull();
  });
});

describe('parseAdapter — the round-trip parse(generate(rows)) === rows', () => {
  const cases: { readonly name: string; readonly rows: MappingRow[] }[] = [
    {
      name: 'field',
      rows: [{ target: 'total', source: { kind: 'field', root: 'output', path: ['total'] } }],
    },
    {
      name: 'input field',
      rows: [{ target: 'memo', source: { kind: 'field', root: 'input', path: ['note'] } }],
    },
    {
      name: 'whole value',
      rows: [{ target: 'all', source: { kind: 'field', root: 'output', path: [] } }],
    },
    { name: 'literal', rows: [{ target: 'label', source: { kind: 'literal', json: '"on"' } }] },
    { name: 'number literal', rows: [{ target: 'n', source: { kind: 'literal', json: '42' } }] },
    {
      name: 'object literal',
      rows: [{ target: 'o', source: { kind: 'literal', json: '{"a":1}' } }],
    },
    { name: 'jq', rows: [{ target: 'sum', source: { kind: 'jq', expr: '.output.a + .input.b' } }] },
    {
      name: 'jq with parens and string',
      rows: [{ target: 'x', source: { kind: 'jq', expr: '(.output.a // ")")' } }],
    },
    {
      name: 'quoted target',
      rows: [{ target: 'odd key', source: { kind: 'field', root: 'input', path: [] } }],
    },
    {
      name: 'mixed',
      rows: [
        { target: 'total', source: { kind: 'field', root: 'output', path: ['total'] } },
        { target: 'label', source: { kind: 'literal', json: '"on"' } },
        { target: 'note', source: { kind: 'jq', expr: '.input.memo // "n/a"' } },
      ],
    },
  ];
  for (const { name, rows } of cases) {
    it(`round-trips a ${name} row`, () => {
      const compiled = compileAdapter(rows);
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      expect(parseAdapter(compiled.jq)).toEqual(rows);
    });
  }

  it('recovers the empty object as no rows', () => {
    expect(parseAdapter('{}')).toEqual([]);
  });

  it('returns null for a shape it does not recognise', () => {
    expect(parseAdapter('.output.total')).toBeNull();
    expect(parseAdapter('{ total: .output.total }')).toBeNull(); // no wrapping parens
    expect(parseAdapter('not json')).toBeNull();
  });
});

describe('template call — tjq_<callName>({…})', () => {
  it('round-trips an unqualified call name + adapter rows', () => {
    const rows: MappingRow[] = [
      { target: 'total', source: { kind: 'field', root: 'output', path: ['total'] } },
    ];
    const call = generateTemplateCall('bump', rows);
    expect(call).toBe('tjq_bump({ total: (.output.total) })');
    const parsed = parseTemplateCall(call);
    expect(parsed?.callName).toBe('bump');
    expect(parsed).not.toBeNull();
    if (parsed !== null) expect(parseAdapter(parsed.adapter)).toEqual(rows);
  });

  it('encodes the template segment (- → _), and parse returns the RAW call name (never split)', () => {
    expect(generateTemplateCall('tally.bump', [])).toBe('tjq_tally__bump({})');
    // A hyphen in the template name is not a legal jq identifier → encoded to `_`.
    expect(generateTemplateCall('my-tally.bump', [])).toBe('tjq_my_tally__bump({})');
    // A jq name may itself carry `__`; the encoding stays unambiguous only via the catalog.
    expect(generateTemplateCall('tally.bump__count', [])).toBe('tjq_tally__bump__count({})');
    // A hyphenated template AND a `__` jq name together — the first `__` is the boundary.
    expect(generateTemplateCall('my-tally.bump__count', [])).toBe('tjq_my_tally__bump__count({})');
    expect(parseTemplateCall('tjq_my_tally__bump__count({})')?.callName).toBe(
      'my_tally__bump__count',
    );
    expect(parseTemplateCall('tjq_my_tally__bump({})')?.callName).toBe('my_tally__bump');
    expect(parseTemplateCall('.output.total')).toBeNull();
    expect(parseTemplateCall('other(.x)')).toBeNull();
  });
});

describe('defaultRowsForInput', () => {
  it('builds one output-field row per declared input key', () => {
    expect(defaultRowsForInput(['total', 'label'])).toEqual([
      { target: 'total', source: { kind: 'field', root: 'output', path: [] } },
      { target: 'label', source: { kind: 'field', root: 'output', path: [] } },
    ]);
  });

  it('is empty for a jq that declares no input', () => {
    expect(defaultRowsForInput([])).toEqual([]);
  });
});
