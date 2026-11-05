#!/usr/bin/env node
// Refuse a pull request whose release label understates the public-API change it carries.
//
// release-please turns a merged pull request into a version bump, and the projection here
// follows its squash parsing exactly. The squash message is the pull request title (its
// header) followed by the body, with two body constructs honoured first: a
// `BEGIN_COMMIT_OVERRIDE` … `END_COMMIT_OVERRIDE` block replaces the ENTIRE message (title
// included) with its own trimmed text, and `BEGIN_NESTED_COMMIT` … `END_NESTED_COMMIT`
// blocks are lifted out as their own messages (each read as a single commit). The
// remaining message is split into chunks and each chunk's own header read. A new chunk
// begins ONLY at a blank line immediately followed by a whitelisted `type(scope)?: `
// header — the `!` breaking marker is NOT part of that split, so a `type!:` line in the
// body, or any line not preceded by a blank line, stays plain body text and starts no
// chunk. Within a chunk the bump is `feat` -> minor, `fix` -> patch, any other type -> no
// release, raised to a major by a `!` on that chunk's own header or a `BREAKING CHANGE:` /
// `BREAKING-CHANGE:` footer inside the chunk. The projected bump is the highest across all
// chunks. A `Release-As: X.Y.Z` footer overrides the computation and forces the release to
// X.Y.Z. Below 1.0.0 the two release-please pre-major flags redirect a breaking change to a
// minor and a feature to a patch; at or above 1.0.0 plain semver applies.
//
// This repository releases as ONE version: release-please declares a single root package
// (release-please-config.json), so every commit is attributed to it and the whole tree
// ships at one version — the same version release-npm.yml tags and the API-diff gate reads
// from `--version`. So the projection is the root package's next version, computed from its
// current manifest version and the squash-message rules above; there is no per-file package
// attribution to make.
//
// A surface item counts as breaking only when it is breaking both against the newest
// published version, so a consumer can see it, and between the base side of the checkout
// and the checkout, so this pull request made it, matched per finding: report, symbol and
// member. The SAME gate release-npm.yml runs on the tag (runGate from api-gate.mjs)
// classifies each side's committed api-extractor report against the checkout's and judges
// the items on both, a report gone from the checkout being one such item, with the
// manifest's current version as the old version and the
// projection as the new one; an item on one side alone is logged as not counted, with the
// side it lacks. A counted item under a bump the label could not honestly carry fails the
// check with the gate's own message, so the mislabel is caught before the tag rather than
// after it.
//
// The package list, its directories and the pre-major flags come from
// release-please-config.json; the current version from .release-please-manifest.json — org
// values live in the repo's own config, never here. The title and body are read from the
// PR_TITLE / PR_BODY environment variables (never interpolated into a shell). The npm
// reads that choose the published version are public (no token), so this runs unchanged on
// a fork.
//
// Usage, in a pull request's merge checkout: PR_TITLE=… PR_BODY=… node scripts/release-label-check.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { publishedBaseline, reportSides, runGate } from './api-gate.mjs';
import { GateError, fail } from './gate-error.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// release-label.yml checks out the pull request's merge commit, whose first parent is the
// base branch tip that commit was merged into.
const BASE_REF = 'HEAD^1';

// release-please starts a new bumping chunk only at a blank line immediately followed by a
// whitelisted `type(scope)?: ` header. The `!` breaking marker is NOT in this lookahead, so
// a `type!:` line never begins a chunk — it stays body text of the chunk it sits in. The
// whitelist is release-please's own set of conventional-commit types.
const CHUNK_SPLIT =
  /\r?\n\r?\n(?=(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\(.*?\))?: )/;
// A conventional header: `type(scope)!: summary`. The scope and the `!` marker are
// optional; only the type and a `!` on the header itself bear on the bump.
const HEADER = /^([a-zA-Z]+)(?:\(([^)]*)\))?(!)?:\s/;
// A `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer inside a chunk forces it to a major.
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;
// A `Release-As: <version>` footer forces the release to that exact version.
const RELEASE_AS = /^Release-As:\s*v?(\S+)/im;
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

// release-please config keys for the pre-1.0 bump rules; both default off, which makes a
// below-1.0 package follow plain semver (breaking -> major, feat -> minor).
const BUMP_MINOR_PRE_MAJOR = 'bump-minor-pre-major';
const BUMP_PATCH_FOR_MINOR_PRE_MAJOR = 'bump-patch-for-minor-pre-major';

// A release bump level, ordered so the highest across a message wins.
const Bump = Object.freeze({ NONE: 0, PATCH: 1, MINOR: 2, MAJOR: 3 });
const BUMP_NAME = Object.freeze({ 0: 'none', 1: 'patch', 2: 'minor', 3: 'major' });

// The bump a single conventional header line projects, or Bump.NONE when it is not one.
// `!` marks a breaking change (major); `feat` is a minor and `fix` a patch; every other
// type releases nothing on its own.
function headerBump(line) {
  const match = HEADER.exec(line);
  if (match === null) return Bump.NONE;
  if (match[3]) return Bump.MAJOR;
  const kind = match[1].toLowerCase();
  if (kind === 'feat') return Bump.MINOR;
  if (kind === 'fix') return Bump.PATCH;
  return Bump.NONE;
}

// The squash message release-please reads: the title, then the body a blank line below.
function squashMessage(title, body) {
  return body ? `${title}\n\n${body}` : title;
}

// The text of a `BEGIN_COMMIT_OVERRIDE` block in the body, or null when there is none.
// release-please lets a pull request body override the whole commit message: the text
// between the markers, trimmed, replaces the entire message (title included) when it is
// non-empty.
function applyOverride(body) {
  if (!body.includes('BEGIN_COMMIT_OVERRIDE')) return null;
  const override = body.split('BEGIN_COMMIT_OVERRIDE')[1].split('END_COMMIT_OVERRIDE')[0].trim();
  return override || null;
}

// Split a message into its chunks the way release-please does. `BEGIN_NESTED_COMMIT` /
// `END_NESTED_COMMIT` blocks are lifted out as their own messages (each parsed as a single
// commit, not re-split); the text outside them is chunk-split at every blank line followed
// by a whitelisted `type(scope)?: ` header.
function splitMessages(message) {
  const parts = message.split('BEGIN_NESTED_COMMIT');
  let base = parts[0];
  const nested = [];
  for (const part of parts.slice(1)) {
    const segments = part.split('END_NESTED_COMMIT');
    nested.push(segments[0]);
    base += segments.slice(1).join('END_NESTED_COMMIT');
  }
  const chunks = base.split(CHUNK_SPLIT).filter((chunk) => chunk);
  return [...chunks, ...nested];
}

// The bump one message chunk projects, from its own header and any footer it carries. The
// header is the chunk's first non-empty line; a `!` there is a major. Otherwise a
// `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer inside the chunk makes it a major; failing
// both, the header type alone decides (`feat` minor, `fix` patch).
function chunkBump(chunk) {
  const header = chunk.split('\n').find((line) => line.trim() !== '') ?? '';
  const bump = headerBump(header);
  if (bump === Bump.MAJOR) return bump;
  if (BREAKING_FOOTER.test(chunk)) return Bump.MAJOR;
  return bump;
}

// The bump release-please projects from a pull request's title and body: a
// `BEGIN_COMMIT_OVERRIDE` block replaces the whole message first, the result is split into
// chunks release-please's way, and the projection is the highest bump across every chunk.
function projectedBump(title, body) {
  const override = applyOverride(body);
  const message = override !== null ? override : squashMessage(title, body);
  let bump = Bump.NONE;
  for (const chunk of splitMessages(message)) bump = Math.max(bump, chunkBump(chunk));
  return bump;
}

// The version a `Release-As:` footer forces, or null when the pull request has none. Read
// from the effective message — a `BEGIN_COMMIT_OVERRIDE` block replaces it first, so a
// `Release-As:` inside the override wins and one outside a present override is gone.
function releaseAs(title, body) {
  const override = applyOverride(body);
  const message = override !== null ? override : squashMessage(title, body);
  const match = RELEASE_AS.exec(message);
  return match ? match[1] : null;
}

// The version release-please would publish from `current` for `bump`, or null for no
// release. Below 1.0.0 the two pre-major flags redirect a breaking change to a minor and a
// feature to a patch respectively; at or above 1.0.0 plain semver applies.
function projectVersion(current, bump, { bumpMinorPreMajor, bumpPatchForMinorPreMajor }) {
  if (bump === Bump.NONE) return null;
  const match = VERSION.exec(current);
  if (match === null) fail(`manifest version ${current} is not a bare major.minor.patch`);
  const [major, minor, patch] = match.slice(1, 4).map(Number);
  const preMajor = major === 0;
  if (bump === Bump.MAJOR) {
    if (preMajor && bumpMinorPreMajor) return `${major}.${minor + 1}.0`;
    return `${major + 1}.0.0`;
  }
  if (bump === Bump.MINOR) {
    if (preMajor && bumpPatchForMinorPreMajor) return `${major}.${minor}.${patch + 1}`;
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

// Each package directory's release-please config entry, with the two pre-major flags
// resolved from the global defaults and any per-package override.
function loadPackages(config) {
  const packages = config.packages;
  if (packages === undefined || packages === null || typeof packages !== 'object')
    fail('release-please-config.json declares no packages');
  const globalDefaults = {
    [BUMP_MINOR_PRE_MAJOR]: Boolean(config[BUMP_MINOR_PRE_MAJOR]),
    [BUMP_PATCH_FOR_MINOR_PRE_MAJOR]: Boolean(config[BUMP_PATCH_FOR_MINOR_PRE_MAJOR]),
  };
  const resolved = new Map();
  for (const [directory, entry] of Object.entries(packages))
    resolved.set(directory, { ...globalDefaults, ...entry });
  if (resolved.size === 0) fail('release-please-config.json declares no packages');
  return resolved;
}

// The version release-please would publish for one declared package: a Release-As footer
// forces it, else the projected bump lifts the package's current manifest version. Returns
// null when the projection is no release.
function packageReleaseVersion(entry, current, bump, forced) {
  if (forced !== null) return forced;
  return projectVersion(current, bump, {
    bumpMinorPreMajor: Boolean(entry[BUMP_MINOR_PRE_MAJOR]),
    bumpPatchForMinorPreMajor: Boolean(entry[BUMP_PATCH_FOR_MINOR_PRE_MAJOR]),
  });
}

// The releases the pull request would make across every declared package, each as its
// current and next version. One entry for this repo's single root package; the gate runs
// once per distinct pair.
function projectedReleases(title, body, packages, manifest) {
  const bump = projectedBump(title, body);
  const forced = releaseAs(title, body);
  const releases = new Map();
  for (const [directory, entry] of packages) {
    const current = manifest[directory];
    if (current === undefined)
      fail(`package ${directory} has no entry in the release-please manifest`);
    const next = packageReleaseVersion(entry, current, bump, forced);
    if (next !== null) releases.set(`${current} -> ${next}`, { current, next });
  }
  const label = forced !== null ? `forced to ${forced} by Release-As` : `${BUMP_NAME[bump]} bump`;
  return { releases: [...releases.values()], label };
}

// The findings on both sides, matched per finding (report, symbol and member), in the own
// change's words. Each finding on one side alone is logged with the side it lacks.
function countedFindings(published, own, log) {
  const publishedIdentities = new Set(published.map(({ identity }) => identity));
  const ownIdentities = new Set(own.map(({ identity }) => identity));
  for (const { identity, text } of own)
    if (!publishedIdentities.has(identity))
      log(`release-label-check: not counted, not breaking against the published version: ${text}`);
  for (const { identity, text } of published)
    if (!ownIdentities.has(identity))
      log(
        `release-label-check: not counted, not breaking in the pull request's own change: ${text}`,
      );
  return own.filter(({ identity }) => publishedIdentities.has(identity));
}

// The gate's baseline for a pull request: the two-sided rule over the published baseline
// and the base side of the checkout, judged from the manifest's current version. Its reports
// are those either side holds, so a report the pull request deleted still comes to judgment,
// and each side is matched by the report's identity, so a move on either side changes nothing.
// With no published version the published side holds nothing, so nothing counts.
function twoSidedBaseline(current, next, deps) {
  const { log = console.log } = deps;
  const published = publishedBaseline(next, deps);
  const { sides } = published;
  const { listedAt, textAt } = sides;
  return {
    sides,
    reports: () => [...published.reports(), ...listedAt(BASE_REF)],
    forReport: (report) => ({
      oldVersion: current,
      breakingFindings: (diffFrom) => {
        const publishedSide = published.forReport(report);
        return countedFindings(
          publishedSide === null ? [] : publishedSide.breakingFindings(diffFrom),
          diffFrom(textAt(BASE_REF, report)),
          log,
        );
      },
    }),
  };
}

// Gate every projected release against the public-API change the pull request carries;
// throw with the gate's own message when any is dishonest. Prints the projection and the
// gate's own per-report output. `deps` forwards the I/O seams (mode, tag list, npm lookup,
// the package name, the report readers and listers and the log sink) so a test can drive it
// without git or the network.
function check(title, body, packages, manifest, deps = {}) {
  const log = deps.log ?? console.log;
  const { releases, label } = projectedReleases(title, body, packages, manifest);
  if (releases.length === 0) {
    log(`release-label-check: ${label} projects no release — nothing to gate.`);
    return;
  }
  const sides = reportSides(deps);
  for (const { current, next } of releases) {
    log(`release-label-check: projects ${next} (${label})`);
    const failReasons = runGate(next, twoSidedBaseline(current, next, { ...deps, sides }), deps);
    if (failReasons.length)
      fail(
        `the pull request's release (${label}) cannot honestly carry this API change: ` +
          `${failReasons.join(' | ')}. Raise the release label to the bump the gate names above — a ` +
          "breaking public-API change needs a major (add '!' to the commit type or a 'BREAKING " +
          "CHANGE:' footer, or set 'Release-As: <next major>.0.0').",
      );
  }
  log(`release-label-check: ${label} is honest for the public-API change it carries.`);
}

function main() {
  const title = process.env.PR_TITLE;
  if (!title) fail('PR_TITLE is not set; cannot read the pull request release label');
  const body = process.env.PR_BODY ?? '';
  const config = JSON.parse(readFileSync(resolve(REPO_ROOT, 'release-please-config.json'), 'utf8'));
  const manifest = JSON.parse(
    readFileSync(resolve(REPO_ROOT, '.release-please-manifest.json'), 'utf8'),
  );
  check(title, body, loadPackages(config), manifest);
}

export {
  Bump,
  headerBump,
  projectedBump,
  releaseAs,
  projectVersion,
  loadPackages,
  projectedReleases,
  check,
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
