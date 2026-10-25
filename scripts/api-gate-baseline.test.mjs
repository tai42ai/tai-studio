// Unit tests for the api-gate's baseline read: the committed report at a release tag,
// read through git from a throwaway repository built in a temporary directory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { reportAtRef } from './api-gate.mjs';

function git(root, ...args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

// A repository with `etc/<name>` committed and tagged `v1.0.0`.
function taggedRepo(name, text) {
  const root = mkdtempSync(join(tmpdir(), 'api-gate-baseline-'));
  mkdirSync(join(root, 'etc'));
  writeFileSync(join(root, 'etc', name), text);
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(
    root,
    '-c',
    'user.name=test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '-m',
    'report',
  );
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
