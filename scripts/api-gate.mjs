#!/usr/bin/env node
// Release API-diff gate: fail a publish whose public-API change class exceeds the
// version bump the release-please label produced.
//
// It compares the committed api-extractor reports of every published package
// (packages/studio-sdk/etc/*.api.md and packages/api-client/etc/*.api.md) at the
// version being released against a per-package baseline: the highest v* tag below
// the release whose version is PUBLISHED on npm for that report's package. The
// baseline is the newest surface a consumer can actually install; a tag whose
// publish this gate itself refused is not one, so it is skipped in favour of the
// newest published tag beneath it. Each report is classified against its own
// baseline, the surface change is judged breaking or not, and the single mode
// switch is read from .github/api-gate.yml:
//
//   * label-honesty — a breaking surface change may ship only in the bump an
//     honest release-please label would have produced, which depends on the NEW
//     version's major: a major bump for a >=1.0 package, or a minor bump for a
//     0.x one (release-please maps an honest breaking change on 0.x to a minor,
//     and semver's 0.x convention treats the minor as the breaking slot). A patch
//     never carries a breaking change.
//   * strict — a breaking surface change may ship only in a major bump, for every
//     version: a 0.x package must graduate to 1.0.0 to break once strict is on.
//
// The allowed bump set is a function of mode AND the new version's major
// component — never version-blind — so a >=1.0 package cannot slip a breaking
// change through a mislabelled minor.
//
// Every top-level declaration in a report's `ts` fence is classified, exported or
// not: an api-extractor report lists only declarations reachable from the public
// surface, so a non-exported schema const backing an exported `z.infer` alias is
// itself part of the contract and a change to it is a potential surface change.
// Bare re-export statements (`export { Foo }`, `export { Bar as Foo }`, `export
// type { Foo }`, `export * as ns from 'm'`) count too: api-extractor emits one for
// every symbol a package re-exports from a dependency, and those are public API
// exactly like a local declaration — dropping one removes a name consumers import.
// So do the default slots (`export default`, `export =`, and an inline `export
// default class Foo {}`). A wildcard `export * from 'm'` names no symbol at all, so
// no classification of it can be computed: it fails the gate rather than passing
// silently over whatever vanished behind it.
//
// The guiding rule is industry-standard semver for a TypeScript library: a PURELY
// ADDITIVE surface change is a minor, and only a removal or a change to something
// that already existed is breaking. Two rules decide what is additive.
//
// LINES. A variable/type/function slot whose api.md text changed is compared by its
// member LINES first: when every old line survives and the delta is only whole new
// lines, it is additive and non-breaking — whatever those lines hold, a new REQUIRED
// member or param line included (a new member added to a client object, an exported
// object type, or an inline function-signature return shape; a new param line). An
// old line with no identical survivor must be matched by a new line that is the old
// one grown only by the three shapes below. An interface/class member, and the head of
// an interface/class declaration, are compared whole by those shapes alone, never by
// lines; a function overload survives by either rule.
//
// SHAPES. Three shapes of change are ADDITIVE: a literal type or all-literal union
// (string, number, boolean, null literals) widened with more literal alternatives
// (`| "x"`); an OPTIONAL property (`name?: T`) added inside an inline object type; and
// OPTIONAL params (`name?: T`) appended at the end of a parameter list. Each is judged
// on the parsed declaration: a changed line, member, overload or declaration head is
// parsed as the member or statement it is, and the new one must be the old one grown
// only by those shapes, at any depth (a type argument, an array element, a parameter's
// type, a return type), everything else identical. Within a line, member, overload or
// head so compared, an optional param inserted before an existing one, an appended REST
// param, a param made required, a REQUIRED property added inside an inline object type
// (which the gate cannot judge safe without an input/output notion), a literal joined to
// a NON-literal type (`number | "auto"`), a type parameter added (with a default or
// not), or any removed, renamed or retyped part errs breaking; so does a line, member,
// overload or head the parser rejects.
//
// Comparison is over each line's CANONICAL form, so an EMISSION-ONLY reshape reads as
// no change: api-extractor emits an inferred object type's members, and a union's
// alternatives, in an order an internal refactor can reshuffle, and renders a type
// reference either bare (`Foo`) or through the namespace-import alias of its source
// module (`s.Foo`) — none of which alters the set of members or the identity of any
// type. Canonicalization collapses whitespace, sorts a top-level union's alternatives,
// and drops namespace-alias qualifiers (keeping the leaf name as the discriminator).
// A genuine change — a different member, a changed or removed type, a different leaf
// type name — still differs after canonicalization and keeps its classification. The
// additive comparison of parsed declarations folds the same emission differences, and
// reads a union's alternatives in any order at any depth.
//
// Export status is judged once for every kind of declaration, at the top level and
// inside a namespace alike, and apart from the declaration's text: `export` dropped
// removes a name consumers import (breaking, like a removed symbol), and so does a
// named export made default-only (`export default` exports the default slot, never the
// name); `export` added, or a default export added beside what was there, is a new
// export (non-breaking), the rest of the declaration still compared as below. A
// default export is the name it points at, whether written inline
// (`export default function f`) or apart (`export default f`), so moving between the
// two forms is no change; only a default re-pointed or dropped is. `declare` is never
// compared: in a declaration file every declaration is ambient.
//
// A variable's declaration keyword is judged apart from its text, by the kind of
// block it sits in: a module's own top level, a UMD module's top level (one with
// `export as namespace`), a namespace (a dotted one included), a global block
// (`declare global`, or `global` inside `declare module "x"`), or `declare module
// "x"`.
// - `const` turned `let` or `var` is breaking in every block: `const` alone allows a
//   literal initializer (`const a = "x"`, typed `"x"`) and a `unique symbol` type,
//   which readers rely on.
// - `let` or `var` turned `const` is breaking at a UMD module's top level, in a
//   namespace and in a global block, where consumers assign the member (`L.a = …`,
//   `N.a = …`).
// - `var` turned `let` or `const` is breaking in a namespace, in a global block and in
//   `declare module "x"`, where a consumer's augmentation can redeclare a `var` (and a
//   global `var` is read through `globalThis`).
// - `let` turned `var` is breaking in a global block, where a `let` stays narrowed
//   inside a callback (`if (typeof g === "string") f(() => g.length)`) and a `var` does
//   not; in every other block that narrowing fails under all three keywords.
// - Any other change between `let`, `var` and `const` is no break: at a module's own
//   top level every importer reads a variable as read-only and none can redeclare it,
//   and a `declare module "x"` member is read-only to its importers too.
// - A keyword the gate does not know (`using`) fails closed: any change to or from it
//   reads as breaking.
//
// Export status follows each block's own rule. At a module's top level a declaration
// is exported only when marked `export`. A namespace or `declare module "x"` whose
// block holds no export declaration or assignment exports every member; one whose
// block holds any (`export {}`, `export { x }`, `export *`, `export =`, `export
// default x`), wherever in the block, exports only the members marked `export`. An
// inline `export default` declaration is never exported under its own name. Every member of a global block is a global. A
// dotted namespace (`namespace A.B`) is the nested namespaces it stands for. The UMD
// name of `export as namespace L` is a slot of its own: dropped or renamed, it breaks
// the scripts that read `L`.
//
// Breaking classes: a removed symbol, an `export` dropped from a declaration, a
// removed, added or NON-additively changed class constructor, a removed or
// NON-additively changed interface/class member (named or an index/call/construct
// signature), a NON-additive change to an interface or class declaration's own
// modifiers (a class made or unmade `abstract`), type parameters or heritage
// clauses (`extends`/`implements`), a member turned from optional to required, a
// new REQUIRED member, a function or method overload removed or changed
// NON-additively, a removed/changed enum member, an enum made `const` (a
// `const enum` allows only member access, and none at all from a declaration file
// under `isolatedModules`), a removed/changed namespace member, a variable keyword
// change that breaks consumers in its block (as above), a re-export dropped or
// re-pointed at a different local symbol, source module or namespace (or narrowed
// to type-only), a default export dropped or re-pointed, a type alias's type
// parameters changed NON-additively, and a non-additive change to a type alias.
// Non-breaking changes — a new export (a new declaration, or `export` added to an
// existing one), `const` dropped from an enum (a plain enum allows every use a
// `const enum` did), a variable keyword change that breaks no consumer in its
// block, a new optional member, a member added to a variable/type object or an
// overload's inline shape (an additive superset of the old member lines), a member,
// member line or overload grown only by the three additive shapes, an interface or
// class member turned from required to optional (inside an inline object type that
// flip re-renders the member's line and reads as breaking — the gate errs strict
// there), an added overload, an added enum member, a string-literal union widened
// with more members. Any tooling failure or report the gate cannot classify —
// unreadable config, an unknown mode, a report with no `ts` code fence, a name
// declared or exported twice (two declarations TypeScript merges into one symbol, a
// declaration and an `export { … }` of the same name, two default exports; only
// function overloads share a name), a statement kind the gate does not model
// (anything but a declaration, an export, an `import … from` declaration, or text
// TypeScript could not parse; an `import x = …` is one), a git error that is not simply an absent path at the ref — throws; the
// gate never passes a release on a classification it could not compute. A
// declaration TypeScript cannot parse is never judged additive, so any change to it
// reads as breaking. api-extractor can render lines TypeScript rejects (a bare
// `infer<S>`, for one); TypeScript then ends the declaration early and reads the
// rest of the line as separate statements, which the gate keeps as that
// declaration's unparsed text, so that text added, dropped or changed anywhere in
// such a line always reads as breaking.
//
// Usage: node scripts/api-gate.mjs --version <X.Y.Z>

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Every committed report the published packages gate on, each with its own etc/
// directory so the two packages' reports live under their own package folders.
const REPORTS = [
  { dir: 'packages/studio-sdk/etc', name: 'studio-sdk.api.md' },
  { dir: 'packages/studio-sdk/etc', name: 'studio-sdk-host.api.md' },
  { dir: 'packages/studio-sdk/etc', name: 'studio-sdk-testing.api.md' },
  { dir: 'packages/studio-sdk/etc', name: 'studio-sdk-schema-form.api.md' },
  { dir: 'packages/api-client/etc', name: 'api-client.api.md' },
];
const MODE_NAMES = new Set(['label-honesty', 'strict']);

// A gate-intended failure (bad config, dishonest release, missing report). The CLI
// entrypoint catches it, prints the ::error:: annotation and exits 1; a test can
// catch it as a normal exception without the process being torn down.
class GateError extends Error {}

function fail(message) {
  throw new GateError(message);
}

function readMode() {
  const text = readFileSync(resolve(REPO_ROOT, '.github/api-gate.yml'), 'utf8');
  const match = text.match(/^mode:\s*["']?([A-Za-z-]+)["']?/m);
  if (!match || !MODE_NAMES.has(match[1])) {
    fail(`api-gate config mode ${match ? match[1] : '<missing>'} not one of ${[...MODE_NAMES]}`);
  }
  return match[1];
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail(`version ${version} is not a bare major.minor.patch`);
  return match.slice(1, 4).map(Number);
}

function bumpClass(oldV, newV) {
  const [oMaj, oMin, oPat] = parseVersion(oldV);
  const [nMaj, nMin, nPat] = parseVersion(newV);
  if (nMaj < oMaj || (nMaj === oMaj && (nMin < oMin || (nMin === oMin && nPat <= oPat)))) {
    fail(`new version ${newV} does not increase previous released ${oldV}`);
  }
  if (nMaj !== oMaj) return 'major';
  if (nMin !== oMin) return 'minor';
  return 'patch';
}

const versionClass = (newMajor) => (newMajor >= 1 ? '>=1.0' : '0.x');

// Bump classes that may carry a breaking surface change, given the mode and the
// NEW version's major component. Strict allows only a major for every version;
// label-honesty allows a major for a >=1.0 package and both a minor and a major
// for a 0.x one (the 0.x breaking slot).
function allowedBumps(mode, newMajor) {
  if (mode === 'strict') return new Set(['major']);
  if (mode === 'label-honesty') {
    return newMajor >= 1 ? new Set(['major']) : new Set(['minor', 'major']);
  }
  fail(`api-gate config mode ${mode} not one of ${[...MODE_NAMES]}`);
}

// The gate's pass/fail decision, factored out of the git/typescript I/O so the
// whole mode x version x bump matrix is unit-testable. Returns { passes, reason };
// a failing reason names mode, the version class, the computed allowed bump set
// and the actual bump so it explains itself.
function gatePasses(mode, oldVersion, newVersion, hasBreaking) {
  const bump = bumpClass(oldVersion, newVersion);
  const [newMajor] = parseVersion(newVersion);
  const allowed = allowedBumps(mode, newMajor);
  if (!hasBreaking)
    return { passes: true, reason: `no breaking surface changes for a ${bump} bump` };
  const detail =
    `mode=${mode}, version class=${versionClass(newMajor)}, ` +
    `computed allowed bump(s)=${[...allowed].sort().join(',')}, bump=${bump}`;
  if (allowed.has(bump)) return { passes: true, reason: `breaking changes are honest (${detail})` };
  return {
    passes: false,
    reason: `is a ${bump} bump but carries breaking surface changes (${detail})`,
  };
}

const versionBelow = (a, b) =>
  a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));

// The baseline tag for a report: the highest `v<major.minor.patch>` tag strictly
// below `newVersion` whose version is PUBLISHED on npm for that report's package,
// or null when no published version sits below the release. A tag whose publish was
// refused still exists in git, so it must NOT seed the next release's baseline —
// the breaking items it carried would vanish from the diff. Pure over the tag list
// and the published-version list so the whole selection is unit-testable without git
// or npm; non-semver tags are ignored, and published versions at or above the target
// never qualify.
function previousPublishedTag(newVersion, tags, publishedVersions) {
  const newKey = parseVersion(newVersion);
  const published = new Set(publishedVersions);
  let best = null;
  for (const tag of tags) {
    const version = tag.trim().replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    if (!published.has(version)) continue;
    const key = parseVersion(version);
    if (versionBelow(key, newKey) && (best === null || versionBelow(best.key, key)))
      best = { key, tag: tag.trim() };
  }
  return best ? best.tag : null;
}

// The semver tags strictly between the chosen baseline and the release that are NOT
// published — the tags skipped to reach the baseline. Naming them explains why the
// baseline is older than the newest tag.
function skippedUnpublishedTags(baselineTag, newVersion, tags, publishedVersions) {
  const newKey = parseVersion(newVersion);
  const baseKey = parseVersion(baselineTag.replace(/^v/, ''));
  const published = new Set(publishedVersions);
  const out = [];
  for (const tag of tags) {
    const version = tag.trim().replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    const key = parseVersion(version);
    if (versionBelow(baseKey, key) && versionBelow(key, newKey) && !published.has(version))
      out.push(tag.trim());
  }
  return out;
}

function gitTags() {
  const out = execFileSync('git', ['tag', '--list', 'v*'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

// The npm package name that owns a report, read from the package.json one level above
// the report's etc/ directory.
function packageNameForReport(dir) {
  const pkgJsonPath = resolve(REPO_ROOT, dir, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (!pkg.name) fail(`package.json at ${pkgJsonPath} has no name`);
  return pkg.name;
}

// The versions published on npm for a package, via `npm view`, which honours the
// project's own registry configuration. A package that has never been published is
// the registry's E404 — a well-defined "first publish" signal that maps to an empty
// list, not a failure. Every other outcome (a failed run, an unparsable body, any
// other registry error, an unexpected shape) fails the gate loudly; the gate never
// falls back to raw git tags on an npm failure.
function npmPublishedVersions(packageName) {
  const args = ['view', packageName, 'versions', '--json'];
  const cmd = `npm ${args.join(' ')}`;
  const res = spawnSync('npm', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (res.error) fail(`${cmd} failed to run: ${res.error.message}`);
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    fail(
      `${cmd} produced unparsable output (exit ${res.status}): ${res.stderr.trim() || res.stdout.trim()}`,
    );
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error) {
    if (parsed.error.code === 'E404') return [];
    fail(`${cmd} failed: ${parsed.error.summary ?? parsed.error.code ?? res.stderr.trim()}`);
  }
  if (res.status !== 0) fail(`${cmd} exited ${res.status}: ${res.stderr.trim()}`);
  if (typeof parsed === 'string') return [parsed];
  if (Array.isArray(parsed)) return parsed;
  fail(`${cmd} returned an unexpected shape: ${res.stdout.trim()}`);
}

// The committed report at a git ref, or null when it does not exist there. The
// path's absence at the ref is the expected "new report" case and maps to null;
// any OTHER git failure (an invalid ref, not a repository) surfaces loudly rather
// than being silently read as "new". `git ls-tree` distinguishes the two: a valid
// ref with an absent path exits 0 with empty output, while a bad ref exits non-zero.
function reportAtRef(ref, dir, name) {
  const path = `${dir}/${name}`;
  const ls = spawnSync('git', ['ls-tree', '--name-only', ref, '--', path], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (ls.error) fail(`git ls-tree failed for ${ref}:${path}: ${ls.error.message}`);
  if (ls.status !== 0) fail(`git ls-tree failed for ${ref}:${path}: ${ls.stderr.trim()}`);
  if (ls.stdout.trim() === '') return null; // path absent at this ref — additive.
  return execFileSync('git', ['show', `${ref}:${path}`], { cwd: REPO_ROOT, encoding: 'utf8' });
}

function reportAtWorktree(dir, name) {
  try {
    return readFileSync(resolve(REPO_ROOT, dir, name), 'utf8');
  } catch {
    return null;
  }
}

const collapse = (text) => text.replace(/\s+/g, ' ').trim();

// The indices of a single collapsed line at which a character satisfies `pred`,
// evaluated only at bracket depth 0 (across `()[]{}` and generic `<>`) and OUTSIDE
// string literals — so a separator nested in a generic, an object type, a parameter
// list, or a `'...'`/`"..."`/`` `...` `` literal is never seen as top-level. A `>`
// closing an arrow token (`=>`) is not a bracket.
function topLevelIndices(text, pred) {
  const out = [];
  let depth = 0;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{' || c === '<') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
    } else if (c === '>') {
      if (text[i - 1] !== '=') depth--;
    } else if (depth === 0 && pred(c, i)) {
      out.push(i);
    }
  }
  return out;
}

// Drop namespace-alias qualifiers from type references outside string literals:
// api-extractor renders a type either bare (`Foo`) or through the namespace-import
// alias it assigned that symbol's source module (`s.Foo`), and an internal refactor
// can flip one to the other without changing the type a consumer sees. Only the
// qualifier is removed; the leaf name — the discriminator — stays, so `s.Foo` and
// `Foo` fold together while `s.Foo -> s.Bar` (or any real leaf change) still differs.
// String literals (literal-type members, module specifiers) are copied verbatim, so
// a dotted module name inside quotes is never altered.
function stripQualifiers(text) {
  let out = '';
  let buf = '';
  let quote = '';
  const flush = () => {
    out += buf.replace(/[A-Za-z_$][\w$]*\./g, '');
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === quote && text[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      flush();
      out += c;
      quote = c;
      continue;
    }
    buf += c;
  }
  flush();
  return out;
}

// The index of the member/alias boundary on a collapsed line — the top-level colon of
// a `name: Type` member (or an index/call signature's `]: `/`): `), else a top-level
// standalone `=` of a `type X = ...` alias, else -1. Everything after it is the type
// whose union alternatives are order-insensitive.
function typeBoundary(line) {
  const colons = topLevelIndices(line, (c) => c === ':');
  if (colons.length) return colons[colons.length - 1];
  const eqs = topLevelIndices(line, (c, i) => c === '=' && line[i + 1] !== '>');
  return eqs.length ? eqs[eqs.length - 1] : -1;
}

// Canonicalize a single api-extractor line so two lines that describe the same member
// or type modulo EMISSION differences compare equal: whitespace collapsed, namespace
// qualifiers dropped, and the alternatives of a top-level union type sorted (union
// order carries no meaning). A genuine content change — a different member name, a
// changed/removed type, an added member, a different leaf type — still differs after
// canonicalization, so it keeps its classification.
function canonical(line) {
  const s = stripQualifiers(collapse(line));
  const boundary = typeBoundary(s);
  const head = boundary === -1 ? '' : s.slice(0, boundary + 1);
  let type = boundary === -1 ? s : s.slice(boundary + 1);
  const tail = type.match(/[;,]\s*$/);
  const suffix = tail ? type.slice(tail.index).trim() : '';
  if (tail) type = type.slice(0, tail.index);
  const bars = topLevelIndices(type, (c) => c === '|');
  if (bars.length === 0) return s;
  const members = [];
  let start = 0;
  for (const idx of [...bars, type.length]) {
    members.push(type.slice(start, idx).trim());
    start = idx + 1;
  }
  const sorted = members
    .filter((m) => m !== '')
    .sort()
    .join(' | ');
  return `${head ? `${head} ` : ''}${sorted}${suffix}`;
}

const normalize = (text) => canonical(text);

// The multiset of canonicalized, non-empty lines of a declaration's raw (multi-line)
// api-extractor text, as a map from each canonical line to the collapsed source lines
// that render it. api-extractor renders one member per line, so the lines ARE the
// members; keeping every source line keeps two members that happen to render to the
// same line distinct (removing one drops the count). Lines are keyed canonically, so a
// pure reshape (members reordered, a union's alternatives reordered, a type reference
// requalified) yields the same multiset while any real member change alters it. The
// source lines are kept for the additive comparison, which parses them.
function lineMultiset(text) {
  const map = new Map();
  for (const raw of text.split('\n')) {
    const line = canonical(raw);
    if (line === '') continue;
    const sources = map.get(line) ?? [];
    sources.push(collapse(raw));
    map.set(line, sources);
  }
  return map;
}

// Parse one declaration fragment as the shape it is: an interface/object-type member
// (`name: T;`, `name(a: A): T;`, `[k: string]: T;`), a class member (`static x: T;`,
// `constructor(a: A);`), or a top-level statement (`export declare function f(): T;`).
// The shape is chosen by the caller, never guessed by trying: a member line such as
// `a: number;` also parses as a labeled statement. Returns { node, sf }, or null when
// the text is not exactly one syntactically clean fragment of that shape — a partial
// line of a multi-line declaration (`c: {`, `}): void;`), or text TypeScript rejects.
function parseFragment(text, shape) {
  const source =
    shape === 'member'
      ? `interface _ {\n${text}\n}`
      : shape === 'class-member'
        ? `declare class _ {\n${text}\n}`
        : text;
  const { diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    fileName: '_.ts',
    compilerOptions: { noResolve: true, target: ts.ScriptTarget.Latest },
  });
  if (diagnostics.length) return null;
  const sf = ts.createSourceFile('_.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sf.statements.length !== 1) return null;
  const statement = sf.statements[0];
  if (shape === 'statement') return { node: statement, sf };
  if (!ts.isInterfaceDeclaration(statement) && !ts.isClassDeclaration(statement)) return null;
  if (statement.members.length !== 1) return null;
  return { node: statement.members[0], sf };
}

// A line of a variable/type/function slot opens a statement when it starts with a
// declaration keyword followed by a name (`export declare function f(`, `type X =`);
// every other line is a member of an inline object type. A member NAMED like a keyword
// (`type: "a";`, `declare?: boolean;`) is followed by `:`/`?`/`(`, never by a name.
const STATEMENT_LINE =
  /^(?:export|declare|function|type|const|let|var|class|interface|enum|namespace|abstract)\s+[\w$]/;
const lineShape = (line) => (STATEMENT_LINE.test(line) ? 'statement' : 'member');

const unparenthesized = (node) => {
  let inner = node;
  while (ts.isParenthesizedTypeNode(inner)) inner = inner.type;
  return inner;
};

// A member's trailing `;`/`,` separator: api-extractor ends a member with one except
// the last member of a compact inline object type (`{ a: string }`), so it carries no
// meaning in a comparison.
const MEMBER_SEPARATOR = /[;,]$/;

// A node's text in the canonical comparison form: whitespace collapsed, namespace-alias
// qualifiers dropped (so `s.Foo` and `Foo` are the same type here as they are on a
// canonical line), and a trailing member separator removed.
const nodeText = (node, sf) =>
  stripQualifiers(collapse(node.getText(sf))).replace(MEMBER_SEPARATOR, '');

function childNodes(node) {
  const children = [];
  node.forEachChild((child) => {
    children.push(child);
  });
  return children;
}

// The node's OWN tokens — every token of its text outside its child nodes, comments
// and a trailing member separator skipped — with a marker in each child's place:
// `keyof \0`, `\0 [ ]`, `\0 < \0 >`, `\0 \0 : \0` (a `readonly` property). Two nodes
// of one kind with the same own tokens differ only inside their children.
function ownTokens(node, sf) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true);
  const tokens = [];
  const scan = (start, end) => {
    scanner.setText(sf.text, start, end - start);
    while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText());
  };
  let pos = node.getStart(sf);
  for (const child of childNodes(node)) {
    scan(pos, child.getStart(sf));
    tokens.push('\0');
    pos = child.getEnd();
  }
  scan(pos, node.getEnd());
  if (MEMBER_SEPARATOR.test(tokens.at(-1) ?? '')) tokens.pop();
  return tokens.join(' ');
}

// The alternatives of a literal type or of a union whose alternatives are ALL literal
// types (string, number — a negative one included — boolean, null, or a template
// literal without substitutions), as a Set of their texts; null for any other type.
// Only such a type can widen additively by gaining alternatives.
function literalAlternatives(typeNode, sf) {
  if (!typeNode) return null;
  const type = unparenthesized(typeNode);
  const alternatives = ts.isUnionTypeNode(type) ? type.types.map(unparenthesized) : [type];
  const set = new Set();
  for (const alternative of alternatives) {
    if (!ts.isLiteralTypeNode(alternative)) return null;
    set.add(nodeText(alternative, sf));
  }
  return set;
}

const isSignatureNode = (node) =>
  ts.isFunctionTypeNode(node) ||
  ts.isConstructorTypeNode(node) ||
  ts.isMethodSignature(node) ||
  ts.isCallSignatureDeclaration(node) ||
  ts.isConstructSignatureDeclaration(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

const sameText = (a, sa, b, sb) => (a ? nodeText(a, sa) : '') === (b ? nodeText(b, sb) : '');
const sameList = (a, sa, b, sb) =>
  (a ?? []).map((n) => nodeText(n, sa)).join(',') ===
  (b ?? []).map((n) => nodeText(n, sb)).join(',');
const memberName = (member, sf) =>
  member.name ? nodeText(member.name, sf) : ts.SyntaxKind[member.kind];

// Every old member of an object type survives in the new one under its name, grown
// only additively; every new member left over is a NAMED `?`-optional member. An added
// required member, index signature or call signature is not additive.
function additiveMembers(oldMembers, sa, newMembers, sb) {
  const pool = [...newMembers];
  for (const oldMember of oldMembers) {
    const name = memberName(oldMember, sa);
    const idx = pool.findIndex(
      (newMember) =>
        memberName(newMember, sb) === name && additiveNode(oldMember, sa, newMember, sb),
    );
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  return pool.every((member) => Boolean(member.questionToken) && Boolean(member.name));
}

// The same alternatives in any order, each old one surviving additively in a distinct
// new one. A union gains no alternative here: only an all-literal union may grow
// (literalAlternatives).
function additiveAlternatives(oldTypes, sa, newTypes, sb) {
  if (oldTypes.length !== newTypes.length) return false;
  const pool = [...newTypes];
  for (const oldType of oldTypes) {
    let idx = pool.findIndex((newType) => sameText(oldType, sa, newType, sb));
    if (idx === -1) idx = pool.findIndex((newType) => additiveNode(oldType, sa, newType, sb));
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  return true;
}

// additiveNode over two possibly-absent nodes: both absent, or both present and grown
// only additively.
const additiveOptionalNode = (a, sa, b, sb) => (a && b ? additiveNode(a, sa, b, sb) : !a && !b);

// A signature grown only additively: its modifiers, name, type parameters and own `?`
// identical; every old param kept in place with the same modifiers, name, `?` and `...`
// and a type grown only additively; every appended param `?`-optional and not a rest
// param; its return type grown only additively. An optional param inserted before an
// existing one shifts every later positional argument, so it is not additive.
function additiveSignature(a, sa, b, sb) {
  if (!sameList(a.modifiers, sa, b.modifiers, sb)) return false;
  if (!sameText(a.name, sa, b.name, sb)) return false;
  if (!sameList(a.typeParameters, sa, b.typeParameters, sb)) return false;
  if (Boolean(a.questionToken) !== Boolean(b.questionToken)) return false;
  if (b.parameters.length < a.parameters.length) return false;
  for (const [i, oldParam] of a.parameters.entries()) {
    const newParam = b.parameters[i];
    if (!sameList(oldParam.modifiers, sa, newParam.modifiers, sb)) return false;
    if (!sameText(oldParam.name, sa, newParam.name, sb)) return false;
    if (Boolean(oldParam.questionToken) !== Boolean(newParam.questionToken)) return false;
    if (Boolean(oldParam.dotDotDotToken) !== Boolean(newParam.dotDotDotToken)) return false;
    if (!additiveOptionalNode(oldParam.type, sa, newParam.type, sb)) return false;
  }
  const appended = b.parameters.slice(a.parameters.length);
  if (!appended.every((param) => param.questionToken && !param.dotDotDotToken)) return false;
  return additiveOptionalNode(a.type, sa, b.type, sb);
}

// True iff node `b` (in source file `sb`) is node `a` (in `sa`) grown only by the
// gate's three additive shapes, at any depth: a literal type or all-literal union
// widened with more literal alternatives; an object type with added `?`-optional
// members; a signature with appended `?`-optional params. Everything else must be the
// same, up to whitespace, comments, namespace-alias qualifiers, parentheses and the
// order of a union's alternatives.
function additiveNode(oldNode, sa, newNode, sb) {
  const a = unparenthesized(oldNode);
  const b = unparenthesized(newNode);
  if (sameText(a, sa, b, sb)) return true;
  const oldLiterals = literalAlternatives(a, sa);
  const newLiterals = literalAlternatives(b, sb);
  if (oldLiterals && newLiterals) return [...oldLiterals].every((l) => newLiterals.has(l));
  if (a.kind !== b.kind) return false;
  if (ts.isTypeLiteralNode(a)) return additiveMembers(a.members, sa, b.members, sb);
  if (ts.isUnionTypeNode(a)) return additiveAlternatives(a.types, sa, b.types, sb);
  if (isSignatureNode(a)) return additiveSignature(a, sa, b, sb);
  if (ownTokens(a, sa) !== ownTokens(b, sb)) return false;
  const oldChildren = childNodes(a);
  const newChildren = childNodes(b);
  return (
    oldChildren.length === newChildren.length &&
    oldChildren.every((child, i) => additiveNode(child, sa, newChildren[i], sb))
  );
}

// True iff `newText` is `oldText` grown only additively (additiveNode), both parsed as
// the fragment `shape` (parseFragment). A side the parser rejects is not additive, so
// the change reads as breaking: the gate never loosens on text it cannot read.
function isAdditiveFragment(oldText, newText, shape) {
  const oldFragment = parseFragment(oldText, shape);
  const newFragment = parseFragment(newText, shape);
  if (!oldFragment || !newFragment) return false;
  return additiveNode(oldFragment.node, oldFragment.sf, newFragment.node, newFragment.sf);
}

// isAdditiveFragment over two lines of a variable/type/function slot, each parsed as
// the shape its leading keyword names (lineShape); lines of different shapes are not
// additive.
function isAdditiveLineChange(oldLine, newLine) {
  const shape = lineShape(oldLine);
  return shape === lineShape(newLine) && isAdditiveFragment(oldLine, newLine, shape);
}

// True when `newText` is a purely-additive superset of `oldText`: every member line
// of the old declaration still appears in the new one — either canonically equal (its
// whitespace, union order and namespace-alias qualifiers folded by lineMultiset), or
// as a line grown only additively (isAdditiveLineChange: a widened literal union, an
// added optional property, appended optional params) — so the change is only
// insertions and backward-compatible growth. Any old line with no such survivor means
// an existing member was removed, retyped or narrowed — not additive. A
// reordering-only change is additive (all old lines survive), which is correct. Known
// blind spots: the multiset is per-declaration, so a narrowing whose removed line is
// re-added elsewhere in the same declaration in the same release reads as additive;
// and folding namespace-alias qualifiers pairs `s.Foo` with `Foo` by leaf name, so a
// same-leaf requalification to a DIFFERENT module (`s.Foo` -> `t.Foo`) reads as no
// change. Every realistic breaking change carries a distinctive vanished line.
function isAdditive(oldText, newText) {
  const newLines = lineMultiset(newText);
  const leftover = [];
  for (const [line, oldSources] of lineMultiset(oldText)) {
    const newSources = newLines.get(line) ?? [];
    const consumed = Math.min(oldSources.length, newSources.length);
    newSources.splice(0, consumed);
    leftover.push(...oldSources.slice(consumed));
  }
  if (leftover.length === 0) return true;
  const pool = [...newLines.values()].flat();
  for (const oldLine of leftover) {
    const idx = pool.findIndex((candidate) => isAdditiveLineChange(oldLine, candidate));
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  return true;
}

// A stable key for an interface/class member. Named members key by their name;
// the unnamed members (index/call/construct signatures, a class constructor) key by a
// synthesized constant so their removal or change is compared rather than skipped.
function memberKey(member, sf) {
  if (member.name) return member.name.getText(sf);
  if (ts.isConstructorDeclaration(member)) return '[constructor]';
  if (ts.isIndexSignatureDeclaration(member)) return '[index signature]';
  if (ts.isCallSignatureDeclaration(member)) return '[call signature]';
  if (ts.isConstructSignatureDeclaration(member)) return '[construct signature]';
  return null;
}

// A member's declaration text with its own optionality token ("?") removed, so a
// required <-> optional flip does not read as a signature change. The flip is
// classified from the separate `optional` flag; the signature carries everything
// else (readonly, parameters, type). Only the member's OWN question token is
// stripped — a "?" inside a parameter list or type is left intact.
function memberSignature(member, sf) {
  const text = member.getText(sf);
  const q = member.questionToken;
  if (!q) return text;
  const base = member.getStart(sf);
  return text.slice(0, q.getStart(sf) - base) + text.slice(q.getEnd() - base);
}

// Members keyed by name (or synthesized signature key) -> { optional, signatures }.
// signatures maps each optionality-stripped declaration text, normalized, to that
// text as the report renders it (for the additive comparison, which parses it), so
// overloaded methods keep every overload (like a top-level function); a member is
// optional only when every declaration of it is optional.
function collectMembers(node, sf) {
  const map = new Map();
  for (const member of node.members) {
    const key = memberKey(member, sf);
    if (key === null) continue;
    const optional = Boolean(member.questionToken);
    const entry = map.get(key) ?? { optional, signatures: new Map() };
    entry.optional = entry.optional && optional;
    const signature = memberSignature(member, sf);
    entry.signatures.set(normalize(signature), signature);
    map.set(key, entry);
  }
  return map;
}

const hasModifier = (node, kind) =>
  node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;

// Whether a declaration's name is an export of its scope (the module, or the
// namespace it sits in). `export default` exports only the default slot, never the
// name: `import { f }` of an `export default function f` fails. classifyEntries
// judges this one flag for every kind of entry.
const isExported = (node) =>
  hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
  !hasModifier(node, ts.SyntaxKind.DefaultKeyword);

// The modifiers a declaration's compared text leaves out. `export` and `default` are
// its export status, judged once, apart, from the entry's `exported` flag and its
// default slot. `declare` changes nothing in a declaration file, where every
// declaration is ambient (`export default function f` cannot carry it at all, while
// the same function declared apart and exported by `export default f` does).
const UNCOMPARED_MODIFIERS = new Set([
  ts.SyntaxKind.ExportKeyword,
  ts.SyntaxKind.DefaultKeyword,
  ts.SyntaxKind.DeclareKeyword,
]);

// A declaration's source text from just after its leading run of uncompared
// modifiers up to `end`: the text it is compared by.
function comparedText(node, sf, end = node.end) {
  const modifiers = node.modifiers ?? [];
  let lead = 0;
  while (lead < modifiers.length && UNCOMPARED_MODIFIERS.has(modifiers[lead].kind)) lead += 1;
  const start = lead ? ts.skipTrivia(sf.text, modifiers[lead - 1].end) : node.getStart(sf);
  return sf.text.slice(start, end);
}

// An interface or class declaration with its member list emptied — its modifiers
// other than `export`/`default`/`declare`, name, type parameters and heritage clauses
// (`abstract class C<T> extends B implements I {}`) — so a change to any of them is
// judged apart from the members.
const declarationHead = (node, sf) => `${comparedText(node, sf, node.members.pos)}}`;

function enumMembers(node, sf) {
  const map = new Map();
  for (const member of node.members)
    map.set(member.name.getText(sf), normalize(member.getText(sf)));
  return map;
}

// The re-export's source module rendered for an entry's text, or '' when the
// statement re-exports a local symbol (api-extractor's usual form: it declares the
// symbol above and re-exports it bare). Carrying the module means re-pointing an
// exported name at a DIFFERENT package reads as a change instead of a no-op.
function moduleSuffix(node, sf) {
  return node.moduleSpecifier ? ` from ${normalize(node.moduleSpecifier.getText(sf))}` : '';
}

// Classify one `export ... ` statement into entries.
//
//   * `export { Foo }` / `export { Bar as Foo }` / `export type { Foo }` [from 'm']
//     — keyed by the EXPORTED name (what a consumer imports); the text carries the
//     local symbol behind it, the type-only flag and the source module, so
//     re-pointing a name at a different symbol or package, or narrowing a value
//     export to type-only, is a change rather than a silent no-op.
//   * `export * as ns from 'm'` — names one symbol (`ns`), keyed by it.
//   * `export * from 'm'` — names NO symbol: the set of exports it carries cannot be
//     computed from the report, so a name silently vanishing behind it would pass the
//     gate. The gate never passes on a classification it could not compute, so this
//     fails LOUDLY instead.
function classifyExportDeclaration(put, node, sf) {
  const typeOnlyPrefix = node.isTypeOnly ? 'type ' : '';
  if (!node.exportClause) {
    fail(
      `report ${sf.fileName} has an unclassifiable \`export *${moduleSuffix(node, sf)}\`: it names no symbol, ` +
        'so the gate cannot tell whether an export disappeared behind it. Enumerate the exports explicitly ' +
        '(`export { A, B } from ...`).',
    );
  }
  if (ts.isNamespaceExport(node.exportClause)) {
    put(node.exportClause.name.getText(sf), {
      kind: 're-export',
      text: `${typeOnlyPrefix}*${moduleSuffix(node, sf)}`,
    });
    return;
  }
  for (const spec of node.exportClause.elements) {
    const local = (spec.propertyName ?? spec.name).getText(sf);
    const typeOnly = node.isTypeOnly || spec.isTypeOnly;
    put(spec.name.getText(sf), {
      kind: 're-export',
      text: `${typeOnly ? 'type ' : ''}${local}${moduleSuffix(node, sf)}`,
    });
  }
}

// The DEFAULT export slot of a declaration that carries `export default` inline
// (`export default class Foo {}`, `export default function foo() {}`), or null. The
// declaration itself is classified under its own name, which such a declaration does
// not export; the default slot is the name consumers import it by, and losing it
// breaks every `import Foo from '<pkg>'` consumer.
function defaultSlotText(node, sf) {
  const isDefault = node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
  );
  if (!isDefault) return null;
  // The slot records the name it points at, exactly as `export default <name>` does,
  // so moving between the two forms is no change and only a re-point or a drop is.
  // An anonymous default declaration has no name to point at, so its whole text is
  // the slot's identity — any change to it reads as a change of the default export.
  return node.name
    ? node.name.getText(sf)
    : `${ts.SyntaxKind[node.kind]} ${normalize(node.getText(sf))}`;
}

// A module declaration's entry: the kind of block it opens — 'global' for
// `declare global` (and a `global` block inside an augmentation), 'ambient-module'
// for `declare module "x"`, else 'namespace' — and its members. A dotted namespace
// (`namespace A.B {}`) parses as `A` whose body is the declaration `B`, so `B` is A's
// one member, exported as the dotted name makes it. Every member of a global block
// is a global, so reachable. A namespace or `declare module "x"` whose block holds no
// export declaration or assignment exports every member; one whose block holds any
// (`export {}`, `export { x }`, `export *`, `export =`, `export default x`), wherever
// in the block, exports only the members marked `export`.
function namespaceEntry(node, sf) {
  const block = ts.isGlobalScopeAugmentation(node)
    ? 'global'
    : ts.isStringLiteral(node.name)
      ? 'ambient-module'
      : 'namespace';
  const body = node.body;
  if (body && ts.isModuleDeclaration(body)) {
    const inner = { ...namespaceEntry(body, sf), exported: true };
    return { kind: 'namespace', block, entries: new Map([[body.name.getText(sf), inner]]) };
  }
  const statements = body && ts.isModuleBlock(body) ? body.statements : [];
  const implicitExport =
    block === 'global' ||
    !statements.some(
      (statement) => ts.isExportDeclaration(statement) || ts.isExportAssignment(statement),
    );
  return { kind: 'namespace', block, entries: collectEntries(statements, sf, implicitExport) };
}

// Parse a list of declarations into a map of symbol name -> entry, exported or not
// (every declaration in an api-extractor report is reachable from the public
// surface, so a non-exported one is part of the contract). Each entry carries its
// kind plus, for the shapes semver cares about, the structure that classification
// compares; a namespace recurses into its own members. Each name holds ONE
// declaration — api-extractor suffixes `_2` to keep distinct symbols apart — with
// function overloads the only declarations that share a name (one entry, one
// signature each, the overloads of an inline default function likewise sharing the
// default slot). A name declared or exported twice — two declarations TypeScript
// merges into one symbol (an interface and a namespace, two interfaces), a
// declaration and an `export { … }` of the same name, two default exports — fails
// the gate: the map keys each name to one entry, and keeping either one would pass
// whatever changed in the other. `implicitExport` marks a block that exports every
// member whatever its modifiers (see namespaceEntry).
//
// Statements a declaration file holds and the gate does not judge one by one: an
// `import … from` declaration only names a dependency, whose types reach the surface
// through the declarations that use them (an `import x = …` is not skipped: it fails
// the gate below). An expression or empty statement has no meaning in a
// declaration file and appears only where TypeScript rejected a line and recovered
// mid-declaration (a bare `infer<S>`), so its text is kept as a "(text TypeScript
// could not parse)" entry after the declaration it broke off from (every piece after
// one declaration joined into one entry), and that text added, dropped or changed
// reads as breaking. Any other statement kind fails the gate.
function collectEntries(statements, sf, implicitExport = false) {
  const entries = new Map();
  // The name the latest declaration put, which an unparsed fragment belongs to.
  let lastName = null;
  for (const node of statements) {
    // Every entry this statement yields carries whether it is exported: a declaration
    // by its own `export` modifier or by its block's implicit export (never an inline
    // `export default` declaration's own name), a re-export or export assignment
    // always.
    const exported =
      (implicitExport && !hasModifier(node, ts.SyntaxKind.DefaultKeyword)) ||
      isExported(node) ||
      ts.isExportDeclaration(node) ||
      ts.isExportAssignment(node);
    // `label` names an entry in the duplicate-name message when its kind alone does
    // not say what it is (an inline default declaration's slot).
    const put = (name, entry, isExport = exported) => {
      const existing = entries.get(name);
      if (existing) {
        fail(
          `report ${sf.fileName} declares or exports the name "${name}" twice ` +
            `(${existing.label ?? existing.kind} and ${entry.label ?? entry.kind}). The gate ` +
            'keys each name to one entry, so it cannot classify this name.',
        );
      }
      entries.set(name, { ...entry, exported: isExport });
      lastName = name;
    };
    // A function overload joins the entry its name's first overload put, keyed by
    // normalized text so a genuinely-unchanged overload matches exactly; the raw
    // multi-line text is kept for the additive-superset comparison. TypeScript requires
    // every overload to agree on `export`, so the first one's flag holds for all.
    const putOverload = (name, text, isExport = exported) => {
      const overloads = entries.get(name);
      if (overloads?.kind === 'function') {
        overloads.signatures.set(normalize(text), text);
        lastName = name;
      } else
        put(name, { kind: 'function', signatures: new Map([[normalize(text), text]]) }, isExport);
    };
    // An inline `export default` on a declaration: record the default SLOT here, then
    // classify the declaration itself under its own name in the chain below. The
    // overloads of an anonymous default function have no name to be judged under, so
    // they are the slot's overloads; those of a named one put the slot once.
    const defaultSlot = defaultSlotText(node, sf);
    // The slot is an export even though the declaration's name is not.
    if (defaultSlot !== null && ts.isFunctionDeclaration(node) && !node.name) {
      putOverload('export default', comparedText(node, sf), true);
    } else if (defaultSlot !== null) {
      const slot = entries.get('export default');
      const declared = ts.isClassDeclaration(node)
        ? 'class'
        : ts.isInterfaceDeclaration(node)
          ? 'interface'
          : 'function';
      // A further overload of a named default function finds the slot its first put.
      const furtherOverload =
        declared === 'function' && slot?.label === 'default function' && slot.text === defaultSlot;
      if (!furtherOverload)
        put(
          'export default',
          { kind: 'export-assignment', label: `default ${declared}`, text: defaultSlot },
          true,
        );
    }
    if (ts.isInterfaceDeclaration(node)) {
      put(node.name.text, {
        kind: 'interface',
        head: declarationHead(node, sf),
        members: collectMembers(node, sf),
      });
    } else if (ts.isClassDeclaration(node) && node.name) {
      put(node.name.text, {
        kind: 'class',
        head: declarationHead(node, sf),
        members: collectMembers(node, sf),
      });
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      putOverload(node.name.text, comparedText(node, sf));
    } else if (ts.isTypeAliasDeclaration(node)) {
      // The alias split in two, each still a statement TypeScript parses: its head
      // (name and type parameters, its type replaced by `unknown`) and its body (its
      // type, under the bare name), so each is judged once and on its own.
      const body = `type ${node.name.text} = ${sf.text.slice(node.type.getStart(sf), node.end)}`;
      put(node.name.text, {
        kind: 'type',
        head: `${comparedText(node, sf, node.type.getFullStart())} unknown;`,
        body,
        literals: literalAlternatives(node.type, sf),
      });
    } else if (ts.isEnumDeclaration(node)) {
      put(node.name.text, {
        kind: 'enum',
        constant: hasModifier(node, ts.SyntaxKind.ConstKeyword),
        members: enumMembers(node, sf),
      });
    } else if (ts.isModuleDeclaration(node)) {
      put(node.name.getText(sf), namespaceEntry(node, sf));
    } else if (ts.isVariableStatement(node)) {
      // The declaration keyword (`const`, `let`, `var`) is not part of a declarator's
      // text, so it is kept apart and judged in classifyEntries.
      const keyword = node.declarationList.getFirstToken(sf).getText(sf);
      for (const decl of node.declarationList.declarations) {
        put(decl.name.getText(sf), {
          kind: 'variable',
          keyword,
          text: normalize(decl.getText(sf)),
          raw: decl.getText(sf),
        });
      }
    } else if (ts.isExportDeclaration(node)) {
      classifyExportDeclaration(put, node, sf);
    } else if (ts.isExportAssignment(node)) {
      // `export default Foo` / `export = Foo`. Each is a single consumable slot, so
      // it is keyed by the slot (not by the symbol behind it): dropping the default
      // export breaks every `import Foo from '<pkg>'`, and swapping `export default`
      // for `export =` reads as one slot removed and another added — both breaking.
      put(node.isExportEquals ? 'export=' : 'export default', {
        kind: 'export-assignment',
        text: normalize(node.expression.getText(sf)),
      });
    } else if (ts.isNamespaceExportDeclaration(node)) {
      // `export as namespace L`: scripts reach the module as the global `L`, so the
      // name is a slot like a default export — dropped or renamed, it breaks them.
      put('export as namespace', { kind: 'umd-global', text: node.name.text }, true);
    } else if (ts.isExpressionStatement(node) || ts.isEmptyStatement(node)) {
      if (lastName === null)
        fail(`report ${sf.fileName} opens a block with text TypeScript could not parse.`);
      const owner = entries.get(lastName);
      const name = `${lastName} (text TypeScript could not parse)`;
      const fragment = entries.get(name);
      const text = normalize(node.getText(sf));
      if (fragment) fragment.text = `${fragment.text} ${text}`;
      else entries.set(name, { kind: 'unparsed', text, exported: owner.exported });
    } else if (defaultSlot === null && !ts.isImportDeclaration(node)) {
      // (An anonymous default declaration is modelled by its default slot above.)
      fail(
        `report ${sf.fileName} holds a ${ts.SyntaxKind[node.kind]} statement, which the ` +
          'gate does not model, so it cannot classify the report.',
      );
    }
  }
  return entries;
}

function parseReport(name, source) {
  const fence = source.match(/```ts\n([\s\S]*?)\n```/);
  if (!fence) fail(`report ${name} has no \`\`\`ts code fence`);
  const sf = ts.createSourceFile(name, fence[1], ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  return collectEntries(sf.statements, sf);
}

// Removal or non-additive change of a member is breaking; a member turned required
// (optional -> required) is breaking; a NEW required member is breaking. Added
// optional members, added overloads and a member declaration grown only additively
// (isAdditiveFragment, parsed as the `shape` of member it is: 'member' of an
// interface, 'class-member' of a class) are non-breaking, and a member turned OPTIONAL
// (required -> optional) is non-breaking — loosening a requirement never breaks a consumer, and
// the optionality-normalized signatures compare equal across the flip.
// Documented-conservative: adding `readonly` to a member reads as a signature
// change and stays breaking (it genuinely breaks writers).
function classifyMembers(add, symbol, oldMembers, newMembers, shape) {
  for (const [key, oldMember] of oldMembers) {
    const newMember = newMembers.get(key);
    if (!newMember) {
      add(symbol, `member "${key}" was removed`);
      continue;
    }
    if (oldMember.optional && !newMember.optional) {
      add(symbol, `member "${key}" became required`);
      continue;
    }
    const newSignatures = [...newMember.signatures.values()];
    for (const [sig, oldText] of oldMember.signatures) {
      if (newMember.signatures.has(sig)) continue;
      // A member whose declaration changed only by additive growth is
      // backward-compatible: satisfied when SOME new declaration of the same member is
      // the old one grown only additively (isAdditiveFragment).
      if (newSignatures.some((candidate) => isAdditiveFragment(oldText, candidate, shape)))
        continue;
      add(symbol, `member "${key}" signature removed or changed`);
      break;
    }
  }
  for (const [key, newMember] of newMembers) {
    if (!oldMembers.has(key) && !newMember.optional) {
      add(symbol, `new required member "${key}" was added`);
    }
  }
}

// Type aliases. The alias's own type parameters (its head) are judged first, like a
// declaration head: any change to them is breaking unless the new ones are the old
// grown only additively (a widened literal union in a constraint or a default). Its
// body is judged on its own: an all-literal union widened with additional
// alternatives (old set a subset of new) is non-breaking and a removed/changed
// alternative is breaking; any other body is compared by its text and lines.
function classifyType(add, symbol, oldEntry, newEntry) {
  if (
    normalize(oldEntry.head) !== normalize(newEntry.head) &&
    !isAdditiveFragment(oldEntry.head, newEntry.head, 'statement')
  ) {
    add(symbol, 'type parameters changed');
    return;
  }
  if (oldEntry.literals && newEntry.literals) {
    for (const lit of oldEntry.literals) {
      if (!newEntry.literals.has(lit)) {
        add(symbol, 'a union member was removed or changed');
        break;
      }
    }
    return;
  }
  // A non-literal-union alias: a purely-additive change (a member line added to an
  // inline object type) is minor-allowed; a removed/retyped member is breaking. A
  // single-line union that gains a member reads as non-additive (its one line
  // changed) and stays breaking — the documented-conservative behaviour for a
  // non-literal union widening is preserved.
  if (
    normalize(oldEntry.body) !== normalize(newEntry.body) &&
    !isAdditive(oldEntry.body, newEntry.body)
  )
    add(symbol, 'type alias declaration changed');
}

// The blocks a variable can sit in, by what a consumer can do with its members (each
// rule from tsc). A UMD module's top level (one with `export as namespace`), a
// namespace or a global block holds members a consumer can assign unless they are
// `const`. A namespace, global block or `declare module "x"` member declared `var` can
// be redeclared by a consumer's augmentation (and a global `var` alone is read through
// `globalThis`); `let` and `const` refuse both. A global `let` stays narrowed inside a
// callback where a global `var` does not; in every other block that narrowing fails
// under all three keywords. A module's own top-level variable is none of these:
// importers read it as read-only and cannot redeclare it, whatever its keyword.
const ASSIGNABLE_BLOCKS = new Set(['umd-module', 'namespace', 'global']);
const REDECLARABLE_BLOCKS = new Set(['namespace', 'global', 'ambient-module']);
const NARROWED_LET_BLOCKS = new Set(['global']);

// Whether a variable's declaration keyword change, in a block of the given kind, can
// break a consumer. `let` turned `var` breaks where a `let` stays narrowed. `var`
// turned `let` breaks where a `var` can be redeclared; `let` turned `const` where the
// member is assignable; `var` turned `const` where either holds. `const` alone allows
// a literal initializer (`const a = "x"`, typed `"x"`) and a `unique symbol` type, so
// `const` turned `let` or `var` breaks readers in every block. Any other keyword
// change (a keyword the gate does not know) is breaking.
function variableKeywordBreaks(oldKeyword, newKeyword, block) {
  if (oldKeyword === newKeyword) return false;
  if (oldKeyword === 'let' && newKeyword === 'var') return NARROWED_LET_BLOCKS.has(block);
  if (oldKeyword === 'var' && newKeyword === 'let') return REDECLARABLE_BLOCKS.has(block);
  if (oldKeyword === 'let' && newKeyword === 'const') return ASSIGNABLE_BLOCKS.has(block);
  if (oldKeyword === 'var' && newKeyword === 'const')
    return ASSIGNABLE_BLOCKS.has(block) || REDECLARABLE_BLOCKS.has(block);
  return true;
}

// Breaking classification for one entries map, old -> new. `scope` prefixes every
// finding and `block` names the kind of block the entries sit in ('module' for a
// report's top level); it recurses into namespaces with the nested scope and block.
function classifyEntries(scope, oldEntries, newEntries, block = 'module') {
  const findings = [];
  const add = (symbol, detail) => findings.push(`${scope}${symbol}: ${detail}`);

  for (const [name, oldEntry] of oldEntries) {
    const newEntry = newEntries.get(name);
    if (!newEntry) {
      add(name, 'symbol was removed');
      continue;
    }
    // Export status, for every kind and at every depth: a declaration that lost its
    // `export` is gone from the names consumers import; one that gained it is a new
    // export, so the comparison below never sees the modifier.
    if (oldEntry.exported && !newEntry.exported) {
      add(name, 'export was removed');
      continue;
    }
    if (newEntry.kind !== oldEntry.kind) {
      add(name, `kind changed (${oldEntry.kind} -> ${newEntry.kind})`);
      continue;
    }
    switch (oldEntry.kind) {
      case 'interface':
      case 'class':
        // The declaration's own modifiers, type parameters and heritage clauses: any
        // change to them is breaking unless the new head is the old one grown only
        // additively (a widened literal union in a heritage type argument).
        if (
          normalize(oldEntry.head) !== normalize(newEntry.head) &&
          !isAdditiveFragment(oldEntry.head, newEntry.head, 'statement')
        )
          add(name, 'modifiers, type parameters or heritage clauses changed');
        classifyMembers(
          add,
          name,
          oldEntry.members,
          newEntry.members,
          oldEntry.kind === 'class' ? 'class-member' : 'member',
        );
        break;
      case 'function': {
        // An old overload is satisfied when the new surface still carries it
        // unchanged OR an additive superset of it (a param/member line added inside
        // its inline signature). Added overloads and additive growth of an existing
        // one are non-breaking; only an overload that vanished or changed
        // non-additively (a removed/retyped/narrowed member or param) is breaking.
        const newRaw = [...newEntry.signatures.values()];
        for (const [sig, oldRaw] of oldEntry.signatures) {
          if (newEntry.signatures.has(sig)) continue;
          // isAdditive covers growth by whole lines (a member/param line added inside
          // the signature); isAdditiveFragment judges the whole overload parsed as
          // its declaration (appended optional params, a widened literal union, an
          // optional property added inside an inline object type, at any depth).
          if (newRaw.some((candidate) => isAdditive(oldRaw, candidate))) continue;
          if (newRaw.some((candidate) => isAdditiveFragment(oldRaw, candidate, 'statement')))
            continue;
          add(name, 'a function overload was removed or changed');
          break;
        }
        break;
      }
      case 'enum':
        // A `const enum` accepts only member access, and none at all from an ambient
        // declaration under `isolatedModules`, so `const` added breaks consumers; a
        // plain enum accepts every use a `const enum` did, so `const` dropped does not.
        if (!oldEntry.constant && newEntry.constant) add(name, 'enum made const');
        for (const [member, text] of oldEntry.members) {
          const newText = newEntry.members.get(member);
          if (newText === undefined) add(name, `enum member "${member}" was removed`);
          else if (newText !== text) add(name, `enum member "${member}" changed`);
        }
        break;
      case 'namespace':
        findings.push(
          ...classifyEntries(
            `${scope}${name}.`,
            oldEntry.entries,
            newEntry.entries,
            oldEntry.block,
          ),
        );
        break;
      case 'type':
        classifyType(add, name, oldEntry, newEntry);
        break;
      case 'variable':
        if (variableKeywordBreaks(oldEntry.keyword, newEntry.keyword, block))
          add(
            name,
            `variable declaration keyword changed from ${oldEntry.keyword} to ${newEntry.keyword}`,
          );
      // falls through: the declarator text is compared like any text-compared slot.
      default:
        // A variable (and any other text-compared slot). A change is breaking only
        // when it is not purely additive — a new member line appended to a client
        // object / inline object type is minor-allowed, a removed or retyped member
        // is breaking. Re-exports and export-assignments have no `raw` and compare as
        // a single normalized line, so any change to one reads as non-additive.
        if (
          oldEntry.text !== newEntry.text &&
          !isAdditive(oldEntry.raw ?? oldEntry.text, newEntry.raw ?? newEntry.text)
        )
          add(name, 'declaration text changed');
    }
  }
  // Text TypeScript could not parse is never judged additive, so text the old report
  // did not hold is a change too (a dropped or changed one is caught above).
  for (const [name, newEntry] of newEntries) {
    if (newEntry.kind === 'unparsed' && !oldEntries.has(name))
      add(name, 'text TypeScript could not parse was added');
  }
  return findings;
}

function classify(reportName, oldEntries, newEntries) {
  // A module with `export as namespace` is also a global namespace for scripts, whose
  // members they can assign.
  const block = oldEntries.has('export as namespace') ? 'umd-module' : 'module';
  return classifyEntries(`${reportName} :: `, oldEntries, newEntries, block);
}

// The core gate over one release version: classify every committed report against its
// own published baseline and collect the reasons a report's surface change exceeds the
// bump. Factored out of the CLI so the two entry points that need it — the post-tag gate
// (`main` below, called from release-npm.yml) and the pre-merge label check
// (release-label-check.mjs, which runs it against the version release-please would
// publish) — share one classification/baseline implementation rather than duplicating
// it. The I/O seams are injectable through `deps` (mode, tag list, npm lookup, the two
// report readers, and the log sink), defaulting to the production seams, so the whole
// gate is unit-testable without git or the network. Returns the list of failing reasons,
// empty when the release is honest; a tooling error (bad config, a missing report, an
// unclassifiable export) throws GateError.
function runGate(version, deps = {}) {
  const {
    mode = readMode(),
    tags = gitTags(),
    publishedVersionsFor = npmPublishedVersions,
    readReportAtRef = reportAtRef,
    readReportAtWorktree = reportAtWorktree,
    log = console.log,
  } = deps;

  // Baselines are per package, so each report is classified and judged against its
  // own baseline; the gate fails if ANY report fails. npm is queried once per package.
  const publishedCache = new Map();
  const publishedFor = (packageName) => {
    if (!publishedCache.has(packageName))
      publishedCache.set(packageName, publishedVersionsFor(packageName));
    return publishedCache.get(packageName);
  };

  const failReasons = [];
  for (const { dir, name } of REPORTS) {
    const packageName = packageNameForReport(dir);
    const publishedVersions = publishedFor(packageName);
    const baselineTag = previousPublishedTag(version, tags, publishedVersions);
    if (baselineTag === null) {
      log(`api-gate: ${name}: first publish, no published prior version to diff — passes`);
      continue;
    }
    const skipped = skippedUnpublishedTags(baselineTag, version, tags, publishedVersions);
    if (skipped.length)
      log(
        `api-gate: ${name}: skipping unpublished tag(s) ${skipped.join(', ')} — not on npm for ${packageName}`,
      );

    const oldVersion = baselineTag.replace(/^v/, '');
    const bump = bumpClass(oldVersion, version);
    const header = `api-gate: ${name}: ${oldVersion} -> ${version} (${bump} bump, mode=${mode})`;

    const oldSource = readReportAtRef(baselineTag, dir, name);
    const newSource = readReportAtWorktree(dir, name);
    if (newSource === null) fail(`committed report ${dir}/${name} is missing at the release`);
    // report absent at the baseline tag — additive, nothing to diff.
    const reportFindings =
      oldSource === null
        ? []
        : classify(name, parseReport(name, oldSource), parseReport(name, newSource));

    const { passes, reason } = gatePasses(mode, oldVersion, version, reportFindings.length > 0);
    if (reportFindings.length === 0) {
      log(`${header}: ${reason} — gate passes.`);
      continue;
    }
    log(`${header}: ${reportFindings.length} breaking surface item(s):`);
    for (const line of reportFindings) log(`  - ${line}`);
    if (passes) {
      log(`${header}: ${reason} — gate passes.`);
    } else {
      log(`${header}: ${reason} — gate FAILS.`);
      failReasons.push(`${name} ${reason} (${reportFindings.join('; ')})`);
    }
  }
  return failReasons;
}

function main() {
  const versionArg = process.argv.indexOf('--version');
  if (versionArg === -1 || !process.argv[versionArg + 1]) fail('missing --version <X.Y.Z>');
  const version = process.argv[versionArg + 1];
  const failReasons = runGate(version);
  if (failReasons.length) fail(`api-gate ${version}: ${failReasons.join(' | ')}`);
}

export {
  parseReport,
  classify,
  bumpClass,
  allowedBumps,
  gatePasses,
  previousPublishedTag,
  runGate,
  GateError,
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    if (err instanceof GateError) {
      console.error(`::error::${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
