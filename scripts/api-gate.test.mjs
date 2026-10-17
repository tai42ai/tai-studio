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
  previousPublishedTag,
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

// ------------------------------------------------------ published baseline tag
// The baseline is the newest surface a consumer can install: the highest v* tag
// below the target whose version is PUBLISHED on npm. A tag whose publish was
// refused still exists in git but is not published, so it must be skipped.

test('the newest tag being unpublished is skipped for the highest published tag below the target', () => {
  const tags = ['v16.0.0', 'v16.0.1', 'v16.1.0'];
  const published = ['16.0.0', '16.0.1']; // v16.1.0 tagged but refused, never published
  assert.equal(previousPublishedTag('17.0.0', tags, published), 'v16.0.1');
  assert.equal(previousPublishedTag('16.2.0', tags, published), 'v16.0.1');
});

test('no published version below the target yields null', () => {
  assert.equal(previousPublishedTag('1.0.0', ['v0.1.0', 'v0.2.0'], []), null);
  assert.equal(previousPublishedTag('1.0.0', [], ['0.9.0']), null);
});

test('published versions at or above the target are ignored', () => {
  const tags = ['v1.0.0', 'v2.0.0', 'v3.0.0'];
  const published = ['1.0.0', '2.0.0', '3.0.0'];
  // Choosing a baseline for 2.0.0 never picks 2.0.0 or 3.0.0, only the highest below.
  assert.equal(previousPublishedTag('2.0.0', tags, published), 'v1.0.0');
});

test('non-semver tags are ignored', () => {
  const tags = ['v1.0.0', 'nightly', 'v1.1', 'release-2', 'v1.2.0'];
  const published = ['1.0.0', '1.2.0'];
  assert.equal(previousPublishedTag('2.0.0', tags, published), 'v1.2.0');
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

// ----------------------------------------- additive insertions inside a member line

test('widening a literal union inside a variable inline object member is non-breaking', () => {
  const found = findings(
    'export const client: {\n    delivery_status: "failed" | "silent";\n};',
    'export const client: {\n    delivery_status: "failed" | "silent" | "merged" | "superseded";\n};',
  );
  assert.deepEqual(found, []);
});

test('widening a literal union inside a function inline return member is non-breaking', () => {
  const found = findings(
    'export function read(): {\n    delivery_status: "failed" | "silent";\n};',
    'export function read(): {\n    delivery_status: "failed" | "silent" | "merged" | "superseded";\n};',
  );
  assert.deepEqual(found, []);
});

test('widening a union mid-member, plus a new property line and a new nested object, is non-breaking', () => {
  // The createApiClient / ApiProvider shape: an inline output object whose members
  // gained widened status unions, an added record field, and an added nested object.
  const found = findings(
    'export function read(): {\n    answer_status: "error" | "answered" | null;\n    answer: string | null;\n};',
    'export function read(): {\n' +
      '    answer_status: "error" | "merged" | "answered" | null;\n' +
      '    answer: string | null;\n' +
      '    successor_id: string | null;\n' +
      '    overlap: {\n        deliver: "one" | "all";\n    };\n};',
  );
  assert.deepEqual(found, []);
});

test('removing a union member inside an inline object member is breaking', () => {
  const found = findings(
    'export const client: {\n    delivery_status: "failed" | "silent" | "merged";\n};',
    'export const client: {\n    delivery_status: "failed" | "silent";\n};',
  );
  assert.ok(found.some((f) => f.includes('client')));
});

test('retyping a member inside an inline object member is breaking', () => {
  const found = findings(
    'export const client: {\n    message_count: number;\n};',
    'export const client: {\n    message_count: string;\n};',
  );
  assert.ok(found.some((f) => f.includes('client')));
});

test('inserting a required property inside a compact inline object member is breaking', () => {
  const found = findings(
    'export const client: {\n    payload: { content: string };\n};',
    'export const client: {\n    payload: { content: string; id: number };\n};',
  );
  assert.ok(found.some((f) => f.includes('client')));
});

test('inserting an optional property inside a compact inline object member is non-breaking', () => {
  const found = findings(
    'export const client: {\n    payload: { content: string };\n};',
    'export const client: {\n    payload: { content: string; id?: number };\n};',
  );
  assert.deepEqual(found, []);
});

test('changing a parameter type inside an inline function member stays breaking', () => {
  const found = findings(
    'export function read(): {\n    load: (id: string) => void;\n};',
    'export function read(): {\n    load: (id: number) => void;\n};',
  );
  assert.ok(found.some((f) => f.includes('read')));
});

// ------------------------ additive insertions inside an interface or class member

test('an interface member whose inline object type gains an optional property is non-breaking', () => {
  // A props interface member rendered multi-line, as api-extractor emits it.
  const found = findings(
    'export interface FormProps {\n' +
      '    readonly fieldWording?: Readonly<Record<string, {\n' +
      '        choiceLabel?: string;\n' +
      '    }>>;\n' +
      '}',
    'export interface FormProps {\n' +
      '    readonly fieldWording?: Readonly<Record<string, {\n' +
      '        choiceLabel?: string;\n' +
      '        invalid?: string;\n' +
      '    }>>;\n' +
      '}',
  );
  assert.deepEqual(found, []);
});

test('a class member whose inline object type gains an optional property is non-breaking', () => {
  const found = findings(
    'export class Store {\n    options: {\n        size: number;\n    };\n}',
    'export class Store {\n    options: {\n        size: number;\n        label?: string;\n    };\n}',
  );
  assert.deepEqual(found, []);
});

test('widening a literal union on an interface member is non-breaking', () => {
  const found = findings(
    'export interface I {\n    mode: "read" | "write";\n}',
    'export interface I {\n    mode: "read" | "write" | "admin";\n}',
  );
  assert.deepEqual(found, []);
});

test('an interface member whose inline object type gains a REQUIRED property stays breaking', () => {
  const found = findings(
    'export interface I {\n    options: {\n        size: number;\n    };\n}',
    'export interface I {\n    options: {\n        size: number;\n        label: string;\n    };\n}',
  );
  assert.ok(found.some((f) => f.includes('"options"')));
});

test("removing a property from an interface member's inline object type stays breaking", () => {
  const found = findings(
    'export interface I {\n    options: {\n        size: number;\n        label?: string;\n    };\n}',
    'export interface I {\n    options: {\n        size: number;\n    };\n}',
  );
  assert.ok(found.some((f) => f.includes('"options"')));
});

test("removing a union member on an interface member's inline object type stays breaking", () => {
  const found = findings(
    'export interface I {\n    options: {\n        mode: "read" | "write";\n    };\n}',
    'export interface I {\n    options: {\n        mode: "read";\n    };\n}',
  );
  assert.ok(found.some((f) => f.includes('"options"')));
});

test("an optional property added inside a parameter's inline object type on an interface member is non-breaking", () => {
  // A caller passing the old object shape still satisfies the widened parameter type.
  const found = findings(
    'export interface I {\n    run: (opts: { a: number }) => void;\n}',
    'export interface I {\n    run: (opts: { a: number; b?: string }) => void;\n}',
  );
  assert.deepEqual(found, []);
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

// -------------------------------------------- additive member growth (semver)
// Industry-standard semver for a TS library: a purely-additive surface change is a
// minor. A new member added to a client-object variable, an inline object type or a
// function's inline return shape must classify non-breaking; a removed or retyped
// member of any of them stays breaking. This is the v11.1.0 -> v12.0.0 incident:
// adding the readonly `cancelInteraction` member to the client object refused a
// minor via "ApiProvider: declaration text changed" and "createApiClient: a function
// overload was removed or changed".

test('adding a member to a client-object variable is non-breaking (additive)', () => {
  const found = findings(
    'export const client: {\n  readonly baseUrl: string;\n  readonly listTools: () => void;\n};',
    'export const client: {\n  readonly baseUrl: string;\n  readonly cancelInteraction: (id: string) => void;\n  readonly listTools: () => void;\n};',
  );
  assert.deepEqual(found, []);
});

test('removing a member from a client-object variable is breaking', () => {
  const found = findings(
    'export const client: {\n  readonly baseUrl: string;\n  readonly listTools: () => void;\n};',
    'export const client: {\n  readonly listTools: () => void;\n};',
  );
  assert.ok(found.some((f) => f.includes('client') && f.includes('declaration text changed')));
});

test('retyping a member of a client-object variable is breaking', () => {
  const found = findings(
    'export const client: {\n  readonly baseUrl: string;\n};',
    'export const client: {\n  readonly baseUrl: number;\n};',
  );
  assert.ok(found.some((f) => f.includes('client')));
});

test('reordering variable members is non-breaking', () => {
  const found = findings(
    'export const c: {\n  readonly a: number;\n  readonly b: string;\n};',
    'export const c: {\n  readonly b: string;\n  readonly a: number;\n};',
  );
  assert.deepEqual(found, []);
});

test('a function overload gaining a member in its inline return is non-breaking', () => {
  const found = findings(
    'export function createClient(): {\n  readonly baseUrl: string;\n};',
    'export function createClient(): {\n  readonly baseUrl: string;\n  readonly cancelInteraction: (id: string) => void;\n};',
  );
  assert.deepEqual(found, []);
});

test('a function overload losing a member in its inline return is breaking', () => {
  const found = findings(
    'export function createClient(): {\n  readonly baseUrl: string;\n  readonly cancelInteraction: (id: string) => void;\n};',
    'export function createClient(): {\n  readonly baseUrl: string;\n};',
  );
  assert.ok(found.some((f) => f.includes('createClient') && f.includes('overload')));
});

test('a function overload retyping a member in its inline return is breaking', () => {
  const found = findings(
    'export function createClient(): {\n  readonly baseUrl: string;\n};',
    'export function createClient(): {\n  readonly baseUrl: number;\n};',
  );
  assert.ok(found.some((f) => f.includes('createClient') && f.includes('overload')));
});

test('adding a whole function overload is non-breaking', () => {
  const found = findings(
    'export function f(x: number): void;',
    'export function f(x: number): void;\nexport function f(x: string): void;',
  );
  assert.deepEqual(found, []);
});

test('removing a whole function overload is breaking', () => {
  const found = findings(
    'export function f(x: number): void;\nexport function f(x: string): void;',
    'export function f(x: string): void;',
  );
  assert.ok(found.some((f) => f.includes('f') && f.includes('overload')));
});

test('adding a member to an inline object type alias is non-breaking (additive)', () => {
  const found = findings(
    'export type T = {\n  a: number;\n};',
    'export type T = {\n  a: number;\n  b: string;\n};',
  );
  assert.deepEqual(found, []);
});

test('retyping a member of an inline object type alias is breaking', () => {
  const found = findings(
    'export type T = {\n  a: number;\n};',
    'export type T = {\n  a: string;\n};',
  );
  assert.ok(found.some((f) => f.includes('T') && f.includes('type alias declaration changed')));
});

// ---------------------------------- trailing-optional-param signature growth
// Adding a TRAILING OPTIONAL parameter to a function-typed signature is a
// backward-compatible minor (SemVer): existing callers still type-check. The
// line-level `isAdditive` superset check reads the single re-rendered signature line
// as a removal, so a param-aware rule treats an appended `?`-optional param as
// surviving. This is the 13.2.0 incident: `streamInteractions` gaining `lastEventId?`
// and `createApiClient` gaining a trailing optional param refused a minor.

test('a member arrow-fn gaining a trailing optional param is non-breaking (additive)', () => {
  // The streamInteractions case, as an interface member.
  const found = findings(
    'export interface I {\n  readonly streamInteractions: (signal?: AbortSignal) => Promise<void>;\n}',
    'export interface I {\n  readonly streamInteractions: (signal?: AbortSignal, lastEventId?: string) => Promise<void>;\n}',
  );
  assert.deepEqual(found, []);
});

test('a top-level function gaining a trailing optional param is non-breaking (additive)', () => {
  // The createApiClient case, as a single-line function.
  const found = findings(
    'export function createApiClient(config: ApiConfig): ApiClient;',
    'export function createApiClient(config: ApiConfig, opts?: ClientOptions): ApiClient;',
  );
  assert.deepEqual(found, []);
});

test('a function whose inline-return arrow member gains a trailing optional param is non-breaking', () => {
  // The real createApiClient shape: the changed param is on an arrow member nested
  // inside the return object, so the multi-line raw carries one CHANGED line.
  const found = findings(
    'export function createApiClient(config: ApiConfig): {\n  readonly baseUrl: string;\n  readonly streamInteractions: (signal?: AbortSignal) => Promise<void>;\n};',
    'export function createApiClient(config: ApiConfig): {\n  readonly baseUrl: string;\n  readonly streamInteractions: (signal?: AbortSignal, lastEventId?: string) => Promise<void>;\n};',
  );
  assert.deepEqual(found, []);
});

test('a variable whose member gains a trailing optional param AND a new optional member is non-breaking', () => {
  // The ApiProvider case: one member's arrow signature grows a trailing optional
  // param and a brand-new optional member appears in the same release.
  const found = findings(
    'export const ApiProvider: Provider<{\n  readonly baseUrl: string;\n  readonly streamInteractions: (signal?: AbortSignal) => Promise<void>;\n}>;',
    'export const ApiProvider: Provider<{\n  readonly baseUrl: string;\n  readonly id?: string;\n  readonly streamInteractions: (signal?: AbortSignal, lastEventId?: string) => Promise<void>;\n}>;',
  );
  assert.deepEqual(found, []);
});

test('a type alias member arrow-fn gaining a trailing optional param is non-breaking', () => {
  const found = findings(
    'export type T = {\n  run: (a: number) => void;\n};',
    'export type T = {\n  run: (a: number, b?: string) => void;\n};',
  );
  assert.deepEqual(found, []);
});

// INVERSE — each must STAY breaking. Exercised for both a member (arrow-typed) and a
// top-level function, across the seven non-additive param mutations.

const memberOld = 'export interface I {\n  fn: (a: number, b: string) => void;\n}';
const funcOld = 'export function fn(a: number, b: string): void;';
const memberNew = (fn) => `export interface I {\n  fn: ${fn};\n}`;
const funcNew = (sig) => `export function fn${sig};`;

test('a trailing REQUIRED param stays breaking (member and function)', () => {
  assert.ok(
    findings(memberOld, memberNew('(a: number, b: string, c: boolean) => void')).some((f) =>
      f.includes('"fn"'),
    ),
  );
  assert.ok(
    findings(funcOld, funcNew('(a: number, b: string, c: boolean): void')).some((f) =>
      f.includes('overload'),
    ),
  );
});

test('an existing param TYPE change stays breaking (member and function)', () => {
  assert.ok(
    findings(memberOld, memberNew('(a: string, b: string) => void')).some((f) =>
      f.includes('"fn"'),
    ),
  );
  assert.ok(
    findings(funcOld, funcNew('(a: string, b: string): void')).some((f) => f.includes('overload')),
  );
});

test('a REMOVED param stays breaking (member and function)', () => {
  assert.ok(findings(memberOld, memberNew('(a: number) => void')).some((f) => f.includes('"fn"')));
  assert.ok(findings(funcOld, funcNew('(a: number): void')).some((f) => f.includes('overload')));
});

test('REORDERED params stay breaking (member and function)', () => {
  assert.ok(
    findings(memberOld, memberNew('(b: string, a: number) => void')).some((f) =>
      f.includes('"fn"'),
    ),
  );
  assert.ok(
    findings(funcOld, funcNew('(b: string, a: number): void')).some((f) => f.includes('overload')),
  );
});

test('an existing optional param made REQUIRED stays breaking (member and function)', () => {
  const mOld = 'export interface I {\n  fn: (a?: number) => void;\n}';
  const fOld = 'export function fn(a?: number): void;';
  assert.ok(findings(mOld, memberNew('(a: number) => void')).some((f) => f.includes('"fn"')));
  assert.ok(findings(fOld, funcNew('(a: number): void')).some((f) => f.includes('overload')));
});

test('a RETURN type change stays breaking (member and function)', () => {
  assert.ok(
    findings(memberOld, memberNew('(a: number, b: string) => number')).some((f) =>
      f.includes('"fn"'),
    ),
  );
  assert.ok(
    findings(funcOld, funcNew('(a: number, b: string): number')).some((f) =>
      f.includes('overload'),
    ),
  );
});

test('an added trailing REST param stays breaking (member and function)', () => {
  assert.ok(
    findings(memberOld, memberNew('(a: number, b: string, ...rest: unknown[]) => void')).some((f) =>
      f.includes('"fn"'),
    ),
  );
  assert.ok(
    findings(funcOld, funcNew('(a: number, b: string, ...rest: unknown[]): void')).some((f) =>
      f.includes('overload'),
    ),
  );
});

// An optional param inserted before an existing param shifts every later positional
// argument, so it stays breaking on every slot — only an APPENDED optional param is
// additive. The lists are all-optional: an optional param may not precede a required
// one in TypeScript, so only that shape can appear in a real report.

const optVariableOld = 'export const api: {\n    fn: (a?: number, b?: string) => void;\n};';
const optVariableNew = (fn) => `export const api: {\n    fn: ${fn};\n};`;
const optTypeOld = 'export type T = {\n    fn: (a?: number, b?: string) => void;\n};';
const optTypeNew = (fn) => `export type T = {\n    fn: ${fn};\n};`;
const optFuncOld = 'export function fn(a?: number, b?: string): void;';
const optMemberOld = 'export interface I {\n  fn: (a?: number, b?: string) => void;\n}';
const optMethodOld = 'export interface I {\n  fn(a?: number, b?: string): void;\n}';
const optMethodNew = (params) => `export interface I {\n  fn${params}: void;\n}`;

test('an optional param inserted MID-list stays breaking (variable member, type member, function)', () => {
  const fn = '(a?: number, x?: boolean, b?: string) => void';
  assert.ok(findings(optVariableOld, optVariableNew(fn)).some((f) => f.includes(':: api:')));
  assert.ok(findings(optTypeOld, optTypeNew(fn)).some((f) => f.includes(':: T:')));
  assert.ok(
    findings(optFuncOld, funcNew('(a?: number, x?: boolean, b?: string): void')).some((f) =>
      f.includes('overload'),
    ),
  );
});

test('an optional param inserted LEADING stays breaking (variable member, type member, function)', () => {
  const fn = '(x?: boolean, a?: number, b?: string) => void';
  assert.ok(findings(optVariableOld, optVariableNew(fn)).some((f) => f.includes(':: api:')));
  assert.ok(findings(optTypeOld, optTypeNew(fn)).some((f) => f.includes(':: T:')));
  assert.ok(
    findings(optFuncOld, funcNew('(x?: boolean, a?: number, b?: string): void')).some((f) =>
      f.includes('overload'),
    ),
  );
});

test('an optional param inserted MID-list stays breaking (interface member and method)', () => {
  assert.ok(
    findings(optMemberOld, memberNew('(a?: number, x?: boolean, b?: string) => void')).some((f) =>
      f.includes('"fn"'),
    ),
  );
  assert.ok(
    findings(optMethodOld, optMethodNew('(a?: number, x?: boolean, b?: string)')).some((f) =>
      f.includes('"fn"'),
    ),
  );
});

test('a trailing optional param stays non-breaking (variable member, type member, interface method)', () => {
  const fn = '(a?: number, b?: string, x?: boolean) => void';
  assert.deepEqual(findings(optVariableOld, optVariableNew(fn)), []);
  assert.deepEqual(findings(optTypeOld, optTypeNew(fn)), []);
  assert.deepEqual(
    findings(optMethodOld, optMethodNew('(a?: number, b?: string, x?: boolean)')),
    [],
  );
});

// An inserted run that closes a bracket it did not open has left the object type it
// started in, so its `name?: T` text is not an added property there: the change is a
// new union alternative or a new param, and it stays breaking on every slot.

test('an object member turned into a union with a new object alternative stays breaking (interface member, method return, variable member)', () => {
  assert.ok(
    findings(
      'export interface I {\n  x: { z: string };\n}',
      'export interface I {\n  x: { b?: X } | { z: string };\n}',
    ).some((f) => f.includes('"x"')),
  );
  assert.ok(
    findings(
      'export interface I {\n  get(): { z: string };\n}',
      'export interface I {\n  get(): { b?: X } | { z: string };\n}',
    ).some((f) => f.includes('"get"')),
  );
  assert.ok(
    findings(
      'export const v: {\n  x: { z: string };\n};',
      'export const v: {\n  x: { b?: X } | { z: string };\n};',
    ).some((f) => f.includes(':: v:')),
  );
});

test("a param object's property moved into a new trailing param stays breaking (interface member)", () => {
  const found = findings(
    'export interface I {\n  f: (o: { a: string }) => void;\n}',
    'export interface I {\n  f: (o: { b?: X }, p?: { a: string }) => void;\n}',
  );
  assert.ok(found.some((f) => f.includes('"f"')));
});

test('an optional param inserted across an object-typed param stays breaking (interface member, function)', () => {
  assert.ok(
    findings(
      'export interface I {\n  f: (o: { k?: K }, a?: string) => void;\n}',
      'export interface I {\n  f: (o: { j?: J }, z?: { k?: K }, a?: string) => void;\n}',
    ).some((f) => f.includes('"f"')),
  );
  assert.ok(
    findings(
      'export function f(o: { k?: K }, a?: string): void;',
      'export function f(o: { j?: J }, z?: { k?: K }, a?: string): void;',
    ).some((f) => f.includes('overload')),
  );
});

// A literal is additive only as a new union alternative: the run carries a `|` that
// joins it to the existing union. A literal inserted on its own changes the type.

test('a literal inserted without a union bar stays breaking (interface member)', () => {
  const found = findings(
    'export interface I {\n  items: Foo[];\n}',
    'export interface I {\n  items: Foo[0];\n}',
  );
  assert.ok(found.some((f) => f.includes('"items"')));
});

test('a self-contained literal union inserted into an empty slot stays breaking (interface member)', () => {
  const found = findings(
    'export interface I {\n  items: Foo[];\n}',
    'export interface I {\n  items: Foo["a" | "b"];\n}',
  );
  assert.ok(found.some((f) => f.includes('"items"')));
});

// ------------------------------------- order-only report reshape (emission form)
// An internal refactor can change how api-extractor EMITS an inferred object type
// without changing the contract: it reorders the object's members, reorders the
// alternatives of a union type, or renders a type reference bare (`Foo`) instead of
// through the namespace-import alias of its source module (`s.Foo`). The set of
// members and the identity of every type are unchanged, so a pure reshape is a
// non-breaking patch; a real added/removed/changed member or type still classifies
// as before. `passesPatch` proves both halves at once — the classification AND the
// gate's decision on a >=1.0 patch bump, the exact release shape of the incident.

const passesPatch = (oldBody, newBody) => {
  const found = findings(oldBody, newBody);
  return {
    found,
    passes: gatePasses('label-honesty', '16.0.0', '16.0.1', found.length > 0).passes,
  };
};

test('reordering a union type inside a variable object passes on a patch bump', () => {
  // The ApiProvider case: a `status` union's alternatives are emitted in a new order.
  const r = passesPatch(
    'export const p: {\n  readonly status: "running" | "succeeded" | "failed" | "lost";\n};',
    'export const p: {\n  readonly status: "failed" | "running" | "succeeded" | "lost";\n};',
  );
  assert.deepEqual(r.found, []);
  assert.equal(r.passes, true);
});

test('reordering members and requalifying type refs in a function return passes on a patch bump', () => {
  // The createApiClient case: the inferred return object's members are reordered AND
  // their parameter types requalified from `s.X` to bare `X` (same declared types).
  const r = passesPatch(
    'export function createApiClient(): {\n' +
      '  readonly registerHook: (params: s.HookRegister) => void;\n' +
      '  readonly renderTemplate: (text: s.TemplatedText) => void;\n};',
    'export function createApiClient(): {\n' +
      '  readonly renderTemplate: (text: TemplatedText) => void;\n' +
      '  readonly registerHook: (params: HookRegister) => void;\n};',
  );
  assert.deepEqual(r.found, []);
  assert.equal(r.passes, true);
});

test('dropping a namespace-alias qualifier alone is non-breaking (same declared type)', () => {
  assert.deepEqual(
    findings(
      'export const c: {\n  readonly a: s.Foo;\n};',
      'export const c: {\n  readonly a: Foo;\n};',
    ),
    [],
  );
});

test('a non-literal union alias reordering its members is non-breaking', () => {
  assert.deepEqual(
    findings(
      'export type T = {\n  status: "a" | "b" | "c";\n};',
      'export type T = {\n  status: "c" | "b" | "a";\n};',
    ),
    [],
  );
});

test('reordering members while ADDING one is non-breaking (reshape + additive)', () => {
  assert.deepEqual(
    findings(
      'export const c: {\n  readonly a: number;\n  readonly b: string;\n};',
      'export const c: {\n  readonly b: string;\n  readonly a: number;\n  readonly d: boolean;\n};',
    ),
    [],
  );
});

// INVERSE — a reshape must never mask a real change; each stays breaking and FAILS
// the >=1.0 patch bump.

test('removing a member from a reshaped variable object stays breaking and fails a patch bump', () => {
  const r = passesPatch(
    'export const c: {\n  readonly a: number;\n  readonly b: string;\n};',
    'export const c: {\n  readonly b: string;\n};',
  );
  assert.ok(r.found.some((f) => f.includes('c') && f.includes('declaration text changed')));
  assert.equal(r.passes, false);
});

test('removing a member from a reshaped function return stays breaking', () => {
  const found = findings(
    'export function f(): {\n  readonly a: number;\n  readonly b: string;\n};',
    'export function f(): {\n  readonly b: string;\n};',
  );
  assert.ok(found.some((f) => f.includes('f') && f.includes('overload')));
});

test('changing a leaf type name stays breaking even when the qualifier form matches', () => {
  // `s.Foo -> s.Bar`: the alias `s` is unchanged, only the leaf differs — a real type
  // change, still breaking. Qualifier folding keeps the leaf as the discriminator.
  assert.ok(
    findings(
      'export const c: {\n  readonly a: s.Foo;\n};',
      'export const c: {\n  readonly a: s.Bar;\n};',
    ).some((f) => f.includes('c')),
  );
});

test('changing a union member (not reordering it) stays breaking', () => {
  assert.ok(
    findings(
      'export const p: {\n  readonly status: "running" | "succeeded";\n};',
      'export const p: {\n  readonly status: "running" | "cancelled";\n};',
    ).some((f) => f.includes('p')),
  );
});

// ------------------------------------- additive shapes judged on the parsed declaration
// A changed member, member line or overload is parsed and must be the old declaration
// grown only by the three additive shapes — a widened literal union, an added optional
// property inside an inline object type, appended optional params — at any depth.

const inInterface = (member) => `export interface I {\n    ${member}\n}`;
const inClass = (member) => `export class C {\n    ${member}\n}`;
const inVariable = (member) => `export const c: {\n    ${member}\n};`;
const isBreaking = (oldBody, newBody) => findings(oldBody, newBody).length > 0;

test('a literal joined to a non-literal type stays breaking (interface, class, variable member, return)', () => {
  // `number` -> `number | "auto"` widens a non-literal type: a consumer reading the
  // member as a number breaks, so this is not a widened literal union.
  assert.ok(isBreaking(inInterface('width: number;'), inInterface('width: number | "auto";')));
  assert.ok(isBreaking(inClass('width: number;'), inClass('width: number | "auto";')));
  assert.ok(isBreaking(inVariable('width: number;'), inVariable('width: number | "auto";')));
  assert.ok(isBreaking(inInterface('f(): Foo;'), inInterface('f(): Foo | 0;')));
});

test('a literal joined to an array, keyof, intersection, type argument or template type stays breaking', () => {
  const cases = [
    ['items: string[];', 'items: string[] | "x";'],
    ['k: keyof Foo;', 'k: keyof Foo | "x";'],
    ['v: A & B;', 'v: A & "x" | B;'],
    ['get(): Promise<Foo[]>;', 'get(): Promise<Foo | "x"[]>;'],
    ['v: `a-${string}`;', 'v: `a-${string}` | "b";'],
    ['v: "a"[];', 'v: "a" | "b"[];'],
  ];
  for (const [before, after] of cases) {
    assert.ok(isBreaking(inInterface(before), inInterface(after)), after);
  }
});

test('an optional property whose type holds brackets is non-breaking (interface member, variable member)', () => {
  const cases = [
    ['o: { a: string };', 'o: { a: string; b?: { c: number } };'],
    ['o: { a: string };', 'o: { a: string; b?: Record<string, { c?: string }> };'],
    ['o: { a: string };', 'o: { a: string; b?: (x: { c: 1 }) => void };'],
    ['o: { a: string };', 'o: { b?: { c: number }; a: string };'],
  ];
  for (const [before, after] of cases) {
    assert.deepEqual(findings(inInterface(before), inInterface(after)), [], after);
    assert.deepEqual(findings(inVariable(before), inVariable(after)), [], after);
  }
});

test('an optional object-typed property added to a multi-line inline object is non-breaking', () => {
  assert.deepEqual(
    findings(
      'export interface I {\n    o: {\n        a: string;\n    };\n}',
      'export interface I {\n    o: {\n        a: string;\n        b?: {\n            c: number;\n        };\n    };\n}',
    ),
    [],
  );
});

test('a negative or parenthesised literal widening is non-breaking', () => {
  assert.deepEqual(findings(inInterface('v: 1;'), inInterface('v: 1 | -1;')), []);
  assert.deepEqual(findings(inInterface('v: "a"[];'), inInterface('v: ("a" | "b")[];')), []);
});

test('two optional properties and a literal widening in one member are non-breaking', () => {
  assert.deepEqual(
    findings(
      inInterface('o: { a: "x" };'),
      inInterface('o: { a: "x" | "y"; b?: number; c?: { d: string } };'),
    ),
    [],
  );
});

test('a mapped type or an index signature in place of an object type stays breaking', () => {
  assert.ok(isBreaking(inInterface('v: {};'), inInterface('v: { [K in string]?: number };')));
  assert.ok(
    isBreaking(
      inInterface('o: { a: string };'),
      inInterface('o: { a: string; [k: string]: string };'),
    ),
  );
});

test('a member line TypeScript rejects stays breaking', () => {
  assert.ok(
    isBreaking(
      inInterface('o: { a: string };'),
      inInterface('o: { a: string; [k: string]?: string };'),
    ),
  );
  assert.ok(
    isBreaking(inInterface('o: { a: string };'), inInterface('o: { a: string; b?: c?: d };')),
  );
  assert.ok(
    isBreaking(inVariable('o: { a: string };'), inVariable('o: { a: string; b?: c?: d };')),
  );
});

test('a union reordered inside an inline object type is no change', () => {
  assert.deepEqual(
    findings(inInterface('o: { mode: "a" | "b" };'), inInterface('o: { mode: "b" | "a" };')),
    [],
  );
  assert.deepEqual(
    findings(inVariable('o: { v: Foo | Bar };'), inVariable('o: { v: Bar | Foo };')),
    [],
  );
});

test('a literal union widened inside a callback param, a type argument or an indexed access is non-breaking', () => {
  const cases = [
    ['cb: (k: "a") => void;', 'cb: (k: "a" | "b") => void;'],
    ['m: Map<"a", number>;', 'm: Map<"a" | "b", number>;'],
    ['v: Foo["a"];', 'v: Foo["a" | "b"];'],
  ];
  for (const [before, after] of cases) {
    assert.deepEqual(findings(inInterface(before), inInterface(after)), [], after);
  }
});

test('readonly added inside an interface member stays breaking', () => {
  assert.ok(
    isBreaking(inInterface('o: { a: string };'), inInterface('o: { readonly a: string };')),
  );
});

test('a property flipped required to optional inside an interface member stays breaking', () => {
  assert.ok(isBreaking(inInterface('o: { a: string };'), inInterface('o: { a?: string };')));
});

test('a non-literal union gaining a non-literal alternative stays breaking (interface member)', () => {
  assert.ok(isBreaking(inInterface('v: Foo | Bar;'), inInterface('v: Foo | Bar | Baz;')));
});

test('an appended REST param stays breaking (interface member)', () => {
  assert.ok(
    isBreaking(
      inInterface('fn: (a: number) => void;'),
      inInterface('fn: (a: number, ...r: string[]) => void;'),
    ),
  );
});

test('a line comment added inside an inline object type is no change', () => {
  assert.deepEqual(
    findings(
      'export interface I {\n    o: {\n        a: string;\n    };\n}',
      'export interface I {\n    o: {\n        a: string;\n        // b?: number\n    };\n}',
    ),
    [],
  );
});

test('an additive change next to a namespace-qualified type is non-breaking', () => {
  // `z.infer<T>` reads as `infer<T>` once its qualifier is dropped, which TypeScript
  // rejects; the declaration is parsed as the report renders it.
  assert.deepEqual(
    findings(
      inInterface('f: (a: z.infer<typeof A>) => void;'),
      inInterface('f: (a: z.infer<typeof A>, b?: number) => void;'),
    ),
    [],
  );
  assert.deepEqual(
    findings(
      inVariable('request: <S>(path: string) => Promise<z.infer<S>>;'),
      inVariable('request: <S>(path: string, o?: number) => Promise<z.infer<S>>;'),
    ),
    [],
  );
  assert.deepEqual(
    findings(
      inInterface('o: { a: z.infer<typeof A> };'),
      inInterface('o: { a: z.infer<typeof A>; b?: string };'),
    ),
    [],
  );
});

test('a literal union widened on a member line named like a keyword is non-breaking', () => {
  assert.deepEqual(
    findings(inVariable('type: "a" | "b";'), inVariable('type: "a" | "b" | "c";')),
    [],
  );
});

test('an optional property added inside a function overload param is non-breaking', () => {
  assert.deepEqual(
    findings(
      'export function f(o: { a: string }): void;',
      'export function f(o: { a: string; b?: { c: number } }): void;',
    ),
    [],
  );
  assert.ok(
    isBreaking(
      'export function f(o: { a: string }): void;',
      'export function f(o: { a: string; b: number }): void;',
    ),
  );
});

// ------------------------------------- a declaration's head and a class constructor
// An interface or class declaration's own modifiers, type parameters and heritage
// clauses, and a class constructor, are part of the surface like its members.

test('an interface extends clause removed or changed stays breaking', () => {
  const old = 'export interface I extends B {\n    y: string;\n}';
  assert.ok(isBreaking(old, 'export interface I {\n    y: string;\n}'));
  assert.ok(isBreaking(old, 'export interface I extends D {\n    y: string;\n}'));
  assert.ok(isBreaking(old, 'export interface I extends B, D {\n    y: string;\n}'));
});

test('a type parameter added to an interface stays breaking, with or without a default', () => {
  const old = 'export interface I<T> {\n    y: T;\n}';
  assert.ok(isBreaking(old, 'export interface I<T, U> {\n    y: T;\n}'));
  assert.ok(isBreaking(old, 'export interface I<T, U = string> {\n    y: T;\n}'));
  assert.ok(isBreaking(old, 'export interface I<T extends string> {\n    y: T;\n}'));
});

test('a class made abstract, or its extends clause removed or changed, stays breaking', () => {
  const old = 'export declare class C extends B {\n    y: string;\n}';
  assert.ok(isBreaking(old, 'export declare abstract class C extends B {\n    y: string;\n}'));
  assert.ok(isBreaking(old, 'export declare class C {\n    y: string;\n}'));
  assert.ok(isBreaking(old, 'export declare class C extends D {\n    y: string;\n}'));
});

test('a literal union widened in a heritage type argument is non-breaking', () => {
  assert.deepEqual(
    findings(
      'export interface I extends Base<"a"> {\n    y: string;\n}',
      'export interface I extends Base<"a" | "b"> {\n    y: string;\n}',
    ),
    [],
  );
});

test('a class constructor changed, added or removed stays breaking', () => {
  const old = 'export declare class C {\n    constructor(a: string);\n    y: string;\n}';
  assert.ok(
    isBreaking(
      old,
      'export declare class C {\n    constructor(a: string, b: number);\n    y: string;\n}',
    ),
  );
  assert.ok(
    isBreaking(old, 'export declare class C {\n    constructor(a: number);\n    y: string;\n}'),
  );
  assert.ok(isBreaking(old, 'export declare class C {\n    y: string;\n}'));
  assert.ok(
    isBreaking(
      'export declare class C {\n    y: string;\n}',
      'export declare class C {\n    y: string;\n    constructor(a: string);\n}',
    ),
  );
});

test('a class constructor appending an optional param is non-breaking', () => {
  assert.deepEqual(
    findings(
      'export declare class C {\n    constructor(a: string);\n}',
      'export declare class C {\n    constructor(a: string, b?: number);\n}',
    ),
    [],
  );
});

// ------------------------------------------- export status and enum `const`
// Whether a declaration is exported is judged once for every kind, at any depth: an
// `export` (or `export default`) dropped removes a name consumers import, an `export`
// added is a new export. An enum made `const` stays breaking; `const` dropped is not.

// Each declaration kind, written as it renders exported, in a report's fence.
const EXPORTED_KINDS = {
  variable: 'export const x: string;',
  'declared variable': 'export declare const x: string;',
  'literal type alias': 'export type T = "a" | "b";',
  'object type alias': 'export type T = {\n    a: string;\n};',
  interface: 'export interface I {\n    a: string;\n}',
  class: 'export declare class C {\n    a: string;\n}',
  function: 'export declare function f(): void;',
  enum: 'export declare enum E {\n    A = 0\n}',
  namespace: 'export declare namespace N {\n    const a: string;\n}',
  // `export {}` ends the namespace's implicit export, so the member's own `export`
  // decides.
  'namespace member':
    'export declare namespace N {\n    export const a: string;\n    export {};\n}',
};
// The same declaration with its own `export` removed (for a namespace member, the
// member's `export`, the namespace staying exported).
const unexported = (kind, text) =>
  kind === 'namespace member'
    ? text.replace('    export const', '    const')
    : text.replace(/^export /, '');

test('an export dropped from any kind of declaration stays breaking', () => {
  for (const [kind, text] of Object.entries(EXPORTED_KINDS)) {
    assert.ok(isBreaking(text, unexported(kind, text)), kind);
  }
});

test('an export added to any kind of declaration is non-breaking', () => {
  for (const [kind, text] of Object.entries(EXPORTED_KINDS)) {
    assert.deepEqual(findings(unexported(kind, text), text), [], kind);
  }
});

test('an export added next to a changed head stays breaking', () => {
  assert.ok(isBreaking('interface I {\n}', 'export interface I extends B {\n}'));
  assert.ok(isBreaking('declare class C {\n}', 'export declare abstract class C {\n}'));
});

test('a named export made default-only stays breaking, and a default dropped stays breaking', () => {
  for (const withDefault of [
    'export default class C {\n}',
    'export default interface I {\n}',
    'export default function f(a: string): void;',
  ]) {
    const named = withDefault.replace('export default ', 'export ');
    const name = withDefault.match(/(?:class|interface|function) (\w+)/)[1];
    assert.ok(
      findings(named, withDefault).includes(`r :: ${name}: export was removed`),
      withDefault,
    );
    assert.ok(isBreaking(withDefault, named), withDefault);
  }
});

test('a default export written inline or as `export default <name>` is the same slot', () => {
  const inline = 'export default function f(): void;';
  const separate = 'declare function f(): void;\nexport default f;';
  assert.deepEqual(findings(inline, separate), []);
  assert.deepEqual(findings(separate, inline), []);
  assert.deepEqual(findings(inline, 'export declare function f(): void;\nexport default f;'), []);
  assert.deepEqual(
    findings('export default class C {\n}', 'declare class C {\n}\nexport default C;'),
    [],
  );
});

test('a default export re-pointed at another name stays breaking, in either form', () => {
  const pointed = 'declare function f(): void;\ndeclare function g(): void;\n';
  assert.ok(isBreaking(`${pointed}export default f;`, `${pointed}export default g;`));
  assert.ok(
    isBreaking(
      'export default function f(): void;',
      'declare function g(): void;\nexport default g;',
    ),
  );
});

test('a default function overload joins only a slot a default function of its name put', () => {
  assert.throws(
    () =>
      findings(
        'export declare const z: string;',
        'declare function f(): void;\nexport default f;\nexport default function f(a: string): void;',
      ),
    (err) =>
      err instanceof GateError &&
      /declares or exports the name "export default" twice/.test(err.message),
  );
});

test('a default function overload of another name does not join the default slot', () => {
  assert.throws(
    () =>
      findings(
        'export declare const z: string;',
        'export default function g(): void;\nexport default function f(a: string): void;',
      ),
    (err) =>
      err instanceof GateError &&
      /declares or exports the name "export default" twice/.test(err.message),
  );
});

test('a default export added beside a kept named export is non-breaking', () => {
  assert.deepEqual(
    findings('export declare class C {\n}', 'export declare class C {\n}\nexport default C;'),
    [],
  );
});

test('a name declared twice beside a default class names the default class in the message', () => {
  assert.throws(
    () =>
      findings('export default class C {\n}\nexport default C;', 'export declare const z: string;'),
    (err) =>
      err instanceof GateError &&
      /declares or exports the name "export default" twice \(default class and export-assignment\)/.test(
        err.message,
      ),
  );
});

test('an enum made const stays breaking, and const dropped from an enum is non-breaking', () => {
  const plain = 'export declare enum E {\n    A = 0\n}';
  const constant = 'export declare const enum E {\n    A = 0\n}';
  assert.ok(isBreaking(plain, constant));
  assert.deepEqual(findings(constant, plain), []);
});

// ------------------------------------------------ a variable's declaration keyword
// What a keyword change does to consumers depends on the block the variable sits in.
// Every block: `const` alone allows a literal initializer and a `unique symbol` type,
// so `const` turned `let`/`var` breaks readers. A namespace, `declare global` or UMD
// (`export as namespace`) member declared `let`/`var` can be assigned, so `const`
// breaks writers (TS2540, TS2588). A namespace, `declare global` or `declare module
// "x"` member declared `var` can be redeclared by a consumer's augmentation, which
// `let` and `const` refuse (TS2451), and a global `var` alone is read through
// `globalThis` (TS2339). A global `let` stays narrowed inside a callback where a
// global `var` does not (TS2339), so a global `let` turned `var` breaks readers; in
// every other block that narrowing fails under all three keywords. A module's own
// top-level variable is read-only to every importer and cannot be redeclared whatever
// its keyword (TS2540, TS2632, TS2323), and a `declare module "x"` member is
// read-only to its importers too.

const KEYWORD_BLOCKS = {
  'module top level': (line) => `export declare ${line}`,
  'UMD module top level': (line) => `export declare ${line}\nexport as namespace L;`,
  namespace: (line) => `export declare namespace N {\n    ${line}\n}`,
  'declare global': (line) => `export {};\ndeclare global {\n    ${line}\n}`,
  'global in declare module': (line) =>
    `declare module "y" {\n    global {\n        ${line}\n    }\n}`,
  'declare module': (line) => `declare module "x" {\n    export ${line}\n}`,
};

const GLOBAL_BLOCKS = ['declare global', 'global in declare module'];

// The blocks in which each keyword change breaks a consumer, from tsc.
const KEYWORD_BREAKS = {
  'let var': GLOBAL_BLOCKS,
  'var let': ['namespace', ...GLOBAL_BLOCKS, 'declare module'],
  'let const': ['UMD module top level', 'namespace', ...GLOBAL_BLOCKS],
  'var const': ['UMD module top level', 'namespace', ...GLOBAL_BLOCKS, 'declare module'],
  'const let': Object.keys(KEYWORD_BLOCKS),
  'const var': Object.keys(KEYWORD_BLOCKS),
};

test('a variable keyword change is breaking exactly in the blocks where a consumer fails', () => {
  for (const [change, breakingBlocks] of Object.entries(KEYWORD_BREAKS)) {
    const [from, to] = change.split(' ');
    for (const [block, wrap] of Object.entries(KEYWORD_BLOCKS)) {
      assert.equal(
        isBreaking(wrap(`${from} a: string;`), wrap(`${to} a: string;`)),
        breakingBlocks.includes(block),
        `${from} -> ${to} in ${block}`,
      );
    }
  }
});

test('a keyword the gate does not know reads as breaking', () => {
  assert.ok(
    isBreaking(
      KEYWORD_BLOCKS.namespace('var a: string;'),
      KEYWORD_BLOCKS.namespace('using a: string;'),
    ),
  );
});

test('a dotted namespace compares the members of its innermost block', () => {
  const dotted = (line) => `export declare namespace A.B {\n    ${line}\n}`;
  assert.ok(isBreaking(dotted('let y: string;'), 'export declare namespace A.B {\n}'));
  assert.ok(isBreaking(dotted('let y: string;'), dotted('const y: string;')));
  assert.ok(isBreaking(dotted('let y: string;'), 'export declare namespace A {\n}'));
  assert.deepEqual(findings(dotted('let y: string;'), dotted('var y: string;')), []);
});

// ------------------------------------------- implicit export and unmodelled statements
// In a `declare namespace` or `declare module "x"` every member is exported until
// the block holds an export declaration or assignment (`export {}`, `export { x }`,
// `export *`, `export =`, `export default x`); an `export` modifier on a member does
// not end it. `export as namespace L` makes the module a global `L` for scripts.

test('a namespace or declare module that gains an export declaration unexports its members', () => {
  assert.ok(
    isBreaking(
      'export declare namespace A {\n    const x: string;\n}',
      'export declare namespace A {\n    const x: string;\n    export {};\n}',
    ),
  );
  assert.ok(
    isBreaking(
      'declare module "y" {\n    const x: string;\n}',
      'declare module "y" {\n    const x: string;\n    export {};\n}',
    ),
  );
  assert.ok(
    isBreaking(
      'declare module "y" {\n    const x: string;\n    const z: string;\n}',
      'declare module "y" {\n    const x: string;\n    const z: string;\n    export default z;\n}',
    ),
  );
});

test('export dropped from a member of an implicitly exporting block is no change', () => {
  assert.deepEqual(
    findings(
      'export declare namespace A {\n    export let x: string;\n}',
      'export declare namespace A {\n    let x: string;\n}',
    ),
    [],
  );
  assert.ok(
    isBreaking(
      'export declare namespace A {\n    export let x: string;\n    export {};\n}',
      'export declare namespace A {\n    let x: string;\n    export {};\n}',
    ),
  );
});

test('an inline default declaration in an implicitly exporting block is not exported by name', () => {
  assert.ok(
    isBreaking(
      'declare module "y" {\n    function f(): void;\n}',
      'declare module "y" {\n    export default function f(): void;\n}',
    ),
  );
});

test('a dotted namespace and the nested namespaces it stands for are the same surface', () => {
  const dotted = 'export declare namespace A.B {\n    let y: string;\n}';
  const nested =
    'export declare namespace A {\n    namespace B {\n        let y: string;\n    }\n}';
  assert.deepEqual(findings(dotted, nested), []);
  assert.deepEqual(findings(nested, dotted), []);
});

test('the UMD global name is part of the surface', () => {
  const umd = (name) => `export declare let a: string;\nexport as namespace ${name};`;
  assert.ok(isBreaking(umd('L'), 'export declare let a: string;'));
  assert.ok(isBreaking(umd('L'), umd('M')));
  assert.deepEqual(findings('export declare let a: string;', umd('L')), []);
});

test('a change inside text TypeScript could not parse reads as breaking', () => {
  assert.ok(
    isBreaking(
      'export declare const x: <S>(p: S) => Promise<infer<S> | null>;',
      'export declare const x: <S>(p: S) => Promise<infer<S> | string>;',
    ),
  );
});

test('unparsed text that only the new report holds reads as breaking', () => {
  assert.ok(
    isBreaking(
      'export type X = {\n    x: string;\n};',
      'export type X = {\n    x: string;\n    y: {\n        q: string;\n    };\n    z: Promise<infer<S>>;\n} | null;',
    ),
  );
});

test('every piece of unparsed text after one declaration is compared', () => {
  // TypeScript breaks this line into three statements after the declaration; the
  // change sits in the middle one.
  assert.ok(
    isBreaking(
      'export declare const x: (a: Promise<infer<S>>, b: Promise<infer<T> | null>) => void;',
      'export declare const x: (a: Promise<infer<S>>, b: Promise<infer<T> | string>) => void;',
    ),
  );
});

test('unparsed text that opens a block throws', () => {
  assert.throws(
    () =>
      findings(
        'export declare const z: string;',
        'export declare namespace N {\n    <S> | null>;\n}',
      ),
    (err) => err instanceof GateError && /could not parse/.test(err.message),
  );
});

test('a statement kind the gate does not model throws', () => {
  assert.throws(
    () =>
      findings(
        'export declare const z: string;',
        'export declare namespace A {\n    namespace Q {\n        const v: string;\n    }\n    export import y = Q;\n}',
      ),
    (err) => err instanceof GateError && /ImportEqualsDeclaration/.test(err.message),
  );
});

// ------------------------------------- a type alias's parameters and merged names
// A type alias's own type parameters are compared like a declaration head. Two
// declarations under one name (TypeScript merges them into one symbol) cannot be
// classified name by name, so the gate stops loudly; only function overloads share a
// name.

test('a type parameter added to, removed from or changed on a literal-union alias stays breaking', () => {
  assert.ok(isBreaking('export type T = "a" | "b";', 'export type T<X> = "a" | "b";'));
  assert.ok(isBreaking('export type T<X> = "a" | "b";', 'export type T = "a" | "b";'));
  assert.ok(
    isBreaking(
      'export type T<X extends string> = "a" | "b";',
      'export type T<X extends number> = "a" | "b";',
    ),
  );
  assert.ok(isBreaking('export type T<X> = "a";', 'export type T<X> = "a" | "b" | X;'));
});

test('a literal-union alias widened under unchanged type parameters is non-breaking', () => {
  assert.deepEqual(findings('export type T<X> = "a";', 'export type T<X> = "a" | "b";'), []);
  assert.deepEqual(
    findings('export type T<X extends "a"> = "a";', 'export type T<X extends "a" | "b"> = "a";'),
    [],
  );
});

test('two declarations under one name fail the gate loudly, on either side', () => {
  const merged = [
    'export interface A {\n    x: string;\n}\nexport declare namespace A {\n    const y: string;\n}',
    'export declare function f(): void;\nexport declare namespace f {\n    const y: string;\n}',
    'export declare namespace f {\n    const y: string;\n}\nexport declare function f(): void;',
    'export interface A {\n    x: string;\n}\nexport interface A {\n    y: string;\n}',
    'declare const a: string;\nexport { a };',
    'export declare namespace N {\n    interface A {\n    }\n    namespace A {\n    }\n}',
  ];
  for (const text of merged) {
    for (const [oldText, newText] of [
      [text, text],
      ['export declare const z: string;', text],
      [text, 'export declare const z: string;'],
    ]) {
      assert.throws(
        () => findings(oldText, newText),
        (err) =>
          err instanceof GateError && /declares or exports the name "\w+" twice/.test(err.message),
        text,
      );
    }
  }
});

test('a generic alias is judged on its type parameters once and on its body on its own', () => {
  const old = 'export type X<T extends "a"> = {\n    v: T;\n};';
  assert.deepEqual(findings(old, 'export type X<T extends "a" | "c"> = {\n    v: T;\n};'), []);
  assert.deepEqual(
    findings(
      'export type X<T = "a"> = {\n    v: T;\n};',
      'export type X<T = "a" | "b"> = {\n    v: T;\n};',
    ),
    [],
  );
  assert.deepEqual(
    findings(old, 'export type X<T extends "a" | "c"> = {\n    v: T;\n    w: string;\n};'),
    [],
  );
  assert.ok(isBreaking(old, 'export type X<T extends "a" | "c"> = {\n    v: string;\n};'));
});

test('a declaration and an export list of the same name fail the gate, naming both', () => {
  assert.throws(
    () => findings('declare const X: number;\nexport { X };', 'export declare const z: string;'),
    (err) =>
      err instanceof GateError &&
      /declares or exports the name "X" twice \(variable and re-export\)/.test(err.message),
  );
});

test('overloads of an inline default function share the default slot', () => {
  for (const name of ['f', '']) {
    const one = `export default function ${name}(a: string): void;`;
    const two = `${one}\nexport default function ${name}(a: number): void;`;
    assert.deepEqual(findings(two, two), [], name);
    assert.ok(isBreaking(two, one), name);
    assert.deepEqual(
      findings(two, `${one}\nexport default function ${name}(a: number, b?: string): void;`),
      [],
      name,
    );
  }
});

test('function overloads share one name', () => {
  const two = 'export declare function f(): void;\nexport declare function f(a: string): void;';
  assert.deepEqual(findings(two, two), []);
  assert.ok(isBreaking(two, 'export declare function f(): void;'));
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
