// Unit tests for scripts/release-label-check.mjs — the pre-merge label-honesty check.
// The projection helpers are exercised directly with synthetic titles and bodies; the
// end-to-end `check` is driven through the gate's injectable I/O seams with in-memory
// api-extractor reports, so no git, npm or build is touched. The gate's own
// classification/decision logic has its own suite (api-gate.test.mjs); these tests pin
// the title/body -> bump -> version projection and that a dishonest release is refused.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Bump,
  projectedBump,
  releaseAs,
  projectVersion,
  loadPackages,
  projectedReleaseVersions,
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
  const { versions, label } = projectedReleaseVersions('fix: a fix', '', rootPackages, manifest);
  assert.deepEqual([...versions], ['18.2.2']);
  assert.equal(label, 'patch bump');
});

test('a Release-As footer forces the projected version regardless of the header type', () => {
  const { versions, label } = projectedReleaseVersions(
    'ci: refuse a mislabelled release',
    'Release-As: 19.0.0',
    rootPackages,
    manifest,
  );
  assert.deepEqual([...versions], ['19.0.0']);
  assert.equal(label, 'forced to 19.0.0 by Release-As');
});

test('a non-releasing change projects no version to gate', () => {
  const { versions } = projectedReleaseVersions('chore: tidy', '', rootPackages, manifest);
  assert.equal(versions.size, 0);
});

// ------------------------------------------------------ end-to-end refusal
// A higher tag is unpublished, so the baseline is the published tag below it; the reports
// at HEAD dropped a public symbol against that baseline (a breaking surface change). A
// projected patch cannot honestly carry it and is refused; a projected major carries it
// and passes. Driven through the gate's I/O seams with in-memory reports — no git, npm or
// build.

const fence = (body) => '```ts\n' + body + '\n```';
// The baseline surface carries an exported symbol that HEAD drops — the removal that makes
// the change breaking.
const BASELINE = fence(
  'export interface Kept {\n  a: number;\n}\nexport const marketplaceQuarantinedPlugin: {\n  name: string;\n  reason: string;\n};',
);
const HEAD = fence('export interface Kept {\n  a: number;\n}');

const gateDeps = () => ({
  mode: 'label-honesty',
  tags: ['v18.2.0', 'v18.2.1'],
  publishedVersionsFor: () => ['18.2.0'], // the higher tag is unpublished, so the baseline is 18.2.0
  readReportAtRef: () => BASELINE,
  readReportAtWorktree: () => HEAD,
  log: () => {
    // Silence the gate's per-report output; these tests assert on the outcome.
  },
});

test('a projected patch that drops a public symbol is refused', () => {
  assert.throws(
    () => check('fix(marketplace): drop a surface', '', rootPackages, manifest, gateDeps()),
    (err) =>
      err instanceof GateError &&
      /cannot honestly carry this API change/.test(err.message) &&
      /symbol was removed/.test(err.message),
  );
});

test('the same surface change passes when the release is projected as a major', () => {
  // Release-As forces the major from a ci: title, which projects no release on its own.
  assert.doesNotThrow(() =>
    check(
      'ci: refuse a mislabelled release',
      'Release-As: 19.0.0',
      rootPackages,
      manifest,
      gateDeps(),
    ),
  );
});

test('a non-releasing change is not gated at all', () => {
  // No baseline read happens (the gate never runs); a report reader that would throw
  // proves the gate is skipped when the projection is no release.
  const deps = { ...gateDeps(), readReportAtRef: () => assert.fail('gate must not run') };
  assert.doesNotThrow(() => check('chore: tidy', '', rootPackages, manifest, deps));
});
