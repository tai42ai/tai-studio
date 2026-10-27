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
// The surface diff itself lives in scripts/api-report-parse.mjs (reading a report into
// its declarations and exports) and scripts/api-surface-diff.mjs (listing the breaking
// changes between two of them), whose headers specify every rule they apply. Any
// tooling failure — unreadable config, an unknown mode, a missing report at the
// release, a git error that is not simply an absent path at the ref, a report the diff
// cannot classify — throws; the gate never passes a release on a classification it
// could not compute.
//
// Usage: node scripts/api-gate.mjs --version <X.Y.Z>

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseReport } from './api-report-parse.mjs';
import { classify } from './api-surface-diff.mjs';
import { GateError, fail } from './gate-error.mjs';

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
function reportAtRef(ref, dir, name, root = REPO_ROOT) {
  const path = `${dir}/${name}`;
  const ls = spawnSync('git', ['ls-tree', '--name-only', ref, '--', path], {
    cwd: root,
    encoding: 'utf8',
  });
  if (ls.error) fail(`git ls-tree failed for ${ref}:${path}: ${ls.error.message}`);
  if (ls.status !== 0) fail(`git ls-tree failed for ${ref}:${path}: ${ls.stderr.trim()}`);
  if (ls.stdout.trim() === '') return null; // path absent at this ref — additive.
  // A report is read whole whatever its size (execFileSync's default buffer is 1 MiB).
  return execFileSync('git', ['show', `${ref}:${path}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: Infinity,
  });
}

function reportAtWorktree(dir, name) {
  try {
    return readFileSync(resolve(REPO_ROOT, dir, name), 'utf8');
  } catch {
    return null;
  }
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

export { bumpClass, allowedBumps, gatePasses, previousPublishedTag, reportAtRef, runGate };

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
