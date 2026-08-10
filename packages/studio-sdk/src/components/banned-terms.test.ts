/**
 * The client-neutrality rule, enforced by a repository-wide SOURCE SCAN.
 *
 * The platform is generic: no tracked source may name a specific client, product
 * or deployed flow. The banned terms below (see {@link BANNED_TERMS}) are client
 * product names — their presence anywhere in the tree is a leak of use-case
 * identity into a platform that must read the same for every flow ever deployed.
 *
 * The scan reads every TEXT file git tracks or would track — tracked plus
 * untracked-but-not-ignored — matching each banned term case-insensitively at word
 * boundaries, and reports every hit as `path:line:term`. Scanning the untracked-
 * but-not-ignored files too means a banned term in a NEW file is caught before it
 * is committed, not only after. This file is the one exclusion: it carries the
 * banned words as data, so scanning it would report itself.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * The client product names the platform must never carry. Each is a deployed
 * flow's own name, not a generic mechanism.
 */
const BANNED_TERMS = ['concierge', 'bookinguru', 'bookin-guru', 'bookin_guru'] as const;

/** This gate's own path, the sole file the scan skips: it holds the terms as data. */
const SELF = relative(repoRoot, fileURLToPath(import.meta.url));

/** Escapes a term for literal use inside a regular expression. */
function escapeForRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One banned term at a word boundary, case-insensitive, global so every hit on a
 * line is reported. Rebuilt per line so `lastIndex` never carries across lines.
 */
function bannedTermPattern(): RegExp {
  return new RegExp(`\\b(?:${BANNED_TERMS.map(escapeForRegExp).join('|')})\\b`, 'gi');
}

/**
 * Every path git tracks or would track — tracked (`git ls-files`) plus
 * untracked-but-not-ignored (`git ls-files --others --exclude-standard`) — as
 * repo-relative strings, so a banned term in a NEW file is caught before it is
 * committed, not only after.
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

/** A file is binary when its bytes carry a NUL — such files are not scanned. */
function isBinary(bytes: Buffer): boolean {
  return bytes.includes(0);
}

/** Every banned-term hit in one file, as `path:line:term` strings. */
function violationsIn(relPath: string): string[] {
  const bytes = readFileSync(resolve(repoRoot, relPath));
  if (isBinary(bytes)) return [];
  const hits: string[] = [];
  const lines = bytes.toString('utf8').split('\n');
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(bannedTermPattern())) {
      hits.push(`${relPath}:${String(index + 1)}:${match[0].toLowerCase()}`);
    }
  }
  return hits;
}

const scanned = worktreeFiles().filter((path) => path !== SELF);

describe('banned client terms', () => {
  it('scans the tracked tree (a scan that read nothing would pass vacuously)', () => {
    expect(scanned.length).toBeGreaterThan(500);
    expect(scanned).not.toContain(SELF);
  });

  it('still detects a banned term where one really sits', () => {
    // Positive controls: without them a broken pattern would leave the sweep below
    // green with nothing to catch. Word-boundary and case-insensitivity, proven.
    expect([...'a Concierge here'.matchAll(bannedTermPattern())].map((m) => m[0])).toEqual([
      'Concierge',
    ]);
    for (const term of BANNED_TERMS) {
      expect([term, [...`x ${term} y`.matchAll(bannedTermPattern())].length]).toEqual([term, 1]);
    }
    // Word boundary: a term buried inside a larger word is not a hit.
    expect([...'preconciergeing'.matchAll(bannedTermPattern())]).toEqual([]);
  });

  it('names no client product anywhere in the tracked source', () => {
    expect(scanned.flatMap(violationsIn)).toEqual([]);
  });
});
