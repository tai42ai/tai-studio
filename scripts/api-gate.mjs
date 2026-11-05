#!/usr/bin/env node
// Release API-diff gate: fail a publish whose public-API change class exceeds the
// version bump the release-please label produced.
//
// It compares the committed api-extractor reports of every published package
// (packages/<package>/etc/*.api.md) at the version being released against a per-package baseline: the highest v* tag below
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
// changes between two of them), whose headers specify every rule they apply.
//
// What a ref holds is its committed packages/<package>/etc/*.api.md files; the gates read no list
// of reports. A report is its npm package name plus its report name, wherever its folder sits:
//
//   * held by the baseline and not the release, it is a removed entry point, a breaking change;
//   * moved to another folder under the same npm name, it is diffed where it now sits, so a
//     symbol dropped in the move is refused;
//   * kept in a package renamed in place, it counts as a removal under the published name, which
//     is what a consumer of that name sees.
//
// A report on the old side of a diff that no named package.json owns has no identity there, so it
// is logged and not judged.
//
// Any tooling failure — unreadable config, an unknown mode, a git error that is not simply an
// absent path at the ref, a report in the release no named package.json owns, two reports of one
// identity on a side, a report the diff cannot classify — throws; the gate never passes a release
// on a classification it could not compute.
//
// Usage: node scripts/api-gate.mjs --version <X.Y.Z>

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, posix, resolve } from 'node:path';

import { parseReport } from './api-report-parse.mjs';
import { classify, removedReport } from './api-surface-diff.mjs';
import { GateError, fail } from './gate-error.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Where any package's committed report sits, as read from a ref's tree.
const REPORT_PATH = /^packages\/[^/]+\/etc\/[^/]+\.api\.md$/;
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

// The `v<major.minor.patch>` tags strictly below `newVersion`, newest first. Non-semver tags,
// pre-releases among them, are ignored.
function tagsBelow(newVersion, tags) {
  const newKey = parseVersion(newVersion);
  return tags
    .map((tag) => ({ tag: tag.trim(), version: tag.trim().replace(/^v/, '') }))
    .filter(({ version }) => /^\d+\.\d+\.\d+$/.test(version))
    .map(({ tag, version }) => ({ tag, key: parseVersion(version) }))
    .filter(({ key }) => versionBelow(key, newKey))
    .sort((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1] || b.key[2] - a.key[2])
    .map(({ tag }) => tag);
}

// The baseline tag for a report: the highest `v<major.minor.patch>` tag strictly
// below `newVersion` whose version is PUBLISHED on npm for that report's package,
// or null when no published version sits below the release. A tag whose publish was
// refused still exists in git, so it must NOT seed the next release's baseline —
// the breaking items it carried would vanish from the diff. Pure over the tag list
// and the published-version list so the whole selection is unit-testable without git
// or npm; published versions at or above the target never qualify.
function previousPublishedTag(newVersion, tags, publishedVersions) {
  const published = new Set(publishedVersions);
  const publishedTags = tags.filter((tag) => published.has(tag.trim().replace(/^v/, '')));
  return tagsBelow(newVersion, publishedTags)[0] ?? null;
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

// The npm package name that owns a report, read from the package.json one level above the
// report's directory at the ref holding it, or null when no named package.json is there.
function packageNameForReport({ dir, ref }, root = REPO_ROOT) {
  const text = fileAtRef(ref, `${posix.dirname(dir)}/package.json`, root);
  return text === null ? null : (JSON.parse(text).name ?? null);
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

// The paths `git ls-tree` prints for a path at a ref, every git failure surfacing loudly.
function lsTree(ref, path, root, flags = []) {
  const ls = spawnSync('git', ['ls-tree', ...flags, '--name-only', ref, '--', path], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: Infinity,
  });
  if (ls.error) fail(`git ls-tree failed for ${ref}:${path}: ${ls.error.message}`);
  if (ls.status !== 0) fail(`git ls-tree failed for ${ref}:${path}: ${ls.stderr.trim()}`);
  return ls.stdout;
}

// A committed file at a git ref, or null when it does not exist there. The path's
// absence at the ref is an expected answer and maps to null; any OTHER git failure (an
// invalid ref, not a repository) surfaces loudly rather than being silently read as
// absent. `git ls-tree` distinguishes the two: a valid ref with an absent path exits 0
// with empty output, while a bad ref exits non-zero.
function fileAtRef(ref, path, root = REPO_ROOT) {
  if (lsTree(ref, path, root).trim() === '') return null;
  // A file is read whole whatever its size (execFileSync's default buffer is 1 MiB).
  return execFileSync('git', ['show', `${ref}:${path}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: Infinity,
  });
}

// The committed report at a git ref, or null when the ref does not hold it: a report added
// since, which breaks nothing.
function reportAtRef(ref, dir, name, root = REPO_ROOT) {
  return fileAtRef(ref, `${dir}/${name}`, root);
}

// Every report committed at a git ref, each carrying that ref. A ref holding none lists
// nothing; a git failure surfaces loudly.
function reportsAtRef(ref, root = REPO_ROOT) {
  return lsTree(ref, 'packages', root, ['-r', '-z'])
    .split('\0')
    .filter((path) => REPORT_PATH.test(path))
    .map((path) => ({ dir: posix.dirname(path), name: posix.basename(path), ref }));
}

// The report in the release's tree, or null when it is not there. Only an absent file
// reads as null; any other read failure surfaces.
function reportAtWorktree(dir, name, root = REPO_ROOT) {
  try {
    return readFileSync(resolve(root, dir, name), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// What each side holds, matched by a report's identity: its npm package name plus its report
// name. `listedAt` is a ref's listing, each ref listed once; `heldAt` is that listing by identity,
// refusing two paths of one identity. HEAD's texts come from the checkout. A report no named
// package.json owns has a null package name and so no identity to collide on: reportsToJudge and
// publishedBaseline's `forReport` decide what becomes of it.
function reportSides(deps) {
  const {
    readReportAtRef = reportAtRef,
    readReportAtWorktree = reportAtWorktree,
    listReportsAtRef = reportsAtRef,
    packageNameFor = packageNameForReport,
  } = deps;
  const identityOf = (report) => JSON.stringify([packageNameFor(report), report.name]);
  const listings = new Map();
  const listedAt = (ref) => {
    if (!listings.has(ref)) listings.set(ref, listReportsAtRef(ref));
    return listings.get(ref);
  };
  const sides = new Map();
  const heldAt = (ref) => {
    if (!sides.has(ref)) {
      const held = new Map();
      for (const report of listedAt(ref)) {
        const identity = identityOf(report);
        const holder = held.get(identity);
        if (holder && packageNameFor(report) !== null)
          fail(
            `${holder.dir}/${holder.name} and ${report.dir}/${report.name} at ${ref} are one ` +
              `report of ${packageNameFor(report)}; only one can hold it`,
          );
        held.set(identity, report);
      }
      sides.set(ref, held);
    }
    return sides.get(ref);
  };
  const textAt = (ref, report) => {
    const held = heldAt(ref).get(identityOf(report));
    if (!held) return null;
    return ref === 'HEAD'
      ? readReportAtWorktree(held.dir, held.name)
      : readReportAtRef(ref, held.dir, held.name);
  };
  return { packageNameFor, identityOf, listedAt, heldAt, textAt };
}

// The release's baseline. `reports()` lists what the baseline tag of each package holds, the
// packages being those named by the tags below `version`, walked newest first down to the first
// tag that is itself a baseline. Tags that were never published are walked past, so whatever they
// lost is judged on the release that lost it and on every later tag until one is published; a
// package a published major dropped stays dropped, the walk stopping at that major. A report no
// named package.json owns names no package. `forReport(report)` answers for one report: the newest tag below
// `version` that is PUBLISHED on npm for the report's package, or null on a first publish, logging
// what it decides. npm is queried once per package. `sides` is the run's one owner of what each
// ref holds, and `deps` carries the I/O seams (tag list, npm lookup, the log sink and
// reportSides' seams, or the `sides` already built from them), defaulting to production.
function publishedBaseline(version, deps = {}) {
  const {
    tags = gitTags(),
    publishedVersionsFor = npmPublishedVersions,
    log = console.log,
    sides = reportSides(deps),
  } = deps;
  const { packageNameFor, listedAt, textAt } = sides;

  const publishedCache = new Map();
  const publishedVersionsOf = (packageName) => {
    if (!publishedCache.has(packageName))
      publishedCache.set(packageName, publishedVersionsFor(packageName));
    return publishedCache.get(packageName);
  };
  const publishedFor = (report) => {
    const packageName = packageNameFor(report);
    if (packageName === null) fail(`no named package.json owns the report directory ${report.dir}`);
    return { packageName, publishedVersions: publishedVersionsOf(packageName) };
  };

  const baselineTagsOfPackagesAt = (tag) => {
    const packageNames = new Set(listedAt(tag).map((report) => packageNameFor(report)));
    packageNames.delete(null);
    const baselineTags = [...packageNames]
      .map((name) => previousPublishedTag(version, tags, publishedVersionsOf(name)))
      .filter((baselineTag) => baselineTag !== null);
    return [...new Set(baselineTags)];
  };

  return {
    sides,
    reports: () => {
      const baselineTags = new Set();
      for (const tag of tagsBelow(version, tags)) {
        for (const baselineTag of baselineTagsOfPackagesAt(tag)) baselineTags.add(baselineTag);
        if (baselineTags.has(tag)) break;
      }
      return [...baselineTags].flatMap((baselineTag) => listedAt(baselineTag));
    },
    forReport: (report) => {
      const { name } = report;
      const { packageName, publishedVersions } = publishedFor(report);
      const baselineTag = previousPublishedTag(version, tags, publishedVersions);
      if (baselineTag === null) {
        log(
          `api-gate: ${name}: first publish, no published prior version of ${packageName} to diff — passes`,
        );
        return null;
      }
      const skipped = skippedUnpublishedTags(baselineTag, version, tags, publishedVersions);
      if (skipped.length)
        log(
          `api-gate: ${name}: skipping unpublished tag(s) ${skipped.join(', ')} — not on npm for ${packageName}`,
        );
      return {
        oldVersion: baselineTag.replace(/^v/, ''),
        breakingFindings: (diffFrom) => diffFrom(textAt(baselineTag, report)),
      };
    },
  };
}

// The reports a gate judges, each identity once: what the release holds, then what only the
// baseline holds. A baseline report no named package.json owns has no identity on that side, so
// it cannot be a removal: it is logged and left out. One the release holds comes to judgment,
// which refuses it.
function reportsToJudge(baseline, { identityOf, heldAt, packageNameFor }, log) {
  const reports = new Map(heldAt('HEAD'));
  for (const report of baseline.reports()) {
    const identity = identityOf(report);
    if (reports.has(identity)) continue;
    if (packageNameFor(report) === null) {
      log(
        `api-gate: not judged, no named package.json owns ${report.dir}/${report.name} at ${report.ref}`,
      );
      continue;
    }
    reports.set(identity, report);
  }
  return [...reports.values()];
}

// The breaking findings between a report's old text and new text, either of them null when
// the report is absent on that side. Absent on the old side breaks nothing; absent on the
// new side alone is a removed entry point of its package.
function findingsBetween(name, packageName, oldSource, newSource) {
  if (oldSource === null) return [];
  if (newSource === null) return [removedReport(name, packageName)];
  return classify(name, parseReport(name, oldSource), parseReport(name, newSource));
}

// The core gate over one new version: classify every report against the baseline its
// caller supplies and collect the reasons a report's surface change exceeds the bump.
// `baseline.reports()` lists every report the baseline holds, and `baseline.forReport(report)`
// returns the report's `{ oldVersion, breakingFindings }`, or null when the report has nothing to
// diff against and passes. `breakingFindings(diffFrom)` returns the findings to judge, where
// `diffFrom(oldSource)` lists findingsBetween an old report's text and the new report.
// Its two callers each answer for their own baseline: the post-tag gate (`main` below,
// called from release-npm.yml) passes publishedBaseline, and the pre-merge label check
// (release-label-check.mjs) passes its two-sided rule over it. `baseline.sides` is the run's one
// reportSides. The remaining I/O seams are injectable through `deps` (mode and the log sink),
// defaulting to production, so the whole gate is unit-testable without git or the network.
// Returns the list of failing reasons, empty when the bump is honest; a tooling error (bad
// config, an unclassifiable export) throws GateError.
function runGate(version, baseline, deps = {}) {
  const { mode = readMode(), log = console.log } = deps;
  const { sides } = baseline;

  const failReasons = [];
  for (const report of reportsToJudge(baseline, sides, log)) {
    const { name } = report;
    const judged = baseline.forReport(report);
    if (judged === null) continue;

    const { oldVersion, breakingFindings } = judged;
    const bump = bumpClass(oldVersion, version);
    const header = `api-gate: ${name}: ${oldVersion} -> ${version} (${bump} bump, mode=${mode})`;

    const newSource = sides.textAt('HEAD', report);
    const reportFindings = breakingFindings((oldSource) =>
      findingsBetween(name, sides.packageNameFor(report), oldSource, newSource),
    );

    const { passes, reason } = gatePasses(mode, oldVersion, version, reportFindings.length > 0);
    if (reportFindings.length === 0) {
      log(`${header}: ${reason} — gate passes.`);
      continue;
    }
    log(`${header}: ${reportFindings.length} breaking surface item(s):`);
    for (const { text } of reportFindings) log(`  - ${text}`);
    if (passes) {
      log(`${header}: ${reason} — gate passes.`);
    } else {
      log(`${header}: ${reason} — gate FAILS.`);
      failReasons.push(`${name} ${reason} (${reportFindings.map(({ text }) => text).join('; ')})`);
    }
  }
  return failReasons;
}

function main() {
  const versionArg = process.argv.indexOf('--version');
  if (versionArg === -1 || !process.argv[versionArg + 1]) fail('missing --version <X.Y.Z>');
  const version = process.argv[versionArg + 1];
  const failReasons = runGate(version, publishedBaseline(version));
  if (failReasons.length) fail(`api-gate ${version}: ${failReasons.join(' | ')}`);
}

export {
  bumpClass,
  allowedBumps,
  gatePasses,
  previousPublishedTag,
  packageNameForReport,
  publishedBaseline,
  reportAtRef,
  reportAtWorktree,
  reportsAtRef,
  reportSides,
  runGate,
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
