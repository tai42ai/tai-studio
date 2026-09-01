// Unit tests for scripts/api-gate.mjs — the release API-diff gate. Hermetic: the
// pure decision helpers and the report classifier are exercised directly from
// small in-memory api-extractor report fences. No git, no network, no build.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  parseReport,
  classify,
  bumpClass,
  allowedBumps,
  gatePasses,
  GateError,
} from './api-gate.mjs';

// Build a minimal api-extractor report around a `ts` fence body.
const report = (body) => '```ts\n' + body + '\n```';
const findings = (oldBody, newBody) =>
  classify('r', parseReport('r', report(oldBody)), parseReport('r', report(newBody)));

// ---------------------------------------------------------------- bump class

test('bumpClass classifies major/minor/patch', () => {
  assert.equal(bumpClass('1.0.0', '2.0.0'), 'major');
  assert.equal(bumpClass('1.0.0', '1.1.0'), 'minor');
  assert.equal(bumpClass('1.0.0', '1.0.1'), 'patch');
  assert.equal(bumpClass('0.1.0', '0.2.0'), 'minor');
});

test('bumpClass fails loudly on a non-increasing version', () => {
  assert.throws(() => bumpClass('1.1.0', '1.0.0'), GateError);
  assert.throws(() => bumpClass('1.0.0', '1.0.0'), GateError);
});

// --------------------------------------------------------------- allowed set

test('allowedBumps is version-aware in label-honesty, major-only in strict', () => {
  assert.deepEqual([...allowedBumps('label-honesty', 1)].sort(), ['major']);
  assert.deepEqual([...allowedBumps('label-honesty', 2)].sort(), ['major']);
  assert.deepEqual([...allowedBumps('label-honesty', 0)].sort(), ['major', 'minor']);
  assert.deepEqual([...allowedBumps('strict', 0)].sort(), ['major']);
  assert.deepEqual([...allowedBumps('strict', 1)].sort(), ['major']);
});

test('allowedBumps fails loudly on an unknown mode', () => {
  assert.throws(() => allowedBumps('bogus', 1), GateError);
});

// ----------------------------------------------------------- decision matrix

test('gate decision matrix', () => {
  // A >=1.0 package sneaking a breaking change into a minor — the incident the
  // gate must catch — fails; the honest bumps pass.
  assert.equal(gatePasses('label-honesty', '1.0.0', '1.1.0', true).passes, false);
  assert.equal(gatePasses('label-honesty', '0.1.0', '0.2.0', true).passes, true);
  assert.equal(gatePasses('label-honesty', '1.0.0', '2.0.0', true).passes, true);
  assert.equal(gatePasses('strict', '0.1.0', '0.2.0', true).passes, false);
  assert.equal(gatePasses('strict', '1.0.0', '2.0.0', true).passes, true);
  // No breaking surface change always passes, whatever the bump.
  assert.equal(gatePasses('label-honesty', '1.0.0', '1.0.1', false).passes, true);
  assert.equal(gatePasses('strict', '0.1.0', '0.1.1', false).passes, true);
});

test('a failing reason names mode, version class, computed class and bump', () => {
  const { reason } = gatePasses('label-honesty', '1.0.0', '1.1.0', true);
  assert.match(reason, /mode=label-honesty/);
  assert.match(reason, /version class=>=1\.0/);
  assert.match(reason, /computed allowed bump\(s\)=major/);
  assert.match(reason, /bump=minor/);
});

test('the allowed set renders comma-joined and sorted, no brackets or quotes', () => {
  // A 0.x package breaking in a patch: allowed={minor,major}, so the multi-element
  // rendering is exercised — pinned to the exact "major,minor" form (parity with
  // the Python gate), never a bracketed/quoted list.
  const { reason } = gatePasses('label-honesty', '0.1.0', '0.1.1', true);
  assert.match(reason, /computed allowed bump\(s\)=major,minor, bump=patch/);
  assert.doesNotMatch(reason, /[[\]']/);
});

// ----------------------------------------------------- interface member diff

test('removing an index signature is breaking', () => {
  const found = findings(
    'export interface Bag {\n  [key: string]: number;\n  size: number;\n}',
    'export interface Bag {\n  size: number;\n}',
  );
  assert.ok(found.some((f) => f.includes('[index signature]')));
});

test('removing a call signature is breaking', () => {
  const found = findings(
    'export interface Fn {\n  (x: number): void;\n}',
    'export interface Fn {\n  size: number;\n}',
  );
  assert.ok(found.some((f) => f.includes('[call signature]')));
});

test('removing a method overload is breaking', () => {
  // Drop the FIRST overload: a name-keyed last-wins member map would keep the
  // surviving `call(string)` on both sides and miss the removal entirely.
  const found = findings(
    'export interface Api {\n  call(x: number): void;\n  call(x: string): void;\n}',
    'export interface Api {\n  call(x: string): void;\n}',
  );
  assert.ok(found.some((f) => f.includes('"call"')));
});

test('adding an optional member is non-breaking', () => {
  const found = findings(
    'export interface I {\n  a: number;\n}',
    'export interface I {\n  a: number;\n  b?: string;\n}',
  );
  assert.deepEqual(found, []);
});

test('adding a required member is breaking', () => {
  const found = findings(
    'export interface I {\n  a: number;\n}',
    'export interface I {\n  a: number;\n  b: string;\n}',
  );
  assert.ok(found.some((f) => f.includes('"b"')));
});

test('a member turned required -> optional is non-breaking', () => {
  // Loosening a requirement never breaks a consumer; the optionality-normalized
  // signatures compare equal across the flip, so nothing else reads as a change.
  const found = findings(
    'export interface I {\n  a: number;\n  b(x: string): void;\n}',
    'export interface I {\n  a?: number;\n  b?(x: string): void;\n}',
  );
  assert.deepEqual(found, []);
});

test('a member turned optional -> required stays breaking', () => {
  const found = findings(
    'export interface I {\n  a?: number;\n}',
    'export interface I {\n  a: number;\n}',
  );
  assert.ok(found.some((f) => f.includes('"a"') && f.includes('became required')));
});

test('adding readonly to a member stays breaking (documented-conservative)', () => {
  const found = findings(
    'export interface I {\n  a: number;\n}',
    'export interface I {\n  readonly a: number;\n}',
  );
  assert.ok(found.some((f) => f.includes('"a"')));
});

// ------------------------------------------------------------- type aliases

test('widening a string-literal union is non-breaking', () => {
  const found = findings(
    "export type Color = 'red' | 'green';",
    "export type Color = 'red' | 'green' | 'blue';",
  );
  assert.deepEqual(found, []);
});

test('removing a string-literal union member is breaking', () => {
  const found = findings(
    "export type Color = 'red' | 'green' | 'blue';",
    "export type Color = 'red' | 'green';",
  );
  assert.ok(found.some((f) => f.includes('Color')));
});

// -------------------------------------------------------------------- enums

test('adding an enum member is non-breaking', () => {
  const found = findings(
    "export enum E {\n  A = 'a',\n  B = 'b'\n}",
    "export enum E {\n  A = 'a',\n  B = 'b',\n  C = 'c'\n}",
  );
  assert.deepEqual(found, []);
});

test('removing an enum member is breaking', () => {
  const found = findings(
    "export enum E {\n  A = 'a',\n  B = 'b',\n  C = 'c'\n}",
    "export enum E {\n  A = 'a',\n  B = 'b'\n}",
  );
  assert.ok(found.some((f) => f.includes('enum member "C"')));
});

// --------------------------------------------------------------- namespaces

test('removing a namespace member is breaking', () => {
  const found = findings(
    'export namespace NS {\n  export function foo(): void;\n  export function bar(): void;\n}',
    'export namespace NS {\n  export function foo(): void;\n}',
  );
  assert.ok(found.some((f) => f.includes('NS.bar')));
});

test('adding a namespace member is non-breaking', () => {
  const found = findings(
    'export namespace NS {\n  export function foo(): void;\n}',
    'export namespace NS {\n  export function foo(): void;\n  export function baz(): void;\n}',
  );
  assert.deepEqual(found, []);
});

// ----------------------------------------------------------- baseline removal

test('removing an exported symbol is breaking', () => {
  const found = findings(
    'export interface Kept {\n  a: number;\n}\nexport interface Gone {\n  b: number;\n}',
    'export interface Kept {\n  a: number;\n}',
  );
  assert.ok(found.some((f) => f.includes('Gone')));
});

// -------------------------------------------------------- bare re-export lines
// api-extractor renders a symbol re-exported from a dependency as a bare
// `export { Foo }` line — no local declaration to classify. Those are public API
// exactly like a declared one, so dropping a package's whole re-export surface
// (say, retiring a pass-through) must read as breaking rather than as no change.

test('removing a bare re-export is breaking', () => {
  const found = findings(
    "import { JqField } from 'pkg';\nexport { JqField }\nexport { Kept }",
    'export { Kept }',
  );
  assert.ok(found.some((f) => f.includes('JqField')));
});

test('adding a bare re-export is non-breaking', () => {
  const found = findings('export { Kept }', 'export { Kept }\nexport { Added }');
  assert.deepEqual(found, []);
});

test('re-pointing an exported name at a different local symbol is breaking', () => {
  const found = findings('export { A as Foo }', 'export { B as Foo }');
  assert.ok(found.some((f) => f.includes('Foo')));
});

test('narrowing a value re-export to type-only is breaking', () => {
  const found = findings('export { Foo }', 'export type { Foo }');
  assert.ok(found.some((f) => f.includes('Foo')));
});

test('an unchanged re-export surface is clean', () => {
  const found = findings(
    'export { A as Foo }\nexport type { Bar }',
    'export { A as Foo }\nexport type { Bar }',
  );
  assert.deepEqual(found, []);
});

test('re-pointing a re-export at a different SOURCE MODULE is breaking', () => {
  // Same exported name, same local symbol, different package behind it: the name a
  // consumer imports now resolves to another implementation.
  const found = findings("export { Foo } from 'pkg-a'", "export { Foo } from 'pkg-b'");
  assert.ok(found.some((f) => f.includes('Foo')));
});

test('a re-export keeping its source module is clean', () => {
  assert.deepEqual(findings("export { Foo } from 'pkg-a'", "export { Foo } from 'pkg-a'"), []);
});

// ------------------------------------------------------------- wildcard exports
// `export * from 'm'` names no symbol, so nothing about it can be classified: a
// name vanishing behind it would read as no change. The gate never passes on a
// classification it could not compute, so parsing one fails LOUDLY.

test('a wildcard `export * from` fails the gate loudly', () => {
  assert.throws(
    () => findings('export { Kept }', "export { Kept }\nexport * from 'pkg'"),
    (err) => err instanceof GateError && /enumerate the exports explicitly/i.test(err.message),
  );
});

test('a wildcard already present on the OLD side fails too', () => {
  // The old report is parsed by the same code path, so a report that has always
  // carried a wildcard cannot quietly gate on its non-wildcard remainder.
  assert.throws(() => findings("export * from 'pkg'", 'export { Kept }'), GateError);
});

test('a NAMESPACE re-export is classified, not rejected', () => {
  // `export * as ns from 'm'` names exactly one symbol (`ns`), so it is classifiable:
  // unchanged is clean, removed is breaking.
  assert.deepEqual(findings("export * as ns from 'pkg'", "export * as ns from 'pkg'"), []);
  const found = findings("export * as ns from 'pkg'\nexport { Kept }", 'export { Kept }');
  assert.ok(found.some((f) => f.includes('ns')));
});

// --------------------------------------------------------------- default slots
// `export default Foo` / `export = Foo` are consumable names too: dropping one
// breaks every `import Foo from '<pkg>'` (or `require`) consumer.

test('removing a default export is breaking', () => {
  const found = findings(
    'declare const _default: () => void;\nexport default _default;',
    'declare const _default: () => void;',
  );
  assert.ok(found.some((f) => f.includes('export default')));
});

test('re-pointing a default export at a different symbol is breaking', () => {
  const found = findings('export default A;', 'export default B;');
  assert.ok(found.some((f) => f.includes('export default')));
});

test('adding a default export is non-breaking', () => {
  assert.deepEqual(findings('export { Kept }', 'export { Kept }\nexport default A;'), []);
});

test('swapping `export default` for `export =` is breaking', () => {
  const found = findings('export default A;', 'export = A;');
  assert.ok(found.some((f) => f.includes('export default')));
});

test('removing an `export =` assignment is breaking', () => {
  const found = findings('export = A;', 'export { Kept }');
  assert.ok(found.some((f) => f.includes('export=')));
});

test('an unchanged default export is clean', () => {
  assert.deepEqual(findings('export default A;', 'export default A;'), []);
});

test('dropping the default-ness of an inline `export default class` is breaking', () => {
  // The named declaration survives, so only the DEFAULT slot disappears — the
  // `import Foo from '<pkg>'` form stops resolving.
  const found = findings('export default class Foo {\n}', 'export class Foo {\n}');
  assert.ok(found.some((f) => f.includes('export default')));
});

// --------------------------------------- non-exported (forgotten-export) decls
// An api-extractor report lists every declaration reachable from the public
// surface, exported or not. A zod-backed type's real shape lives in the
// non-exported schema const it infers from — the exported `z.infer` alias text
// never moves when the schema changes — so the classifier reads the const, not
// just the alias, and forgotten-export types pulled in by includeForgottenExports
// are classified member-wise like any other.

test('a non-exported schema const losing an enum value is breaking (exported alias unchanged)', () => {
  // The exact live case: `WorkerState`'s alias text is identical on both sides;
  // only the non-exported `workerState` const drops a value. An exported-only
  // classifier collects just the alias and reports [] — the blind spot this fixes.
  const found = findings(
    'export type WorkerState = z.infer<typeof workerState>;\n' +
      'const workerState: z.ZodEnum<["ready", "resyncing", "recycling"]>;',
    'export type WorkerState = z.infer<typeof workerState>;\n' +
      'const workerState: z.ZodEnum<["ready", "resyncing"]>;',
  );
  assert.ok(found.some((f) => f.includes('workerState')));
});

test('adding a non-exported schema const is non-breaking (additive)', () => {
  const found = findings(
    'export type A = z.infer<typeof a>;\nconst a: z.ZodString;',
    'export type A = z.infer<typeof a>;\nconst a: z.ZodString;\nconst b: z.ZodNumber;',
  );
  assert.deepEqual(found, []);
});

test('a forgotten-export (non-exported) interface gaining a required member is breaking', () => {
  const found = findings(
    'interface SetX {\n  readonly a: string;\n}',
    'interface SetX {\n  readonly a: string;\n  readonly b: string;\n}',
  );
  assert.ok(found.some((f) => f.includes('"b"')));
});

// --------------------------------------------------- real committed reports E2E
// The gate parses the actual api-extractor reports it ships to gate. This loads
// each real etc/*.api.md from disk, parses it with the production parseReport, and
// classifies it against itself expecting no findings — so an unparseable report
// (e.g. a line-ending regression that breaks the fence anchor) or any format drift
// fails the committed test suite immediately, not a future release run.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REAL_REPORTS = [
  { dir: 'packages/studio-sdk/etc', name: 'studio-sdk.api.md' },
  { dir: 'packages/studio-sdk/etc', name: 'studio-sdk-host.api.md' },
  { dir: 'packages/studio-sdk/etc', name: 'studio-sdk-testing.api.md' },
  { dir: 'packages/studio-sdk/etc', name: 'studio-sdk-schema-form.api.md' },
  { dir: 'packages/api-client/etc', name: 'api-client.api.md' },
];

for (const { dir, name } of REAL_REPORTS) {
  test(`real report ${name} parses and classifies clean against itself`, () => {
    const source = readFileSync(resolve(REPO_ROOT, dir, name), 'utf8');
    const entries = parseReport(name, source);
    assert.ok(entries.size > 0, `report ${name} parsed to zero symbols`);
    assert.deepEqual(classify(name, entries, parseReport(name, source)), []);
  });

  // api-extractor's forgotten-export warning footer embeds absolute source paths
  // that differ per checkout, so a committed footer makes api:check fail on every
  // other machine. addToApiReportFile:false must keep it out — no report line may
  // begin with an absolute-path comment.
  test(`real report ${name} carries no absolute-path comment`, () => {
    const source = readFileSync(resolve(REPO_ROOT, dir, name), 'utf8');
    const offenders = source.split('\n').filter((line) => /^\/\/ \//.test(line));
    assert.deepEqual(offenders, [], `report ${name} has absolute-path comment lines`);
  });
}
