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
