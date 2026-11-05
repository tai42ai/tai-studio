// Unit tests for what one side of the gate holds: which reports have an identity there, what two
// holders of one identity do, how often a ref is listed in a run, and how a release's report is
// read. Each runs against a throwaway git repository.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { reportAtWorktree, reportsAtRef } from './api-gate.mjs';
import {
  KEPT_ONLY,
  WITH_SYMBOL,
  commit,
  gateOverReports,
  git,
  gitBackedDeps,
  manifestOf,
  mergeCheckoutRemoving,
  writeFile,
} from './api-gate-git-fixtures.mjs';
import { GateError } from './gate-error.mjs';
import { check, loadPackages } from './release-label-check.mjs';

const STRAY = 'packages/features/etc/x.api.md';
const STRAY_MANIFEST = 'packages/features/package.json';

const addStray = (root) => {
  writeFile(root, STRAY, KEPT_ONLY);
  commit(root, 'report with no package');
};
const removeStray = (root) => rmSync(join(root, STRAY));
const nameStray = (root) => writeFile(root, STRAY_MANIFEST, manifestOf('@acme/features'));

const notJudged = (lines, ref) =>
  lines.some(
    (line) => line.includes('not judged') && line.includes(STRAY) && line.includes(`at ${ref}`),
  );

// ------------------------------------------------------- a report no named package owns

for (const { what, change } of [
  { what: 'removes it', change: removeStray },
  { what: 'names its package', change: nameStray },
]) {
  test(`a pull request that ${what} passes a base report no package owns, logged`, (t) => {
    const root = mergeCheckoutRemoving(change, {}, addStray);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const lines = [];
    const { labelCheck } = gateOverReports(root, { log: (line) => lines.push(line) });
    assert.doesNotThrow(() => labelCheck('fix: repair the report'));
    assert.ok(notJudged(lines, 'HEAD^1'));
  });
}

test('a report no package owns, added by the pull request, is refused by the label check', (t) => {
  const root = mergeCheckoutRemoving((checkout) => writeFile(checkout, STRAY, KEPT_ONLY));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { labelCheck } = gateOverReports(root);
  assert.throws(
    () => labelCheck('fix: add a report'),
    (err) =>
      err instanceof GateError &&
      err.message.includes('no named package.json owns the report directory packages/features/etc'),
  );
});

test('a report no package owns kept from base to head is refused for the head', (t) => {
  const root = mergeCheckoutRemoving(
    (checkout) => writeFile(checkout, 'topic.txt', 'x\n'),
    {},
    addStray,
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { labelCheck } = gateOverReports(root);
  assert.throws(
    () => labelCheck('fix: a fix'),
    (err) => err instanceof GateError && err.message.includes('no named package.json owns'),
  );
});

test('a published tag holding a report no package owns does not refuse its removal', (t) => {
  const root = mergeCheckoutRemoving(removeStray, { [STRAY]: KEPT_ONLY });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lines = [];
  const { tagGate, labelCheck } = gateOverReports(root, { log: (line) => lines.push(line) });
  assert.deepEqual(tagGate('1.0.1'), []);
  assert.ok(notJudged(lines, 'v1.0.0'));
  assert.doesNotThrow(() => labelCheck('fix: remove the report'));
});

test('two base reports no package owns under one name are each logged, not a collision', (t) => {
  const other = 'packages/other/etc/x.api.md';
  const addStrays = (root) => {
    writeFile(root, STRAY, KEPT_ONLY);
    writeFile(root, other, KEPT_ONLY);
    commit(root, 'reports with no package');
  };
  const root = mergeCheckoutRemoving(
    (checkout) => {
      rmSync(join(checkout, STRAY));
      rmSync(join(checkout, other));
    },
    {},
    addStrays,
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lines = [];
  const { labelCheck } = gateOverReports(root, { log: (line) => lines.push(line) });
  assert.doesNotThrow(() => labelCheck('fix: remove the reports'));
  assert.ok(lines.some((line) => line.includes('not judged') && line.includes(STRAY)));
  assert.ok(lines.some((line) => line.includes('not judged') && line.includes(other)));
});

// ---------------------------------------------------- two reports holding one identity

const KEPT = 'packages/extra/etc/extra.api.md';
const COPY = 'packages/zz-copy/etc/extra.api.md';
const addCopy = (root) => {
  writeFile(root, COPY, KEPT_ONLY);
  writeFile(root, 'packages/zz-copy/package.json', manifestOf('@acme/extra'));
};
const namesBothPaths = (err) =>
  err instanceof GateError && err.message.includes(KEPT) && err.message.includes(COPY);

test('two paths of one identity on the release fail both gates, naming both', (t) => {
  const root = mergeCheckoutRemoving(addCopy);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate, labelCheck } = gateOverReports(root);
  assert.throws(() => tagGate('1.0.1'), namesBothPaths);
  assert.throws(() => labelCheck('fix: a fix'), namesBothPaths);
});

test('a copy cannot mask a symbol dropped from the report it shares an identity with', (t) => {
  const root = mergeCheckoutRemoving(
    (checkout) => {
      addCopy(checkout);
      writeFile(checkout, COPY, WITH_SYMBOL);
    },
    { [KEPT]: WITH_SYMBOL },
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => gateOverReports(root).tagGate('1.0.1'), namesBothPaths);
});

test('two paths of one identity on the published tag fail, naming both', (t) => {
  const root = mergeCheckoutRemoving((checkout) => writeFile(checkout, 'topic.txt', 'x\n'), {
    [COPY]: KEPT_ONLY,
    'packages/zz-copy/package.json': manifestOf('@acme/extra'),
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => gateOverReports(root).tagGate('1.0.1'), namesBothPaths);
});

test('two paths of one identity on the base fail the label check, naming both', (t) => {
  const copyOnBase = (root) => {
    addCopy(root);
    commit(root, 'copy');
  };
  const root = mergeCheckoutRemoving(
    (checkout) => writeFile(checkout, 'topic.txt', 'x\n'),
    {},
    copyOnBase,
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => gateOverReports(root).labelCheck('fix: a fix'), namesBothPaths);
});

test('a refused tag holding two paths of one identity does not block the next release', (t) => {
  const root = mergeCheckoutRemoving(
    (checkout) => writeFile(checkout, 'topic.txt', 'x\n'),
    {},
    (base) => {
      addCopy(base);
      commit(base, 'copy');
      git(base, 'tag', 'v1.0.1');
      rmSync(join(base, 'packages/zz-copy'), { recursive: true });
      commit(base, 'copy removed');
    },
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate } = gateOverReports(root, {
    tags: ['v1.0.0', 'v1.0.1'],
    publishedVersionsFor: () => ['1.0.0'],
  });
  assert.deepEqual(tagGate('1.0.2'), []);
});

// ----------------------------------------------------------- one owner of a run's listings

const countingListings = (root) => {
  const listed = new Map();
  return {
    listed,
    listReportsAtRef: (ref) => {
      listed.set(ref, (listed.get(ref) ?? 0) + 1);
      return reportsAtRef(ref, root);
    },
  };
};

const assertListedOnce = (listed, refs) => {
  assert.deepEqual([...listed.keys()].sort(), [...refs].sort());
  for (const [ref, count] of listed) assert.equal(count, 1, ref);
};

test('one tag gate run lists each ref once', (t) => {
  const root = mergeCheckoutRemoving((checkout) => writeFile(checkout, 'topic.txt', 'x\n'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { listed, listReportsAtRef } = countingListings(root);
  gateOverReports(root, { listReportsAtRef }).tagGate('1.0.1');
  assertListedOnce(listed, ['v1.0.0', 'HEAD']);
});

test('one label check run lists each ref once', (t) => {
  const root = mergeCheckoutRemoving((checkout) => writeFile(checkout, 'topic.txt', 'x\n'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { listed, listReportsAtRef } = countingListings(root);
  gateOverReports(root, { listReportsAtRef }).labelCheck('fix: a fix');
  assertListedOnce(listed, ['v1.0.0', 'HEAD', 'HEAD^1']);
});

test('one label check run projecting two releases lists each ref once', (t) => {
  const root = mergeCheckoutRemoving((checkout) => writeFile(checkout, 'topic.txt', 'x\n'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { listed, listReportsAtRef } = countingListings(root);
  const packages = loadPackages({ packages: { '.': {}, 'packages/extra': {} } });
  const manifest = { '.': '1.0.0', 'packages/extra': '1.1.0' };
  const deps = { ...gitBackedDeps(root), listReportsAtRef };
  check('fix: a fix', '', packages, manifest, deps);
  assertListedOnce(listed, ['v1.0.0', 'HEAD', 'HEAD^1']);
});

// -------------------------------------------------------------- a report in the checkout

test('an absent report in the checkout reads as null', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'api-gate-worktree-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(reportAtWorktree('etc', 'absent.api.md', root), null);
});

test('any other read failure in the checkout surfaces', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'api-gate-worktree-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'etc', 'folder.api.md'), { recursive: true });
  assert.throws(
    () => reportAtWorktree('etc', 'folder.api.md', root),
    (err) => err.code === 'EISDIR',
  );
});
