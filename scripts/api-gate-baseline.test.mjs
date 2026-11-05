// Unit tests for the api-gate's baselines: the committed report at a ref, read through git
// from a throwaway repository built in a temporary directory, and what each caller of the
// gate supplies as its old side (the release's newest published tag, the pull request's
// check that tag and its base).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { publishedBaseline, reportAtRef, runGate } from './api-gate.mjs';
import { check, loadPackages } from './release-label-check.mjs';

function git(root, ...args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

// A git command that writes a commit, under a throwaway identity.
function gitCommitting(root, ...args) {
  git(
    root,
    '-c',
    'user.name=test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    ...args,
  );
}

function commit(root, message) {
  git(root, 'add', '.');
  gitCommitting(root, 'commit', '-q', '-m', message);
}

const fence = (body) => '```ts\n' + body + '\n```\n';
const KEPT_ONLY = fence('export interface Kept {\n  a: number;\n}');
const WITH_SYMBOL = fence(
  'export interface Kept {\n  a: number;\n}\nexport const dropped: string;',
);

// A repository with `etc/<name>` committed and tagged `v1.0.0`.
function taggedRepo(name, text) {
  const root = mkdtempSync(join(tmpdir(), 'api-gate-baseline-'));
  mkdirSync(join(root, 'etc'));
  writeFileSync(join(root, 'etc', name), text);
  git(root, 'init', '-q');
  commit(root, 'report');
  git(root, 'tag', 'v1.0.0');
  return root;
}

test('a report larger than one MiB at the tag is read whole', (t) => {
  const text = '```ts\n' + 'export type T = string;\n'.repeat(100_000) + '```\n';
  assert.ok(text.length > 2 * 1024 * 1024);
  const root = taggedRepo('big.api.md', text);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(reportAtRef('v1.0.0', 'etc', 'big.api.md', root), text);
});

test('a report absent at the tag reads as null', (t) => {
  const root = taggedRepo('present.api.md', 'x\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(reportAtRef('v1.0.0', 'etc', 'absent.api.md', root), null);
});

test('on a merge checkout the moved base holds the unreleased break, so it does not count', (t) => {
  const root = taggedRepo('surface.api.md', WITH_SYMBOL);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // The topic branch leaves the tag and changes no report; the base then drops a symbol.
  git(root, 'branch', '-M', 'base');
  git(root, 'checkout', '-q', '-b', 'topic');
  writeFileSync(join(root, 'unrelated.txt'), 'x\n');
  commit(root, 'unrelated');
  git(root, 'checkout', '-q', 'base');
  writeFileSync(join(root, 'etc', 'surface.api.md'), KEPT_ONLY);
  commit(root, 'unreleased break');
  gitCommitting(root, 'merge', '-q', '--no-ff', '-m', 'merge', 'topic');

  const deps = {
    mode: 'label-honesty',
    tags: ['v1.0.0'],
    publishedVersionsFor: () => ['1.0.0'],
    readReportAtRef: (ref) => reportAtRef(ref, 'etc', 'surface.api.md', root),
    readReportAtWorktree: () => readFileSync(join(root, 'etc', 'surface.api.md'), 'utf8'),
    log: () => {
      // These assertions read the outcome, not the gate's per-report output.
    },
  };
  const packages = loadPackages({ packages: { '.': {} } });
  assert.doesNotThrow(() => check('fix: a fix', '', packages, { '.': '1.0.0' }, deps));
});

test('the release gate diffs each report against its newest published tag', () => {
  const reads = [];
  const lines = [];
  const log = (line) => lines.push(line);
  const baselineFor = publishedBaseline('18.3.0', {
    tags: ['v18.2.0', 'v18.2.1'],
    publishedVersionsFor: () => ['18.2.0'],
    readReportAtRef: (ref) => {
      reads.push(ref);
      return WITH_SYMBOL;
    },
    log,
  });
  const failReasons = runGate('18.3.0', baselineFor, {
    mode: 'label-honesty',
    readReportAtWorktree: () => KEPT_ONLY,
    log,
  });
  assert.deepEqual([...new Set(reads)], ['v18.2.0']);
  assert.ok(lines.some((line) => line.includes('skipping unpublished tag(s) v18.2.1')));
  assert.ok(lines.some((line) => line.includes('18.2.0 -> 18.3.0 (minor bump')));
  assert.ok(failReasons.length > 0);
  assert.match(failReasons[0], /is a minor bump but carries breaking surface changes/);
});

test('a first publish has no baseline to diff and passes', () => {
  const lines = [];
  const log = (line) => lines.push(line);
  const baselineFor = publishedBaseline('1.0.0', {
    tags: [],
    publishedVersionsFor: () => [],
    readReportAtRef: () => assert.fail('a first publish reads no old report'),
    log,
  });
  const failReasons = runGate('1.0.0', baselineFor, {
    mode: 'label-honesty',
    readReportAtWorktree: () => assert.fail('a first publish reads no new report'),
    log,
  });
  assert.deepEqual(failReasons, []);
  assert.ok(lines.some((line) => line.includes('first publish, no published prior version')));
});
