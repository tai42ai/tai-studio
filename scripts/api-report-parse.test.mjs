// Unit tests for scripts/api-report-parse.mjs — the api-extractor report parser — on the
// reports it refuses to read. Hermetic: each test parses a small in-memory report fence
// and expects GateError. The gate parses the baseline and the release report with this
// same parser, so a report it refuses fails the gate on either side. How the parsed
// surfaces are classified has its own suite (api-surface-diff.test.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseReport } from './api-report-parse.mjs';
import { GateError } from './gate-error.mjs';

// Build a minimal api-extractor report around a `ts` fence body.
const report = (body) => '```ts\n' + body + '\n```';
const parse = (body) => parseReport('r', report(body));

// ------------------------------------------------------------- wildcard exports
// `export * from 'm'` names no symbol, so nothing about it can be classified: a
// name vanishing behind it would read as no change. The gate never passes on a
// classification it could not compute, so parsing one fails LOUDLY.

test('a wildcard `export * from` fails the gate loudly', () => {
  assert.throws(
    () => parse("export { Kept }\nexport * from 'pkg'"),
    (err) => err instanceof GateError && /enumerate the exports explicitly/i.test(err.message),
  );
});

test('a wildcard with no other export beside it fails too', () => {
  // A baseline report that has always carried a wildcard is parsed by this same
  // code, so it cannot quietly gate on its non-wildcard remainder.
  assert.throws(() => parse("export * from 'pkg'"), GateError);
});

// --------------------------------------------------------------- default slots

test('a default function overload joins only a slot a default function of its name put', () => {
  assert.throws(
    () =>
      parse(
        'declare function f(): void;\nexport default f;\nexport default function f(a: string): void;',
      ),
    (err) =>
      err instanceof GateError &&
      /declares or exports the name "export default" twice/.test(err.message),
  );
});

test('a default function overload of another name does not join the default slot', () => {
  assert.throws(
    () => parse('export default function g(): void;\nexport default function f(a: string): void;'),
    (err) =>
      err instanceof GateError &&
      /declares or exports the name "export default" twice/.test(err.message),
  );
});

test('a name declared twice beside a default class names the default class in the message', () => {
  assert.throws(
    () => parse('export default class C {\n}\nexport default C;'),
    (err) =>
      err instanceof GateError &&
      /declares or exports the name "export default" twice \(default class and export-assignment\)/.test(
        err.message,
      ),
  );
});

// ------------------------------------------------------------ unmodelled statements

test('unparsed text that opens a block throws', () => {
  assert.throws(
    () => parse('export declare namespace N {\n    <S> | null>;\n}'),
    (err) => err instanceof GateError && /could not parse/.test(err.message),
  );
});

test('a statement kind the gate does not model throws', () => {
  assert.throws(
    () =>
      parse(
        'export declare namespace A {\n    namespace Q {\n        const v: string;\n    }\n    export import y = Q;\n}',
      ),
    (err) => err instanceof GateError && /ImportEqualsDeclaration/.test(err.message),
  );
});

// ------------------------------------------------------------------- merged names
// Two declarations under one name (TypeScript merges them into one symbol) cannot be
// classified name by name, so parsing stops loudly; only function overloads share a
// name.

test('two declarations under one name fail the gate loudly', () => {
  const merged = [
    'export interface A {\n    x: string;\n}\nexport declare namespace A {\n    const y: string;\n}',
    'export declare function f(): void;\nexport declare namespace f {\n    const y: string;\n}',
    'export declare namespace f {\n    const y: string;\n}\nexport declare function f(): void;',
    'export interface A {\n    x: string;\n}\nexport interface A {\n    y: string;\n}',
    'declare const a: string;\nexport { a };',
    'export declare namespace N {\n    interface A {\n    }\n    namespace A {\n    }\n}',
  ];
  for (const text of merged) {
    assert.throws(
      () => parse(text),
      (err) =>
        err instanceof GateError && /declares or exports the name "\w+" twice/.test(err.message),
      text,
    );
  }
});

test('a declaration and an export list of the same name fail the gate, naming both', () => {
  assert.throws(
    () => parse('declare const X: number;\nexport { X };'),
    (err) =>
      err instanceof GateError &&
      /declares or exports the name "X" twice \(variable and re-export\)/.test(err.message),
  );
});
