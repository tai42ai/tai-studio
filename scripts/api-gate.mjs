#!/usr/bin/env node
// Release API-diff gate: fail a publish whose public-API change class exceeds the
// version bump the release-please label produced.
//
// It compares the committed api-extractor reports of every published package
// (packages/studio-sdk/etc/*.api.md and packages/api-client/etc/*.api.md) at the
// version being released against the previous released tag, classifies the
// surface change as breaking or not, and reads the single mode switch in
// .github/api-gate.yml:
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
//
// Breaking classes: a removed symbol, a removed or changed interface/class
// member (named or an index/call/construct signature), a member turned from
// optional to required, a new REQUIRED member, a removed/changed function or method
// overload, a removed/changed enum member, a removed/changed namespace member, and
// a non-widening change to a type alias. Non-breaking changes — a new export, a new
// optional member, a member turned from required to optional, an added overload, an
// added enum member, a string-literal union widened with more members. Any tooling
// failure —
// unreadable config, an unknown mode, an unparseable report, a git error that is
// not simply an absent path at the ref — throws; the gate never passes a release on
// a classification it could not compute.
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

function previousTag(newVersion) {
  const out = execFileSync('git', ['tag', '--list', 'v*'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const newKey = parseVersion(newVersion);
  const below = (a, b) =>
    a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
  let best = null;
  for (const tag of out.split('\n')) {
    const version = tag.trim().replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    const key = parseVersion(version);
    if (below(key, newKey) && (best === null || below(best.key, key)))
      best = { key, tag: tag.trim() };
  }
  return best ? best.tag : null;
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

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

// A stable key for an interface/class member. Named members key by their name;
// the unnamed structural signatures (index/call/construct) key by a synthesized
// constant so their removal or change is compared rather than skipped.
function memberKey(member, sf) {
  if (member.name) return member.name.getText(sf);
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
  if (!q) return normalize(text);
  const base = member.getStart(sf);
  return normalize(text.slice(0, q.getStart(sf) - base) + text.slice(q.getEnd() - base));
}

// Members keyed by name (or synthesized signature key) -> { optional, signatures }.
// signatures is a Set of optionality-normalized declaration texts so overloaded
// methods keep every overload (like a top-level function); a member is optional
// only when every declaration of it is optional.
function collectMembers(node, sf) {
  const map = new Map();
  for (const member of node.members) {
    const key = memberKey(member, sf);
    if (key === null) continue;
    const optional = Boolean(member.questionToken);
    const entry = map.get(key) ?? { optional, signatures: new Set() };
    entry.optional = entry.optional && optional;
    entry.signatures.add(memberSignature(member, sf));
    map.set(key, entry);
  }
  return map;
}

function enumMembers(node, sf) {
  const map = new Map();
  for (const member of node.members)
    map.set(member.name.getText(sf), normalize(member.getText(sf)));
  return map;
}

// A Set of the normalized members of a union type whose members are ALL literal
// types (string/number/boolean/null literals), else null. Only such a union can be
// classified structurally for additive widening; anything else is compared by text.
function literalUnionSet(typeNode, sf) {
  if (!typeNode || !ts.isUnionTypeNode(typeNode)) return null;
  const set = new Set();
  for (const member of typeNode.types) {
    if (!ts.isLiteralTypeNode(member)) return null;
    set.add(normalize(member.getText(sf)));
  }
  return set;
}

function namespaceEntry(node, sf) {
  const body = node.body;
  const statements = body && ts.isModuleBlock(body) ? body.statements : [];
  return { kind: 'namespace', entries: collectEntries(statements, sf) };
}

// Parse a list of declarations into a map of symbol name -> entry, exported or not
// (every declaration in an api-extractor report is reachable from the public
// surface, so a non-exported one is part of the contract). Each entry carries its
// kind plus, for the shapes semver cares about, the structure that classification
// compares; a namespace recurses into its own members. Name-keying is safe for
// distinct symbols — api-extractor suffixes `_2` to disambiguate their collision —
// but it does not model TypeScript declaration merging: a merged companion (e.g. a
// namespace sharing a name with a function or interface) would overwrite its
// partner in the map. No current surface uses merging.
function collectEntries(statements, sf) {
  const entries = new Map();
  for (const node of statements) {
    if (ts.isInterfaceDeclaration(node)) {
      entries.set(node.name.text, { kind: 'interface', members: collectMembers(node, sf) });
    } else if (ts.isClassDeclaration(node) && node.name) {
      entries.set(node.name.text, { kind: 'class', members: collectMembers(node, sf) });
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      const key = node.name.text;
      const entry = entries.get(key) ?? { kind: 'function', signatures: new Set() };
      entry.signatures.add(normalize(node.getText(sf)));
      entries.set(key, entry);
    } else if (ts.isTypeAliasDeclaration(node)) {
      entries.set(node.name.text, {
        kind: 'type',
        text: normalize(node.getText(sf)),
        literals: literalUnionSet(node.type, sf),
      });
    } else if (ts.isEnumDeclaration(node)) {
      entries.set(node.name.text, { kind: 'enum', members: enumMembers(node, sf) });
    } else if (ts.isModuleDeclaration(node)) {
      entries.set(node.name.getText(sf), namespaceEntry(node, sf));
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        entries.set(decl.name.getText(sf), { kind: 'variable', text: normalize(decl.getText(sf)) });
      }
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

// Removal or change of a member is breaking; a member turned required (optional ->
// required) is breaking; a NEW required member is breaking. Added optional members
// and added overloads are non-breaking, and a member turned OPTIONAL (required ->
// optional) is non-breaking — loosening a requirement never breaks a consumer, and
// the optionality-normalized signatures compare equal across the flip.
// Documented-conservative: adding `readonly` to a member reads as a signature
// change and stays breaking (it genuinely breaks writers).
function classifyMembers(add, symbol, oldMembers, newMembers) {
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
    for (const sig of oldMember.signatures) {
      if (!newMember.signatures.has(sig)) {
        add(symbol, `member "${key}" signature removed or changed`);
        break;
      }
    }
  }
  for (const [key, newMember] of newMembers) {
    if (!oldMembers.has(key) && !newMember.optional) {
      add(symbol, `new required member "${key}" was added`);
    }
  }
}

// Type aliases: a string-literal union widened with additional members (old set is
// a subset of new) is non-breaking; a removed/changed member is breaking.
// Documented-conservative: any change to a NON-literal-union alias text is breaking
// — a widening that only adds members is not detected structurally here.
function classifyType(add, symbol, oldEntry, newEntry) {
  if (oldEntry.literals && newEntry.literals) {
    for (const lit of oldEntry.literals) {
      if (!newEntry.literals.has(lit)) {
        add(symbol, 'a union member was removed or changed');
        break;
      }
    }
    return;
  }
  if (oldEntry.text !== newEntry.text) add(symbol, 'type alias declaration changed');
}

// Breaking classification for one entries map, old -> new. `scope` prefixes every
// finding; it recurses into namespaces with the nested scope.
function classifyEntries(scope, oldEntries, newEntries) {
  const findings = [];
  const add = (symbol, detail) => findings.push(`${scope}${symbol}: ${detail}`);

  for (const [name, oldEntry] of oldEntries) {
    const newEntry = newEntries.get(name);
    if (!newEntry) {
      add(name, 'symbol was removed');
      continue;
    }
    if (newEntry.kind !== oldEntry.kind) {
      add(name, `kind changed (${oldEntry.kind} -> ${newEntry.kind})`);
      continue;
    }
    switch (oldEntry.kind) {
      case 'interface':
      case 'class':
        classifyMembers(add, name, oldEntry.members, newEntry.members);
        break;
      case 'function':
        for (const sig of oldEntry.signatures) {
          if (!newEntry.signatures.has(sig)) {
            add(name, 'a function overload was removed or changed');
            break;
          }
        }
        break;
      case 'enum':
        for (const [member, text] of oldEntry.members) {
          const newText = newEntry.members.get(member);
          if (newText === undefined) add(name, `enum member "${member}" was removed`);
          else if (newText !== text) add(name, `enum member "${member}" changed`);
        }
        break;
      case 'namespace':
        findings.push(...classifyEntries(`${scope}${name}.`, oldEntry.entries, newEntry.entries));
        break;
      case 'type':
        classifyType(add, name, oldEntry, newEntry);
        break;
      default:
        if (oldEntry.text !== newEntry.text) add(name, 'declaration text changed');
    }
  }
  return findings;
}

function classify(reportName, oldEntries, newEntries) {
  return classifyEntries(`${reportName} :: `, oldEntries, newEntries);
}

function main() {
  const versionArg = process.argv.indexOf('--version');
  if (versionArg === -1 || !process.argv[versionArg + 1]) fail('missing --version <X.Y.Z>');
  const version = process.argv[versionArg + 1];
  const mode = readMode();

  const previous = previousTag(version);
  if (previous === null) {
    console.log(`api-gate: first release, no prior tag to diff — gate passes.`);
    return;
  }
  const oldVersion = previous.replace(/^v/, '');
  const bump = bumpClass(oldVersion, version);
  const header = `api-gate: ${oldVersion} -> ${version} (${bump} bump, mode=${mode})`;

  const findings = [];
  for (const { dir, name } of REPORTS) {
    const oldSource = reportAtRef(previous, dir, name);
    const newSource = reportAtWorktree(dir, name);
    if (newSource === null) fail(`committed report ${dir}/${name} is missing at the release`);
    if (oldSource === null) continue; // report is new at this tag — additive.
    findings.push(...classify(name, parseReport(name, oldSource), parseReport(name, newSource)));
  }

  const { passes, reason } = gatePasses(mode, oldVersion, version, findings.length > 0);
  if (findings.length === 0) {
    console.log(`${header}: ${reason} — gate passes.`);
    return;
  }
  console.log(`${header}: ${findings.length} breaking surface item(s):`);
  for (const line of findings) console.log(`  - ${line}`);
  if (passes) {
    console.log(`${header}: ${reason} — gate passes.`);
    return;
  }
  fail(`api-gate ${version} ${reason}. Offending items: ${findings.join('; ')}`);
}

export { parseReport, classify, bumpClass, allowedBumps, gatePasses, previousTag, GateError };

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
