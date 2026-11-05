// Throwaway git repositories and gate wiring shared by the api-gate test suites: a repository
// tagged v1.0.0 holding a set of reports, a merge checkout over it, and both gates driven against
// such a repository through their injectable seams.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  packageNameForReport,
  publishedBaseline,
  reportAtRef,
  reportAtWorktree,
  reportsAtRef,
  runGate,
} from './api-gate.mjs';
import { check, loadPackages } from './release-label-check.mjs';

export function git(root, ...args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

// A git command that writes a commit, under a throwaway identity.
export function gitCommitting(root, ...args) {
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

export function commit(root, message) {
  git(root, 'add', '.');
  gitCommitting(root, 'commit', '-q', '-m', message);
}

const fence = (body) => '```ts\n' + body + '\n```\n';
export const KEPT_ONLY = fence('export interface Kept {\n  a: number;\n}');
export const WITH_SYMBOL = fence(
  'export interface Kept {\n  a: number;\n}\nexport const dropped: string;',
);

export const writeFile = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

export const manifestOf = (name) => JSON.stringify({ name });

export const gitBackedDeps = (root, lines = []) => ({
  mode: 'label-honesty',
  tags: ['v1.0.0'],
  publishedVersionsFor: () => ['1.0.0'],
  packageNameFor: (report) => packageNameForReport(report, root),
  readReportAtRef: (ref, dir, name) => reportAtRef(ref, dir, name, root),
  listReportsAtRef: (ref) => reportsAtRef(ref, root),
  readReportAtWorktree: (dir, name) => reportAtWorktree(dir, name, root),
  log: (line) => lines.push(line),
});

export const PACKAGES = loadPackages({ packages: { '.': {} } });
export const MANIFEST = { '.': '1.0.0' };

export const REPORTS_AT_TAG = [
  'packages/studio-sdk/etc/studio-sdk.api.md',
  'packages/studio-sdk/etc/studio-sdk-host.api.md',
  'packages/studio-sdk/etc/studio-sdk-testing.api.md',
  'packages/studio-sdk/etc/studio-sdk-schema-form.api.md',
  'packages/api-client/etc/api-client.api.md',
];

// A repository tagged v1.0.0 holding REPORTS_AT_TAG, `packages/extra` and any
// `heldFiles` (path to text), then `onBase` on the base branch, then a merge commit whose topic
// side ran `remove` and whose first parent is the base branch.
export function mergeCheckoutRemoving(remove, heldFiles = {}, onBase) {
  const root = mkdtempSync(join(tmpdir(), 'api-gate-removed-'));
  for (const path of REPORTS_AT_TAG) {
    const packageDir = dirname(dirname(path));
    writeFile(root, path, KEPT_ONLY);
    writeFile(root, `${packageDir}/package.json`, manifestOf(`@acme/${packageDir}`));
  }
  writeFile(root, 'packages/studio-sdk/etc/gone.api.md', KEPT_ONLY);
  writeFile(root, 'packages/extra/etc/extra.api.md', KEPT_ONLY);
  writeFile(root, 'packages/extra/package.json', manifestOf('@acme/extra'));
  for (const [path, text] of Object.entries(heldFiles)) writeFile(root, path, text);
  git(root, 'init', '-q');
  git(root, 'branch', '-M', 'base');
  commit(root, 'reports');
  git(root, 'tag', 'v1.0.0');
  onBase?.(root);
  git(root, 'checkout', '-q', '-b', 'topic');
  remove(root);
  commit(root, 'remove');
  git(root, 'checkout', '-q', 'base');
  writeFile(root, 'unrelated.txt', 'x\n');
  commit(root, 'unrelated');
  gitCommitting(root, 'merge', '-q', '--no-ff', '-m', 'merge', 'topic');
  return root;
}

export function gateOverReports(root, deps = {}) {
  const gitDeps = { ...gitBackedDeps(root), ...deps };
  return {
    tagGate: (version) =>
      runGate(version, publishedBaseline(version, gitDeps), {
        mode: gitDeps.mode,
        log: gitDeps.log,
      }),
    labelCheck: (title) => check(title, '', PACKAGES, MANIFEST, gitDeps),
  };
}
