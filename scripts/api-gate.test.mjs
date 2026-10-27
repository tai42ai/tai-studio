// Unit tests for scripts/api-gate.mjs — the release API-diff gate's policy: the bump
// class, the allowed bump set per mode and version, the pass/fail decision, and the
// published baseline tag. Pure helpers only: no git, no network, no build. The report
// parser and the surface diff the gate judges have their own suites
// (api-report-parse.test.mjs, api-surface-diff.test.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bumpClass, allowedBumps, gatePasses, previousPublishedTag } from './api-gate.mjs';
import { GateError } from './gate-error.mjs';

// ---------------------------------------------------------------- bump class

test('bumpClass classifies major/minor/patch', () => {
  assert.equal(bumpClass('1.0.0', '2.0.0'), 'major');
  assert.equal(bumpClass('1.0.0', '1.1.0'), 'minor');
  assert.equal(bumpClass('1.0.0', '1.0.1'), 'patch');
  assert.equal(bumpClass('0.1.0', '0.2.0'), 'minor');
});

test('bumpClass fails loudly on a non-increasing version', () => {
  assert.throws(() => bumpClass('1.1.0', '1.0.0'), GateError);
  assert.throws(() => bumpClass('1.0.0', '1.0.0'), GateError);
});

// --------------------------------------------------------------- allowed set

test('allowedBumps is version-aware in label-honesty, major-only in strict', () => {
  assert.deepEqual([...allowedBumps('label-honesty', 1)].sort(), ['major']);
  assert.deepEqual([...allowedBumps('label-honesty', 2)].sort(), ['major']);
  assert.deepEqual([...allowedBumps('label-honesty', 0)].sort(), ['major', 'minor']);
  assert.deepEqual([...allowedBumps('strict', 0)].sort(), ['major']);
  assert.deepEqual([...allowedBumps('strict', 1)].sort(), ['major']);
});

test('allowedBumps fails loudly on an unknown mode', () => {
  assert.throws(() => allowedBumps('bogus', 1), GateError);
});

// ----------------------------------------------------------- decision matrix

test('gate decision matrix', () => {
  // A >=1.0 package sneaking a breaking change into a minor — the incident the
  // gate must catch — fails; the honest bumps pass.
  assert.equal(gatePasses('label-honesty', '1.0.0', '1.1.0', true).passes, false);
  assert.equal(gatePasses('label-honesty', '0.1.0', '0.2.0', true).passes, true);
  assert.equal(gatePasses('label-honesty', '1.0.0', '2.0.0', true).passes, true);
  assert.equal(gatePasses('strict', '0.1.0', '0.2.0', true).passes, false);
  assert.equal(gatePasses('strict', '1.0.0', '2.0.0', true).passes, true);
  // No breaking surface change always passes, whatever the bump.
  assert.equal(gatePasses('label-honesty', '1.0.0', '1.0.1', false).passes, true);
  assert.equal(gatePasses('strict', '0.1.0', '0.1.1', false).passes, true);
});

test('a failing reason names mode, version class, computed class and bump', () => {
  const { reason } = gatePasses('label-honesty', '1.0.0', '1.1.0', true);
  assert.match(reason, /mode=label-honesty/);
  assert.match(reason, /version class=>=1\.0/);
  assert.match(reason, /computed allowed bump\(s\)=major/);
  assert.match(reason, /bump=minor/);
});

test('the allowed set renders comma-joined and sorted, no brackets or quotes', () => {
  // A 0.x package breaking in a patch: allowed={minor,major}, so the multi-element
  // rendering is exercised — pinned to the exact "major,minor" form (parity with
  // the Python gate), never a bracketed/quoted list.
  const { reason } = gatePasses('label-honesty', '0.1.0', '0.1.1', true);
  assert.match(reason, /computed allowed bump\(s\)=major,minor, bump=patch/);
  assert.doesNotMatch(reason, /[[\]']/);
});

// ------------------------------------------------------ published baseline tag
// The baseline is the newest surface a consumer can install: the highest v* tag
// below the target whose version is PUBLISHED on npm. A tag whose publish was
// refused still exists in git but is not published, so it must be skipped.

test('the newest tag being unpublished is skipped for the highest published tag below the target', () => {
  const tags = ['v16.0.0', 'v16.0.1', 'v16.1.0'];
  const published = ['16.0.0', '16.0.1']; // v16.1.0 tagged but refused, never published
  assert.equal(previousPublishedTag('17.0.0', tags, published), 'v16.0.1');
  assert.equal(previousPublishedTag('16.2.0', tags, published), 'v16.0.1');
});

test('no published version below the target yields null', () => {
  assert.equal(previousPublishedTag('1.0.0', ['v0.1.0', 'v0.2.0'], []), null);
  assert.equal(previousPublishedTag('1.0.0', [], ['0.9.0']), null);
});

test('published versions at or above the target are ignored', () => {
  const tags = ['v1.0.0', 'v2.0.0', 'v3.0.0'];
  const published = ['1.0.0', '2.0.0', '3.0.0'];
  // Choosing a baseline for 2.0.0 never picks 2.0.0 or 3.0.0, only the highest below.
  assert.equal(previousPublishedTag('2.0.0', tags, published), 'v1.0.0');
});

test('non-semver tags are ignored', () => {
  const tags = ['v1.0.0', 'nightly', 'v1.1', 'release-2', 'v1.2.0'];
  const published = ['1.0.0', '1.2.0'];
  assert.equal(previousPublishedTag('2.0.0', tags, published), 'v1.2.0');
});
