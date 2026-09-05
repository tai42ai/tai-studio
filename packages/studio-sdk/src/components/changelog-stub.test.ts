/**
 * The changelog invariant, enforced by a repository-wide SOURCE SCAN.
 *
 * Every CHANGELOG.md the tree carries is the Keep-a-Changelog header with one
 * empty Unreleased section — byte-identical to {@link CANONICAL_STUB}. The scan
 * reads every CHANGELOG.md git tracks or would track — tracked plus untracked-
 * but-not-ignored — so a divergent CHANGELOG.md in a NEW file is caught before it
 * is committed, not only after.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** The Keep-a-Changelog header with one empty Unreleased section, byte-exact. */
const CANONICAL_STUB = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
`;

/**
 * Every path git tracks or would track — tracked (`git ls-files`) plus
 * untracked-but-not-ignored (`git ls-files --others --exclude-standard`) — as
 * repo-relative strings, so a divergent CHANGELOG.md in a NEW file is caught
 * before it is committed, not only after.
 */
function worktreeFiles(): string[] {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
  const untracked = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
  return [tracked, untracked]
    .flatMap((out) => out.toString('utf8').split('\0'))
    .filter((path) => path !== '');
}

const changelogs = worktreeFiles().filter((path) => basename(path) === 'CHANGELOG.md');

describe('changelog stub', () => {
  it('scans the tree (a scan that found no CHANGELOG.md would pass vacuously)', () => {
    expect(changelogs.length).toBeGreaterThan(0);
  });

  it('is the Keep-a-Changelog header with one empty Unreleased section, everywhere', () => {
    const divergent = changelogs.filter(
      (path) => readFileSync(resolve(repoRoot, path), 'utf8') !== CANONICAL_STUB,
    );
    expect(divergent).toEqual([]);
  });
});
