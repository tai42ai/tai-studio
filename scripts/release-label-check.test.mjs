// Unit tests for scripts/release-label-check.mjs — the pre-merge label-honesty check.
// The projection helpers are exercised directly with synthetic titles and bodies; the
// end-to-end `check` is driven through the gate's injectable I/O seams with in-memory
// api-extractor reports, so no git, npm or build is touched. The gate's own decision
// logic and the surface classification have their own suites (api-gate.test.mjs and
// api-surface-diff.test.mjs); these tests pin the title/body -> bump -> version
// projection and that a dishonest release is refused.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Bump,
  projectedBump,
  releaseAs,
  projectVersion,
  loadPackages,
  projectedReleases,
  check,
  GateError,
} from './release-label-check.mjs';

// ------------------------------------------------------ title/body -> bump

test('a title-only fix is a patch, a title-only feat is a minor', () => {
  assert.equal(projectedBump('fix(cli): correct a typo', ''), Bump.PATCH);
  assert.equal(projectedBump('feat(kit): add a helper', ''), Bump.MINOR);
});

test('a non-releasing type projects nothing', () => {
  assert.equal(projectedBump('chore: bump a dev dependency', ''), Bump.NONE);
  assert.equal(projectedBump('docs: expand the readme', ''), Bump.NONE);
  assert.equal(projectedBump('ci: adjust a workflow', ''), Bump.NONE);
});

test('a blank line then a whitelisted header starts a chunk (body lifts the bump)', () => {
  // A patch title with a plain feat chunk a blank line below projects the higher minor.
  assert.equal(projectedBump('fix(kit): a fix', 'feat(kit): and also a feature'), Bump.MINOR);
});

test('a "!" on the header is a major', () => {
  assert.equal(projectedBump('feat(kit)!: drop a public symbol', ''), Bump.MAJOR);
  assert.equal(projectedBump('fix!: a breaking fix', ''), Bump.MAJOR);
});

test('a "!" on a body line is not a major (the chunk split excludes "!")', () => {
  // A "type!:" body line starts no chunk and stays plain body text: the title's fix
  // keeps it a patch.
  assert.equal(projectedBump('fix(kit): tidy', 'refactor(kit)!: remove a method'), Bump.PATCH);
});

test('a "!" line even after a blank line still starts no chunk', () => {
  assert.equal(projectedBump('fix: a fix', '\nfeat(kit)!: add a thing'), Bump.PATCH);
});

test('a "!" line after a non-whitelisted line stays plain body', () => {
  assert.equal(projectedBump('fix: a fix', 'some free-form context\nfeat!: add'), Bump.PATCH);
});

test('a non-whitelisted footer line after a blank line starts no chunk', () => {
  // A body trailer like "tai42-ref: my-branch" is not a whitelisted conventional type,
  // so a blank line before it does not begin a chunk — the title's fix stays a patch.
  assert.equal(projectedBump('fix: a fix', 'some context\n\ntai42-ref: my-branch'), Bump.PATCH);
});

test('a BREAKING CHANGE / BREAKING-CHANGE footer in a chunk is a major', () => {
  assert.equal(projectedBump('fix(kit): tidy up', 'BREAKING CHANGE: removed a router'), Bump.MAJOR);
  assert.equal(projectedBump('feat: add', 'BREAKING-CHANGE: the shape changed'), Bump.MAJOR);
});

test('a commit-override block replaces the whole message', () => {
  // The override replaces the title too: a feat! title is discarded down to a patch,
  // and a fix title is lifted up to a major by the override's own content.
  assert.equal(
    projectedBump(
      'feat!: rewrite everything',
      'BEGIN_COMMIT_OVERRIDE\nfix: tidy\nEND_COMMIT_OVERRIDE',
    ),
    Bump.PATCH,
  );
  assert.equal(
    projectedBump(
      'fix: tidy',
      'BEGIN_COMMIT_OVERRIDE\nfeat!: a breaking change\nEND_COMMIT_OVERRIDE',
    ),
    Bump.MAJOR,
  );
});

test('a commit-override carrying a breaking footer is a major', () => {
  const body = 'BEGIN_COMMIT_OVERRIDE\nfix: tidy\n\nBREAKING CHANGE: it moved\nEND_COMMIT_OVERRIDE';
  assert.equal(projectedBump('fix: tidy', body), Bump.MAJOR);
});

test('a nested-commit block contributes its own bump; plain-text one adds none', () => {
  assert.equal(
    projectedBump(
      'fix: a fix',
      'some context\n\nBEGIN_NESTED_COMMIT\nfeat!: a nested break\nEND_NESTED_COMMIT',
    ),
    Bump.MAJOR,
  );
  assert.equal(
    projectedBump('fix: a fix', 'BEGIN_NESTED_COMMIT\njust prose, no header\nEND_NESTED_COMMIT'),
    Bump.PATCH,
  );
});

// ------------------------------------------------------------- Release-As

test('a Release-As footer is read, with a leading v stripped', () => {
  assert.equal(releaseAs('fix: a fix', 'Release-As: 9.9.9'), '9.9.9');
  assert.equal(releaseAs('fix: a fix', 'Release-As: v9.9.9'), '9.9.9');
  assert.equal(releaseAs('fix: a fix', 'no footer here'), null);
});

test('a Release-As inside an override wins over one outside it', () => {
  const body =
    'Release-As: 1.2.3\n\nBEGIN_COMMIT_OVERRIDE\nfix: tidy\n\nRelease-As: 4.5.6\nEND_COMMIT_OVERRIDE';
  assert.equal(releaseAs('fix: a fix', body), '4.5.6');
});

// -------------------------------------------------------- current -> next version

test('projectVersion follows plain semver at or above 1.0', () => {
  const flags = { bumpMinorPreMajor: false, bumpPatchForMinorPreMajor: false };
  assert.equal(projectVersion('18.2.1', Bump.MAJOR, flags), '19.0.0');
  assert.equal(projectVersion('18.2.1', Bump.MINOR, flags), '18.3.0');
  assert.equal(projectVersion('18.2.1', Bump.PATCH, flags), '18.2.2');
  assert.equal(projectVersion('18.2.1', Bump.NONE, flags), null);
});

test('projectVersion below 1.0 follows plain semver with the default flags off', () => {
  const flags = { bumpMinorPreMajor: false, bumpPatchForMinorPreMajor: false };
  assert.equal(projectVersion('0.4.2', Bump.MAJOR, flags), '1.0.0');
  assert.equal(projectVersion('0.4.2', Bump.MINOR, flags), '0.5.0');
});

test('projectVersion below 1.0 redirects the bump when the pre-major flags are on', () => {
  assert.equal(
    projectVersion('0.4.2', Bump.MAJOR, {
      bumpMinorPreMajor: true,
      bumpPatchForMinorPreMajor: false,
    }),
    '0.5.0',
  );
  assert.equal(
    projectVersion('0.4.2', Bump.MINOR, {
      bumpMinorPreMajor: false,
      bumpPatchForMinorPreMajor: true,
    }),
    '0.4.3',
  );
});

test('projectVersion fails loudly on a non-semver manifest version', () => {
  assert.throws(
    () =>
      projectVersion('18.2', Bump.PATCH, {
        bumpMinorPreMajor: false,
        bumpPatchForMinorPreMajor: false,
      }),
    GateError,
  );
});

// ------------------------------------------ config -> packages, projected versions

test('loadPackages resolves the pre-major flags from the global defaults', () => {
  const packages = loadPackages({ 'bump-minor-pre-major': true, packages: { '.': {} } });
  assert.equal(packages.get('.')['bump-minor-pre-major'], true);
  assert.equal(packages.get('.')['bump-patch-for-minor-pre-major'], false);
});

test('loadPackages lets a package override the global flag', () => {
  const packages = loadPackages({
    'bump-minor-pre-major': true,
    packages: { '.': { 'bump-minor-pre-major': false } },
  });
  assert.equal(packages.get('.')['bump-minor-pre-major'], false);
});

test('loadPackages fails loudly when no package is declared', () => {
  assert.throws(() => loadPackages({}), GateError);
  assert.throws(() => loadPackages({ packages: {} }), GateError);
});

const rootPackages = loadPackages({ packages: { '.': {} } });
const manifest = { '.': '18.2.1' };

test('a patch bump lifts the single root package to the next patch', () => {
  const { releases, label } = projectedReleases('fix: a fix', '', rootPackages, manifest);
  assert.deepEqual(releases, [{ current: '18.2.1', next: '18.2.2' }]);
  assert.equal(label, 'patch bump');
});

test('a Release-As footer forces the projected version regardless of the header type', () => {
  const { releases, label } = projectedReleases(
    'ci: refuse a mislabelled release',
    'Release-As: 19.0.0',
    rootPackages,
    manifest,
  );
  assert.deepEqual(releases, [{ current: '18.2.1', next: '19.0.0' }]);
  assert.equal(label, 'forced to 19.0.0 by Release-As');
});

test('a non-releasing change projects no version to gate', () => {
  const { releases } = projectedReleases('chore: tidy', '', rootPackages, manifest);
  assert.deepEqual(releases, []);
});

// ------------------------------------------------- the two-sided rule
// A surface item counts only when it is breaking against the newest published version AND in
// the pull request's own change. The reader serves the published tag and the base side of the
// merge checkout (HEAD^1) and refuses any other ref. Driven through the gate's I/O seams with
// in-memory reports — no git, npm or build.

const fence = (...declarations) => '```ts\n' + declarations.join('\n') + '\n```';
const KEPT = 'export interface Kept {\n  a: number;\n}';
const DROPPED = 'export const dropped: string;';

const NOT_COUNTED_LACKS_PUBLISHED = 'not counted, not breaking against the published version';
const NOT_COUNTED_LACKS_OWN = "not counted, not breaking in the pull request's own change";

// The report every side lists unless a case says it is absent there.
const LISTED = { dir: 'packages/sdk/etc', name: 'sdk.api.md' };

// `published` and `base` are the reports at each side; null is a report absent there.
const gateDeps = ({ published, base, head = fence(KEPT), lines = [] }) => ({
  mode: 'label-honesty',
  tags: ['v18.2.1'],
  publishedVersionsFor: () => ['18.2.1'],
  packageNameFor: () => '@acme/sdk',
  readReportAtRef: (ref) => {
    if (ref === 'v18.2.1') return published;
    if (ref === 'HEAD^1') return base;
    return assert.fail(`unexpected report read at ${ref}`);
  },
  readReportAtWorktree: () => head,
  listReportsAtRef: (ref) => {
    const absent = (ref === 'v18.2.1' && published === null) || (ref === 'HEAD^1' && base === null);
    return absent ? [] : [{ ...LISTED, ref }];
  },
  log: (line) => lines.push(line),
});

const inBothSides = () => ({ published: fence(KEPT, DROPPED), base: fence(KEPT, DROPPED) });

test('a fix renaming a symbol no published version held passes', () => {
  const lines = [];
  const deps = gateDeps({
    published: fence(KEPT),
    base: fence(KEPT, 'export const unreleasedAdd: string;'),
    head: fence(KEPT, 'export const renamedAdd: string;'),
    lines,
  });
  assert.doesNotThrow(() => check('fix: rename an addition', '', rootPackages, manifest, deps));
  assert.ok(
    lines.some(
      (line) =>
        line.includes(NOT_COUNTED_LACKS_PUBLISHED) &&
        line.includes('unreleasedAdd: symbol was removed'),
    ),
  );
});

test('a fix removing a published symbol is refused with the gate message', () => {
  assert.throws(
    () => check('fix: drop a surface', '', rootPackages, manifest, gateDeps(inBothSides())),
    (err) =>
      err instanceof GateError &&
      /the pull request's release \(patch bump\) cannot honestly carry this API change/.test(
        err.message,
      ) &&
      /dropped: symbol was removed/.test(err.message),
  );
});

test('a fix with no report change passes while the base holds an unreleased break', () => {
  const lines = [];
  const deps = gateDeps({ published: fence(KEPT, DROPPED), base: fence(KEPT), lines });
  assert.doesNotThrow(() => check('fix: bump a dependency', '', rootPackages, manifest, deps));
  assert.ok(
    lines.some(
      (line) =>
        line.includes(NOT_COUNTED_LACKS_OWN) && line.includes('dropped: symbol was removed'),
    ),
  );
});

test('a first publish counts nothing', () => {
  const lines = [];
  const deps = {
    ...gateDeps({
      published: 'never read: no published version',
      base: fence(KEPT, DROPPED),
      lines,
    }),
    publishedVersionsFor: () => [],
  };
  assert.doesNotThrow(() => check('fix: drop a surface', '', rootPackages, manifest, deps));
  assert.ok(lines.some((line) => line.includes('first publish')));
  assert.ok(lines.some((line) => line.includes(NOT_COUNTED_LACKS_PUBLISHED)));
});

test('a report absent at the published tag counts nothing', () => {
  const lines = [];
  const deps = gateDeps({ published: null, base: fence(KEPT, DROPPED), lines });
  assert.doesNotThrow(() => check('fix: drop a surface', '', rootPackages, manifest, deps));
  assert.ok(lines.some((line) => line.includes(NOT_COUNTED_LACKS_PUBLISHED)));
});

test('a report absent at the base counts nothing', () => {
  const lines = [];
  const deps = gateDeps({ published: fence(KEPT, DROPPED), base: null, lines });
  assert.doesNotThrow(() => check('fix: add a report', '', rootPackages, manifest, deps));
  assert.ok(lines.some((line) => line.includes(NOT_COUNTED_LACKS_OWN)));
});

test('a refusal names the counted item alone, in the words of the own-change side', () => {
  const member = (text) => `export interface Shape {\n  ${text};\n}`;
  const lines = [];
  const deps = gateDeps({
    // Shape's published member turned required on the base, then retyped here; onlyOwn was
    // never published; onlyPublished left on the base.
    published: fence(KEPT, member('a?: string'), 'export const onlyPublished: string;'),
    base: fence(KEPT, member('a: string'), 'export const onlyOwn: string;'),
    head: fence(KEPT, member('a: number')),
    lines,
  });
  assert.throws(
    () => check('fix: retype a member', '', rootPackages, manifest, deps),
    (err) =>
      err instanceof GateError &&
      /Shape: member "a" signature removed or changed/.test(err.message) &&
      !/became required/.test(err.message) &&
      !/onlyOwn/.test(err.message) &&
      !/onlyPublished/.test(err.message),
  );
  assert.ok(
    lines.some((line) => line.includes(NOT_COUNTED_LACKS_PUBLISHED) && line.includes('onlyOwn')),
  );
  assert.ok(
    lines.some((line) => line.includes(NOT_COUNTED_LACKS_OWN) && line.includes('onlyPublished')),
  );
});

test('a fix removing an unreleased member passes beside a published member main broke', () => {
  const lines = [];
  const deps = gateDeps({
    published: fence(KEPT, 'export interface Shape {\n  a: string;\n}'),
    base: fence(KEPT, 'export interface Shape {\n  a: number;\n  b?: string;\n}'),
    head: fence(KEPT, 'export interface Shape {\n  a: number;\n}'),
    lines,
  });
  assert.doesNotThrow(() => check('fix: drop an addition', '', rootPackages, manifest, deps));
  assert.ok(
    lines.some(
      (line) =>
        line.includes(NOT_COUNTED_LACKS_PUBLISHED) &&
        line.includes('Shape: member "b" was removed'),
    ),
  );
  assert.ok(
    lines.some(
      (line) =>
        line.includes(NOT_COUNTED_LACKS_OWN) &&
        line.includes('Shape: member "a" signature removed or changed'),
    ),
  );
});

test('a fix removing a published member is refused', () => {
  const both = 'export interface Shape {\n  a: string;\n  b: string;\n}';
  const deps = gateDeps({
    published: fence(KEPT, both),
    base: fence(KEPT, both),
    head: fence(KEPT, 'export interface Shape {\n  b: string;\n}'),
  });
  assert.throws(
    () => check('fix: drop a member', '', rootPackages, manifest, deps),
    (err) => err instanceof GateError && /Shape: member "a" was removed/.test(err.message),
  );
});

test('a fix adding a required member is refused', () => {
  const shape = 'export interface Shape {\n  a: string;\n}';
  const deps = gateDeps({
    published: fence(KEPT, shape),
    base: fence(KEPT, shape),
    head: fence(KEPT, 'export interface Shape {\n  a: string;\n  b: string;\n}'),
  });
  assert.throws(
    () => check('fix: require a member', '', rootPackages, manifest, deps),
    (err) =>
      err instanceof GateError && /Shape: new required member "b" was added/.test(err.message),
  );
});

test('a feat removing a published symbol is refused', () => {
  assert.throws(
    () => check('feat: drop a surface', '', rootPackages, manifest, gateDeps(inBothSides())),
    (err) => err instanceof GateError && /minor bump/.test(err.message),
  );
});

test('a breaking marker on the title carries a published symbol removed', () => {
  assert.doesNotThrow(() =>
    check('feat!: drop a surface', '', rootPackages, manifest, gateDeps(inBothSides())),
  );
});

test('a Release-As to the next major carries a published symbol removed', () => {
  // Release-As forces the major from a ci: title, which projects no release on its own.
  assert.doesNotThrow(() =>
    check(
      'ci: refuse a mislabelled release',
      'Release-As: 19.0.0',
      rootPackages,
      manifest,
      gateDeps(inBothSides()),
    ),
  );
});

test('the bump is judged from the manifest version to the projection', () => {
  const lines = [];
  const deps = {
    ...gateDeps({ published: fence(KEPT), base: fence(KEPT), lines }),
    tags: ['v18.0.0'],
    publishedVersionsFor: () => ['18.0.0'],
    readReportAtRef: () => fence(KEPT),
  };
  check('fix: a fix', '', rootPackages, manifest, deps);
  assert.ok(lines.some((line) => line.includes('18.2.1 -> 18.2.2 (patch bump')));
});

test('a Release-As that does not raise the manifest version fails loudly', () => {
  assert.throws(
    () =>
      check(
        'ci: a change',
        'Release-As: 18.2.1',
        rootPackages,
        manifest,
        gateDeps({ published: fence(KEPT), base: fence(KEPT) }),
      ),
    (err) => err instanceof GateError && /does not increase/.test(err.message),
  );
});

test('a non-releasing change is not gated at all', () => {
  // No baseline read happens (the gate never runs); a report reader that would throw
  // proves the gate is skipped when the projection is no release.
  const deps = {
    ...gateDeps({ published: fence(KEPT), base: fence(KEPT) }),
    readReportAtRef: () => assert.fail('gate must not run'),
  };
  assert.doesNotThrow(() => check('chore: tidy', '', rootPackages, manifest, deps));
});

// ------------------------------------------------- a report gone from the head
// Each case states the refs holding GONE; the listed report stays the same on all sides.

const GONE = { dir: 'packages/studio-sdk/etc', name: 'studio-sdk-gone.api.md' };
const RENAMED_TO = { dir: GONE.dir, name: 'studio-sdk-next.api.md' };
const GONE_FINDING = `${GONE.name}: report was removed`;

const goneDeps = ({ heldAt = ['v18.2.1', 'HEAD^1'], head = null, lines = [] } = {}) => ({
  ...gateDeps({ lines }),
  readReportAtRef: () => fence(KEPT, DROPPED),
  readReportAtWorktree: (_dir, name) => (name === GONE.name ? head : fence(KEPT, DROPPED)),
  listReportsAtRef: (ref) => [
    { ...LISTED, ref },
    ...(heldAt.includes(ref) ? [{ ...GONE, ref }] : []),
  ],
});

test('a fix deleting a published report is refused, naming the report', () => {
  assert.throws(
    () => check('fix: drop an entry point', '', rootPackages, manifest, goneDeps()),
    (err) =>
      err instanceof GateError &&
      err.message.includes(
        "the pull request's release (patch bump) cannot honestly carry this API change",
      ) &&
      err.message.includes(`${GONE_FINDING} from @acme/sdk, so its public entry point is gone`),
  );
});

test('a feat deleting a published report is refused', () => {
  assert.throws(
    () => check('feat: drop an entry point', '', rootPackages, manifest, goneDeps()),
    (err) => err instanceof GateError && err.message.includes(GONE_FINDING),
  );
});

test('a breaking marker carries a published report deleted', () => {
  const lines = [];
  assert.doesNotThrow(() =>
    check('feat!: drop an entry point', '', rootPackages, manifest, goneDeps({ lines })),
  );
  assert.ok(lines.some((line) => line.includes(GONE_FINDING)));
});

test('deleting a report with no published version passes, logged as not counted', () => {
  const lines = [];
  const deps = { ...goneDeps({ heldAt: ['HEAD^1'], lines }), publishedVersionsFor: () => [] };
  assert.doesNotThrow(() => check('fix: drop an entry point', '', rootPackages, manifest, deps));
  assert.ok(
    lines.some((line) => line.includes(NOT_COUNTED_LACKS_PUBLISHED) && line.includes(GONE_FINDING)),
  );
});

test('deleting a report the published tag never held passes, logged as not counted', () => {
  const lines = [];
  const deps = goneDeps({ heldAt: ['HEAD^1'], lines });
  assert.doesNotThrow(() => check('fix: drop an addition', '', rootPackages, manifest, deps));
  assert.ok(
    lines.some((line) => line.includes(NOT_COUNTED_LACKS_PUBLISHED) && line.includes(GONE_FINDING)),
  );
});

test('a report the base already lost does not count against an unrelated fix', () => {
  const lines = [];
  const deps = goneDeps({ heldAt: ['v18.2.1'], lines });
  assert.doesNotThrow(() => check('fix: bump a dependency', '', rootPackages, manifest, deps));
  assert.ok(
    lines.some((line) => line.includes(NOT_COUNTED_LACKS_OWN) && line.includes(GONE_FINDING)),
  );
});

// A release holding `added` as well as what `base` lists at the head.
const listingAdded = (base, added) => (ref) => [
  ...base.listReportsAtRef(ref),
  ...(ref === 'HEAD' ? [{ ...added, ref }] : []),
];

test('a fix renaming a published report is refused for the old name alone', () => {
  const gone = goneDeps();
  const deps = { ...gone, listReportsAtRef: listingAdded(gone, RENAMED_TO) };
  assert.throws(
    () => check('fix: rename an entry point', '', rootPackages, manifest, deps),
    (err) =>
      err instanceof GateError &&
      err.message.includes(GONE_FINDING) &&
      !err.message.includes(RENAMED_TO.name),
  );
});

test('a fix adding a report held by neither side passes', () => {
  const kept = gateDeps({ published: fence(KEPT), base: fence(KEPT) });
  const deps = { ...kept, listReportsAtRef: listingAdded(kept, RENAMED_TO) };
  assert.doesNotThrow(() => check('fix: add an entry point', '', rootPackages, manifest, deps));
});

test('a report kept with a symbol dropped is refused', () => {
  const deps = goneDeps({ heldAt: ['v18.2.1', 'HEAD^1', 'HEAD'], head: fence(KEPT) });
  assert.throws(
    () => check('fix: drop a surface', '', rootPackages, manifest, deps),
    (err) =>
      err instanceof GateError &&
      err.message.includes(`${GONE.name} :: dropped: symbol was removed`),
  );
});
