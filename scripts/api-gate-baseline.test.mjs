// Unit tests for the api-gate's baselines: the committed report at a ref, read through git
// from a throwaway repository built in a temporary directory, and what each caller of the
// gate supplies as its old side (the release's newest published tag, the pull request's
// check that tag and its base).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  packageNameForReport,
  publishedBaseline,
  reportAtRef,
  reportsAtRef,
  runGate,
} from './api-gate.mjs';
import {
  KEPT_ONLY,
  MANIFEST,
  PACKAGES,
  REPORTS_AT_TAG,
  WITH_SYMBOL,
  commit,
  gateOverReports,
  git,
  gitBackedDeps,
  gitCommitting,
  manifestOf,
  mergeCheckoutRemoving,
  writeFile,
} from './api-gate-git-fixtures.mjs';
import { GateError } from './gate-error.mjs';
import { check } from './release-label-check.mjs';

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
  const report = 'packages/sdk/etc/surface.api.md';
  const root = mkdtempSync(join(tmpdir(), 'api-gate-baseline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFile(root, report, WITH_SYMBOL);
  writeFile(root, 'packages/sdk/package.json', manifestOf('@acme/surface'));
  git(root, 'init', '-q');
  git(root, 'branch', '-M', 'base');
  commit(root, 'report');
  git(root, 'tag', 'v1.0.0');
  // The topic branch leaves the tag and changes no report; the base then drops a symbol.
  git(root, 'checkout', '-q', '-b', 'topic');
  writeFileSync(join(root, 'unrelated.txt'), 'x\n');
  commit(root, 'unrelated');
  git(root, 'checkout', '-q', 'base');
  writeFile(root, report, KEPT_ONLY);
  commit(root, 'unreleased break');
  gitCommitting(root, 'merge', '-q', '--no-ff', '-m', 'merge', 'topic');

  assert.doesNotThrow(() => check('fix: a fix', '', PACKAGES, MANIFEST, gitBackedDeps(root)));
});

// The report every stubbed gate below lists at each ref it is asked about.
const LISTED = { dir: 'packages/sdk/etc', name: 'sdk.api.md' };
const listedAt = (ref) => [{ ...LISTED, ref }];

test('the release gate diffs each report against its newest published tag', () => {
  const reads = [];
  const lines = [];
  const deps = {
    mode: 'label-honesty',
    tags: ['v18.2.0', 'v18.2.1'],
    publishedVersionsFor: () => ['18.2.0'],
    packageNameFor: () => '@acme/sdk',
    listReportsAtRef: listedAt,
    readReportAtRef: (ref) => {
      reads.push(ref);
      return WITH_SYMBOL;
    },
    readReportAtWorktree: () => KEPT_ONLY,
    log: (line) => lines.push(line),
  };
  const failReasons = runGate('18.3.0', publishedBaseline('18.3.0', deps), deps);
  assert.deepEqual([...new Set(reads)], ['v18.2.0']);
  assert.ok(lines.some((line) => line.includes('skipping unpublished tag(s) v18.2.1')));
  assert.ok(lines.some((line) => line.includes('18.2.0 -> 18.3.0 (minor bump')));
  assert.ok(failReasons.length > 0);
  assert.match(failReasons[0], /is a minor bump but carries breaking surface changes/);
});

test('a first publish has no baseline to diff and passes', () => {
  const lines = [];
  const deps = {
    mode: 'label-honesty',
    tags: [],
    publishedVersionsFor: () => [],
    packageNameFor: () => '@acme/sdk',
    listReportsAtRef: listedAt,
    readReportAtRef: () => assert.fail('a first publish reads no old report'),
    readReportAtWorktree: () => assert.fail('a first publish reads no new report'),
    log: (line) => lines.push(line),
  };
  assert.deepEqual(runGate('1.0.0', publishedBaseline('1.0.0', deps), deps), []);
  assert.ok(lines.some((line) => line.includes('first publish, no published prior version')));
});

// A release gate over GONE: `heldAt` is the tags holding it. The release never holds it, and
// the listed report is the same at each tag and at the release.
const GONE = { dir: 'packages/studio-sdk/etc', name: 'studio-sdk-gone.api.md' };

function goneReportGate(version, { tags, published, heldAt, lines = [] }) {
  const deps = {
    mode: 'label-honesty',
    tags,
    publishedVersionsFor: () => published,
    packageNameFor: () => '@acme/sdk',
    readReportAtRef: () => KEPT_ONLY,
    readReportAtWorktree: () => KEPT_ONLY,
    listReportsAtRef: (ref) => [
      ...listedAt(ref),
      ...(heldAt.includes(ref) ? [{ ...GONE, ref }] : []),
    ],
    log: (line) => lines.push(line),
  };
  return runGate(version, publishedBaseline(version, deps), deps);
}

test('the release gate refuses a patch that lost a report its published tag holds', () => {
  const failReasons = goneReportGate('1.0.1', {
    tags: ['v1.0.0'],
    published: ['1.0.0'],
    heldAt: ['v1.0.0'],
  });
  assert.equal(failReasons.length, 1);
  assert.match(failReasons[0], /is a patch bump but carries breaking surface changes/);
  assert.ok(failReasons[0].includes(`${GONE.name}: report was removed`));
});

test('the release gate lets a major lose a report', () => {
  const failReasons = goneReportGate('2.0.0', {
    tags: ['v1.0.0'],
    published: ['1.0.0'],
    heldAt: ['v1.0.0'],
  });
  assert.deepEqual(failReasons, []);
});

test('a report lost on a refused tag still counts against the published tag beneath it', () => {
  const failReasons = goneReportGate('1.0.2', {
    tags: ['v1.0.0', 'v1.0.1'],
    published: ['1.0.0'],
    heldAt: ['v1.0.0'],
  });
  assert.equal(failReasons.length, 1);
});

test('a report a published major already lost counts for no later release', () => {
  const failReasons = goneReportGate('2.0.1', {
    tags: ['v1.0.0', 'v2.0.0'],
    published: ['1.0.0', '2.0.0'],
    heldAt: ['v1.0.0'],
  });
  assert.deepEqual(failReasons, []);
});

test('with no published version a lost report passes as a first publish', () => {
  const failReasons = goneReportGate('1.0.1', {
    tags: ['v1.0.0'],
    published: [],
    heldAt: ['v1.0.0'],
  });
  assert.deepEqual(failReasons, []);
});

test('a report added after the baseline tag does not fail', () => {
  const lines = [];
  const added = { dir: LISTED.dir, name: 'sdk-added.api.md' };
  const deps = {
    mode: 'label-honesty',
    tags: ['v1.0.0'],
    publishedVersionsFor: () => ['1.0.0'],
    packageNameFor: () => '@acme/sdk',
    readReportAtRef: () => KEPT_ONLY,
    readReportAtWorktree: () => KEPT_ONLY,
    listReportsAtRef: (ref) => [...listedAt(ref), ...(ref === 'HEAD' ? [{ ...added, ref }] : [])],
    log: (line) => lines.push(line),
  };
  assert.deepEqual(runGate('1.0.1', publishedBaseline('1.0.1', deps), deps), []);
  assert.ok(lines.some((line) => line.includes('sdk-added.api.md: 1.0.0 -> 1.0.1')));
});

// -------------------------------- a deletion read through git, on a real merge checkout

const REMOVALS = [
  {
    what: 'a report',
    report: 'api-client.api.md',
    remove: (root) => rmSync(join(root, 'packages/api-client/etc/api-client.api.md')),
  },
  {
    what: 'a whole package',
    report: 'extra.api.md',
    remove: (root) => rmSync(join(root, 'packages/extra'), { recursive: true }),
  },
];

for (const { what, report, remove } of REMOVALS) {
  test(`deleting ${what}: the label check refuses a fix and carries a breaking marker`, (t) => {
    const root = mergeCheckoutRemoving(remove);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.throws(
      () => check('fix: a fix', '', PACKAGES, MANIFEST, gitBackedDeps(root)),
      (err) => err instanceof GateError && err.message.includes(`${report}: report was removed`),
    );
    assert.doesNotThrow(() => check('feat!: a break', '', PACKAGES, MANIFEST, gitBackedDeps(root)));
  });

  test(`deleting ${what}: the release gate refuses a patch and carries a major`, (t) => {
    const root = mergeCheckoutRemoving(remove);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const gate = (version) =>
      runGate(version, publishedBaseline(version, gitBackedDeps(root)), gitBackedDeps(root));
    const failReasons = gate('1.0.1');
    assert.equal(failReasons.length, 1);
    assert.ok(failReasons[0].includes(`${report}: report was removed`));
    assert.deepEqual(gate('2.0.0'), []);
  });
}

// ----------------------------------------------------------- a report the release keeps

// A merge checkout whose tag holds `path` at `tagText` and whose topic side leaves `headText`.
function checkoutKeeping(path, tagText, headText) {
  return mergeCheckoutRemoving(
    (checkout) => {
      writeFile(checkout, path, headText);
      writeFile(checkout, 'topic.txt', 'x\n');
    },
    { [path]: tagText },
  );
}

test('a report kept in its folder with a symbol dropped is refused by both gates', (t) => {
  const path = 'packages/studio-sdk/etc/gone.api.md';
  const root = checkoutKeeping(path, WITH_SYMBOL, KEPT_ONLY);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate, labelCheck } = gateOverReports(root);
  const symbolRemoved = 'gone.api.md :: dropped: symbol was removed';
  assert.ok(tagGate('1.0.1')[0].includes(symbolRemoved));
  assert.throws(
    () => labelCheck('fix: a fix'),
    (err) => err instanceof GateError && err.message.includes(symbolRemoved),
  );
});

const UNJUDGEABLE_REPORTS = [
  {
    what: 'a report with no code fence',
    path: 'packages/studio-sdk/etc/NOTES.api.md',
    text: 'no code fence\n',
    refusal: 'report NOTES.api.md has no ```ts code fence',
  },
  {
    what: 'a report in a folder with no package.json',
    path: 'packages/features/etc/x.api.md',
    text: KEPT_ONLY,
    refusal: 'no named package.json owns the report directory packages/features/etc',
  },
];

for (const { what, path, text, refusal } of UNJUDGEABLE_REPORTS) {
  test(`${what} fails both gates loudly`, (t) => {
    const root = checkoutKeeping(path, text, text);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const { tagGate, labelCheck } = gateOverReports(root);
    const namesIt = (err) => err instanceof GateError && err.message.includes(refusal);
    assert.throws(() => tagGate('1.0.1'), namesIt);
    assert.throws(() => labelCheck('fix: a fix'), namesIt);
  });
}

test('a refused tag holding a report no package owns does not block the next release', (t) => {
  const refusedTag = (root) => {
    writeFile(root, 'packages/features/etc/x.api.md', KEPT_ONLY);
    commit(root, 'report with no package');
    git(root, 'tag', 'v1.0.1');
    rmSync(join(root, 'packages/features'), { recursive: true });
    commit(root, 'report removed');
  };
  const root = mergeCheckoutRemoving(
    (checkout) => writeFile(checkout, 'topic.txt', 'x\n'),
    {},
    refusedTag,
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate } = gateOverReports(root, {
    tags: ['v1.0.0', 'v1.0.1'],
    publishedVersionsFor: (name) => (name === null ? assert.fail('npm asked for null') : ['1.0.0']),
  });
  assert.deepEqual(tagGate('1.0.2'), []);
});

// -------------------------------------------------- what the baseline is read from

test('deleting every report is refused by both gates and carried by a major', (t) => {
  const root = mergeCheckoutRemoving((checkout) =>
    rmSync(join(checkout, 'packages'), { recursive: true }),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate, labelCheck } = gateOverReports(root);
  const failReasons = tagGate('1.0.1');
  assert.equal(failReasons.length, REPORTS_AT_TAG.length + 2);
  assert.ok(failReasons.every((reason) => reason.includes('report was removed')));
  assert.deepEqual(tagGate('2.0.0'), []);
  assert.throws(() => labelCheck('fix: a fix'), GateError);
  assert.doesNotThrow(() => labelCheck('feat!: a break'));
});

test('every package renamed in place is judged under its published name by both gates', (t) => {
  const root = mergeCheckoutRemoving((checkout) => {
    for (const dir of ['packages/studio-sdk', 'packages/api-client', 'packages/extra'])
      writeFile(checkout, `${dir}/package.json`, manifestOf(`@acme/renamed-${dir}`));
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate, labelCheck } = gateOverReports(root, {
    publishedVersionsFor: (name) => (name.startsWith('@acme/renamed') ? [] : ['1.0.0']),
  });
  assert.ok(tagGate('1.0.1').every((reason) => reason.includes('report was removed')));
  assert.equal(tagGate('1.0.1').length, REPORTS_AT_TAG.length + 2);
  assert.throws(() => labelCheck('fix: a fix'), GateError);
});

test('deleting the one published package is refused beside a never-published one', (t) => {
  const root = mergeCheckoutRemoving((checkout) =>
    rmSync(join(checkout, 'packages/extra'), { recursive: true }),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate, labelCheck } = gateOverReports(root, {
    publishedVersionsFor: (name) => (name === '@acme/extra' ? ['1.0.0'] : []),
  });
  const failReasons = tagGate('1.0.1');
  assert.equal(failReasons.length, 1);
  assert.ok(failReasons[0].includes('extra.api.md: report was removed'));
  assert.throws(() => labelCheck('fix: a fix'), GateError);
});

// ------------------------------------------------------- a report moved to another folder

const moveFolder = (root, from, to) => renameSync(join(root, from), join(root, to));

test('a package moved to another folder under the same name is not a removed report', (t) => {
  const root = mergeCheckoutRemoving((checkout) =>
    moveFolder(checkout, 'packages/extra', 'packages/moved'),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate, labelCheck } = gateOverReports(root);
  assert.deepEqual(tagGate('1.0.1'), []);
  assert.doesNotThrow(() => labelCheck('fix: a fix'));
});

test('a package moved out of a folder another package now takes is not a removed report', (t) => {
  const root = mergeCheckoutRemoving((checkout) => {
    moveFolder(checkout, 'packages/extra', 'packages/moved');
    writeFile(checkout, 'packages/extra/package.json', manifestOf('@acme/successor'));
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(gateOverReports(root).tagGate('1.0.1'), []);
});

const NOT_MOVES = [
  {
    what: 'a moved package whose npm name changed',
    change: (root) => {
      moveFolder(root, 'packages/extra', 'packages/moved');
      writeFile(root, 'packages/moved/package.json', manifestOf('@acme/renamed'));
    },
  },
  {
    what: 'a moved package whose report name changed',
    change: (root) => {
      moveFolder(root, 'packages/extra', 'packages/moved');
      renameSync(
        join(root, 'packages/moved/etc/extra.api.md'),
        join(root, 'packages/moved/etc/other.api.md'),
      );
    },
  },
  {
    what: 'a report of that name left only in another package',
    change: (root) => {
      moveFolder(root, 'packages/extra/etc/extra.api.md', 'packages/api-client/etc/extra.api.md');
    },
  },
  {
    what: 'a report moved out of its package etc folder',
    change: (root) => moveFolder(root, 'packages/extra/etc', 'packages/extra/reports'),
  },
];

for (const { what, change } of NOT_MOVES) {
  test(`${what} is a removed report in both gates`, (t) => {
    const root = mergeCheckoutRemoving(change);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const { tagGate, labelCheck } = gateOverReports(root);
    const failReasons = tagGate('1.0.1');
    assert.equal(failReasons.length, 1);
    assert.ok(failReasons[0].includes('extra.api.md: report was removed'));
    assert.throws(
      () => labelCheck('fix: a fix'),
      (err) => err instanceof GateError && err.message.includes('extra.api.md: report was removed'),
    );
  });
}

test('a report lost from a package renamed in place is judged under its published name', (t) => {
  const root = mergeCheckoutRemoving((checkout) => {
    rmSync(join(checkout, 'packages/extra/etc/extra.api.md'));
    writeFile(checkout, 'packages/extra/package.json', manifestOf('@acme/renamed'));
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate } = gateOverReports(root, {
    publishedVersionsFor: (name) => (name === '@acme/renamed' ? [] : ['1.0.0']),
  });
  const failReasons = tagGate('1.0.1');
  assert.equal(failReasons.length, 1);
  assert.ok(failReasons[0].includes('extra.api.md: report was removed'));
});

// ---------------------------------- a report matched across sides by what it is, not where

const moveExtraOnBase = (root) => {
  moveFolder(root, 'packages/extra', 'packages/extra-next');
  commit(root, 'move on base');
};

const DELETIONS_AFTER_A_MOVE_ON_BASE = [
  {
    what: 'the moved package',
    remove: (root) => rmSync(join(root, 'packages/extra-next'), { recursive: true }),
  },
  {
    what: 'the moved report alone',
    remove: (root) => rmSync(join(root, 'packages/extra-next/etc/extra.api.md')),
  },
];

for (const { what, remove } of DELETIONS_AFTER_A_MOVE_ON_BASE) {
  test(`deleting ${what} after an unreleased move on base is refused by both gates`, (t) => {
    const root = mergeCheckoutRemoving(remove, {}, moveExtraOnBase);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const { tagGate, labelCheck } = gateOverReports(root);
    assert.equal(tagGate('1.0.1').length, 1);
    assert.throws(
      () => labelCheck('fix: a fix'),
      (err) => err instanceof GateError && err.message.includes('extra.api.md: report was removed'),
    );
  });
}

test('a pull request only moving a package renamed unreleased on base is not breaking', (t) => {
  const renameOnBase = (root) => {
    writeFile(root, 'packages/api-client/package.json', manifestOf('@acme/renamed'));
    commit(root, 'rename on base');
  };
  const root = mergeCheckoutRemoving(
    (checkout) => moveFolder(checkout, 'packages/api-client', 'packages/client-next'),
    {},
    renameOnBase,
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lines = [];
  const { tagGate, labelCheck } = gateOverReports(root, {
    publishedVersionsFor: (name) => (name === '@acme/renamed' ? [] : ['1.0.0']),
    log: (line) => lines.push(line),
  });
  assert.doesNotThrow(() => labelCheck('fix: a fix'));
  assert.ok(lines.some((line) => line.includes('prior version of @acme/renamed')));
  assert.ok(
    lines.some(
      (line) =>
        line.includes("not breaking in the pull request's own change") &&
        line.includes('report was removed from @acme/packages/api-client'),
    ),
  );
  // The published name is gone from the release, which is what the tag gate judges.
  const failReasons = tagGate('1.0.1');
  assert.equal(failReasons.length, 1);
  assert.ok(failReasons[0].includes('report was removed from @acme/packages/api-client'));
});

test('a package renamed in place loses its report under the published name', (t) => {
  const root = mergeCheckoutRemoving((checkout) =>
    writeFile(checkout, 'packages/extra/package.json', manifestOf('@acme/renamed')),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate, labelCheck } = gateOverReports(root);
  assert.ok(tagGate('1.0.1')[0].includes('extra.api.md: report was removed from @acme/extra'));
  assert.throws(() => labelCheck('fix: a fix'), GateError);
});

const API_CLIENT_REPORT = 'packages/api-client/etc/api-client.api.md';

test('a moved report is diffed against its old text in both gates', (t) => {
  const root = mergeCheckoutRemoving(
    (checkout) => {
      moveFolder(checkout, 'packages/api-client', 'packages/client-next');
      writeFile(checkout, 'packages/client-next/etc/api-client.api.md', KEPT_ONLY);
    },
    { [API_CLIENT_REPORT]: WITH_SYMBOL },
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate, labelCheck } = gateOverReports(root);
  const symbolRemoved = 'api-client.api.md :: dropped: symbol was removed';
  assert.ok(tagGate('1.0.1')[0].includes(symbolRemoved));
  assert.throws(
    () => labelCheck('fix: a fix'),
    (err) => err instanceof GateError && err.message.includes(symbolRemoved),
  );
});

test('a package a published major dropped counts for no later release', (t) => {
  const dropExtraAtMajor = (root) => {
    rmSync(join(root, 'packages/extra'), { recursive: true });
    commit(root, 'drop extra');
    git(root, 'tag', 'v2.0.0');
  };
  const root = mergeCheckoutRemoving(
    (checkout) => writeFile(checkout, 'topic.txt', 'x\n'),
    {},
    dropExtraAtMajor,
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate } = gateOverReports(root, {
    tags: ['v1.0.0', 'v2.0.0'],
    publishedVersionsFor: (name) => (name === '@acme/extra' ? ['1.0.0'] : ['1.0.0', '2.0.0']),
  });
  assert.deepEqual(tagGate('2.0.1'), []);
});

test('the baseline resolves package names through its production seams', () => {
  const asked = [];
  const baseline = publishedBaseline('1.0.0', {
    tags: ['v0.9.0'],
    publishedVersionsFor: (name) => {
      asked.push(name);
      return [];
    },
    listReportsAtRef: () => reportsAtRef('HEAD'),
  });
  assert.deepEqual(baseline.reports(), []);
  assert.ok(asked.length > 0);
  assert.ok(asked.every((name) => typeof name === 'string'));
});

test('reportsAtRef lists only the packages/<package>/etc reports, each carrying the ref', (t) => {
  const root = taggedRepo('outside-packages.api.md', 'x\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFile(root, 'packages/extra/etc/extra.api.md', 'x\n');
  writeFile(root, 'packages/extra/src/not-a-report.api.md', 'x\n');
  writeFile(root, 'packages/extra/etc/not-a-report.md', 'x\n');
  commit(root, 'more');
  git(root, 'tag', 'v1.0.1');
  assert.deepEqual(reportsAtRef('v1.0.1', root), [
    { dir: 'packages/extra/etc', name: 'extra.api.md', ref: 'v1.0.1' },
  ]);
  assert.deepEqual(reportsAtRef('v1.0.0', root), []);
  assert.throws(() => reportsAtRef('no-such-ref', root), GateError);
});

test('a report carrying a ref takes its package name from that ref, not the release', (t) => {
  const root = mergeCheckoutRemoving((checkout) =>
    writeFile(checkout, 'packages/extra/package.json', manifestOf('@acme/renamed')),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = 'packages/extra/etc';
  assert.equal(packageNameForReport({ dir, ref: 'v1.0.0' }, root), '@acme/extra');
  assert.equal(packageNameForReport({ dir, ref: 'HEAD' }, root), '@acme/renamed');
});

test('a package gone from the release takes its name from the ref holding its report', (t) => {
  const root = mergeCheckoutRemoving((checkout) =>
    rmSync(join(checkout, 'packages/extra'), { recursive: true }),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = 'packages/extra/etc';
  assert.equal(packageNameForReport({ dir, ref: 'v1.0.0' }, root), '@acme/extra');
  assert.equal(packageNameForReport({ dir, ref: 'HEAD' }, root), null);
});

// ------------------------------------------------- the tags a removal is judged against

const SDK_REPORT = 'packages/sdk/etc/sdk.api.md';
const CLIENT_REPORT = 'packages/client/etc/client.api.md';
const NEW_REPORT = 'packages/new/etc/new.api.md';
const SDK_MANIFEST = 'packages/sdk/package.json';
const CLIENT_MANIFEST = 'packages/client/package.json';

// A repository whose commits each take a tag: `files` (path to text) is the first commit's
// tree and every further step changes the tree before its tag. The checkout is one commit past
// the last tag, which is the release under judgment.
function taggedHistory(files, steps) {
  const root = mkdtempSync(join(tmpdir(), 'api-gate-walk-'));
  for (const [path, text] of Object.entries(files)) writeFile(root, path, text);
  git(root, 'init', '-q');
  steps.forEach(({ tag, change }) => {
    change?.(root);
    writeFile(root, 'history.txt', `${tag}\n`);
    commit(root, tag);
    git(root, 'tag', tag);
  });
  writeFile(root, 'history.txt', 'release\n');
  commit(root, 'release');
  return root;
}

const TWO_PACKAGES = {
  [SDK_REPORT]: KEPT_ONLY,
  [SDK_MANIFEST]: manifestOf('@acme/sdk'),
  [CLIENT_REPORT]: KEPT_ONLY,
  [CLIENT_MANIFEST]: manifestOf('@acme/client'),
};
const deleteEveryReport = (root) => {
  rmSync(join(root, SDK_REPORT));
  rmSync(join(root, CLIENT_REPORT));
};
const publishedAtFirstTag = (name) =>
  ['@acme/sdk', '@acme/client'].includes(name) ? ['1.0.0'] : [];

const REFUSED_TAG_NAMING_NO_PUBLISHED_PACKAGE = [
  { what: 'every report deleted', change: deleteEveryReport },
  {
    what: 'every report deleted and a new package added',
    change: (root) => {
      deleteEveryReport(root);
      writeFile(root, NEW_REPORT, KEPT_ONLY);
      writeFile(root, 'packages/new/package.json', manifestOf('@acme/new'));
    },
  },
  {
    what: 'both packages renamed in place',
    change: (root) => {
      writeFile(root, SDK_MANIFEST, manifestOf('@acme/sdk-next'));
      writeFile(root, CLIENT_MANIFEST, manifestOf('@acme/client-next'));
    },
  },
];

for (const { what, change } of REFUSED_TAG_NAMING_NO_PUBLISHED_PACKAGE) {
  test(`${what}: refused on the tag and on the tag after it`, (t) => {
    const root = taggedHistory(TWO_PACKAGES, [{ tag: 'v1.0.0' }, { tag: 'v1.0.1', change }]);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const { tagGate } = gateOverReports(root, {
      tags: ['v1.0.0', 'v1.0.1'],
      publishedVersionsFor: publishedAtFirstTag,
    });
    for (const version of ['1.0.1', '1.0.2']) {
      const failReasons = tagGate(version);
      assert.equal(failReasons.length, 2, version);
      assert.ok(failReasons.every((reason) => reason.includes('report was removed')));
    }
    assert.deepEqual(tagGate('2.0.0'), []);
  });
}

test('a package deleted on a refused tag stays judged when the rest have an older baseline', (t) => {
  const root = taggedHistory(TWO_PACKAGES, [
    { tag: 'v1.0.0' },
    {
      tag: 'v1.1.0',
      change: (checkout) => {
        writeFile(checkout, NEW_REPORT, KEPT_ONLY);
        writeFile(checkout, 'packages/new/package.json', manifestOf('@acme/new'));
      },
    },
    {
      tag: 'v1.1.1',
      change: (checkout) => rmSync(join(checkout, 'packages/new'), { recursive: true }),
    },
  ]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate } = gateOverReports(root, {
    tags: ['v1.0.0', 'v1.1.0', 'v1.1.1'],
    publishedVersionsFor: (name) => (name === '@acme/new' ? ['1.1.0'] : ['1.0.0']),
  });
  for (const version of ['1.1.1', '1.1.2']) {
    const failReasons = tagGate(version);
    assert.equal(failReasons.length, 1, version);
    assert.ok(failReasons[0].includes('new.api.md: report was removed'), version);
  }
  assert.deepEqual(tagGate('2.0.0'), []);
});

test('one package left by a major: its reports deleted are refused on the tag after', (t) => {
  const root = taggedHistory(TWO_PACKAGES, [
    { tag: 'v1.0.0' },
    {
      tag: 'v2.0.0',
      change: (checkout) => rmSync(join(checkout, 'packages/client'), { recursive: true }),
    },
    { tag: 'v2.0.1', change: (checkout) => rmSync(join(checkout, SDK_REPORT)) },
  ]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate } = gateOverReports(root, {
    tags: ['v1.0.0', 'v2.0.0', 'v2.0.1'],
    publishedVersionsFor: (name) => (name === '@acme/sdk' ? ['1.0.0', '2.0.0'] : ['1.0.0']),
  });
  const failReasons = tagGate('2.0.2');
  assert.equal(failReasons.length, 1);
  assert.ok(failReasons[0].includes('sdk.api.md: report was removed'));
});

for (const { what, published } of [
  { what: 'published', published: ['1.0.0', '2.0.0'] },
  { what: 'failed before publishing', published: ['1.0.0'] },
]) {
  test(`a package dropped by a major ${what} counts for no later patch`, (t) => {
    const root = taggedHistory(TWO_PACKAGES, [
      { tag: 'v1.0.0' },
      {
        tag: 'v2.0.0',
        change: (checkout) => rmSync(join(checkout, 'packages/client'), { recursive: true }),
      },
    ]);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const { tagGate } = gateOverReports(root, {
      tags: ['v1.0.0', 'v2.0.0'],
      publishedVersionsFor: (name) => (name === '@acme/sdk' ? published : ['1.0.0']),
    });
    assert.deepEqual(tagGate('2.0.1'), []);
  });
}

test('the walk ignores a pre-release tag, whatever it holds', (t) => {
  const root = taggedHistory(TWO_PACKAGES, [
    { tag: 'v1.0.0' },
    { tag: 'v1.0.1-rc.1', change: deleteEveryReport },
  ]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const asked = [];
  const { tagGate } = gateOverReports(root, {
    tags: ['v1.0.0', 'v1.0.1-rc.1'],
    publishedVersionsFor: publishedAtFirstTag,
    listReportsAtRef: (ref) => {
      asked.push(ref);
      return reportsAtRef(ref, root);
    },
  });
  assert.equal(tagGate('1.0.1').length, 2);
  assert.ok(!asked.includes('v1.0.1-rc.1'));
});

test('with no tags every report passes as a first publish', (t) => {
  const root = taggedHistory(TWO_PACKAGES, []);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lines = [];
  const { tagGate } = gateOverReports(root, {
    tags: [],
    publishedVersionsFor: publishedAtFirstTag,
    log: (line) => lines.push(line),
  });
  assert.deepEqual(tagGate('1.0.0'), []);
  assert.equal(lines.filter((line) => line.includes('first publish')).length, 2);
});

test('tags naming no published package at any depth pass as a first publish', (t) => {
  const root = taggedHistory(TWO_PACKAGES, [
    { tag: 'v1.0.0' },
    { tag: 'v1.0.1', change: deleteEveryReport },
  ]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { tagGate } = gateOverReports(root, {
    tags: ['v1.0.0', 'v1.0.1'],
    publishedVersionsFor: () => [],
  });
  assert.deepEqual(tagGate('1.0.2'), []);
});
