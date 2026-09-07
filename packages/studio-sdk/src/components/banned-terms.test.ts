/**
 * The client-neutrality rule, enforced by a repository-wide SOURCE SCAN.
 *
 * The platform is generic: no tracked source may name a specific client, product,
 * deployed flow, or business-domain scenario. The ban list is DATA, never source:
 * this file carries the scan MECHANISM with no term baked in. Entries load at
 * runtime from, in order, the `TAI_BANNED_TERMS` environment variable
 * (comma-separated, whitespace-trimmed, empty entries dropped) else the local
 * untracked file `~/.config/tai42/banned-terms.txt` (one entry per line, `#`
 * comments allowed). Entry grammar: a plain entry is a word-boundary term (matched
 * case-insensitively); a `marker:` prefix is a case-sensitive substring marker and
 * `marker-ci:` a case-insensitive one, for tokens that do not sit on word
 * boundaries.
 *
 * The scan reads every TEXT file git tracks or would track — tracked plus
 * untracked-but-not-ignored — so a banned term in a NEW file is caught before it is
 * committed, not only after, and reports every hit as `path:line:term`.
 *
 * With no list available the guard is never a silent green: it fails under CI and
 * skips visibly locally — and on a Dependabot run, which GitHub never grants the
 * secret list, it skips visibly like the local case rather than fail. All carry the
 * same message.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const NO_LIST_MSG =
  'no banned-terms list: set TAI_BANNED_TERMS or ~/.config/tai42/banned-terms.txt';
const LOCAL_LIST = resolve(homedir(), '.config/tai42/banned-terms.txt');

interface Marker {
  needle: string;
  caseInsensitive: boolean;
}

/** The raw, trimmed entries from the environment variable or the local file. */
function rawEntries(): string[] {
  const env = process.env.TAI_BANNED_TERMS;
  if (env !== undefined && env.trim() !== '') {
    return env.split(',').map((entry) => entry.trim());
  }
  if (existsSync(LOCAL_LIST)) {
    return readFileSync(LOCAL_LIST, 'utf8')
      .split('\n')
      .map((line) => (line.split('#', 1)[0] ?? '').trim());
  }
  return [];
}

/** Word-boundary terms and substring markers, parsed from the raw entries. */
function loadBanned(): { terms: string[]; markers: Marker[] } {
  const terms: string[] = [];
  const markers: Marker[] = [];
  for (const entry of rawEntries()) {
    if (entry === '') continue;
    if (entry.startsWith('marker-ci:')) {
      markers.push({ needle: entry.slice('marker-ci:'.length), caseInsensitive: true });
    } else if (entry.startsWith('marker:')) {
      markers.push({ needle: entry.slice('marker:'.length), caseInsensitive: false });
    } else {
      terms.push(entry);
    }
  }
  return { terms, markers };
}

/** Escapes a term for literal use inside a regular expression. */
function escapeForRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The banned terms at word boundaries, case-insensitive, global so every hit on a
 * line is reported. Rebuilt per line so `lastIndex` never carries across lines.
 */
function bannedTermPattern(terms: string[]): RegExp {
  return new RegExp(`\\b(?:${terms.map(escapeForRegExp).join('|')})\\b`, 'gi');
}

/**
 * Every path git tracks or would track — tracked (`git ls-files`) plus
 * untracked-but-not-ignored (`git ls-files --others --exclude-standard`) — as
 * repo-relative strings.
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

/** Every banned-term and marker hit in one text body, as `path:line:term` strings. */
function lineHits(relPath: string, text: string, terms: string[], markers: Marker[]): string[] {
  const hits: string[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (terms.length > 0) {
      for (const match of line.matchAll(bannedTermPattern(terms))) {
        hits.push(`${relPath}:${String(index + 1)}:${match[0].toLowerCase()}`);
      }
    }
    for (const { needle, caseInsensitive } of markers) {
      const haystack = caseInsensitive ? line.toLowerCase() : line;
      const target = caseInsensitive ? needle.toLowerCase() : needle;
      if (haystack.includes(target)) hits.push(`${relPath}:${String(index + 1)}:${needle}`);
    }
  }
  return hits;
}

/** Every hit in one tracked file, skipping binary files. */
function violationsIn(relPath: string, terms: string[], markers: Marker[]): string[] {
  const bytes = readFileSync(resolve(repoRoot, relPath));
  if (isBinary(bytes)) return [];
  return lineHits(relPath, bytes.toString('utf8'), terms, markers);
}

const { terms, markers } = loadBanned();
const noList = terms.length === 0 && markers.length === 0;
const ci = process.env.CI !== undefined && process.env.CI !== '';
// A Dependabot CI run never receives repository secrets (GitHub scopes them away),
// so TAI_BANNED_TERMS is unavoidably empty there; the guard skips visibly like a
// local run rather than red on a list the run cannot be given.
const dependabot = process.env.GITHUB_ACTOR === 'dependabot[bot]';
const scanned = worktreeFiles();

describe('banned terms guard', () => {
  // When no list is configured the guard is never a silent green: under CI this test
  // runs and throws; locally, and on a Dependabot run that cannot be given the list,
  // it is skipped so the absence is visible, not hidden.
  it.skipIf(noList && (!ci || dependabot))('a banned-terms list is configured', () => {
    if (noList) throw new Error(NO_LIST_MSG);
  });

  describe.skipIf(noList)('source scan', () => {
    it('scans the tracked tree (a scan that read nothing would pass vacuously)', () => {
      expect(scanned.length).toBeGreaterThan(500);
    });

    it('still detects a banned term where one really sits', () => {
      // Controls are derived from the loaded terms, so no term is embedded here.
      for (const term of terms) {
        expect([...`a ${term} here`.matchAll(bannedTermPattern(terms))].map((m) => m[0])).toContain(
          term,
        );
        expect([...`x ${term} y`.matchAll(bannedTermPattern(terms))].length).toBeGreaterThan(0);
        // Word boundary: a term buried inside a larger word is not a hit.
        expect([...`pre${term}ing`.matchAll(bannedTermPattern(terms))]).toEqual([]);
      }
    });

    it('still detects each substring marker', () => {
      for (const { needle, caseInsensitive } of markers) {
        const probe = `before ${needle} after`;
        expect(lineHits('probe', probe, terms, markers)).toContain(`probe:1:${needle}`);
        if (caseInsensitive) {
          expect(lineHits('probe', probe.toUpperCase(), terms, markers)).toContain(
            `probe:1:${needle}`,
          );
        }
      }
    });

    it('names no banned term anywhere in the tracked source', () => {
      expect(scanned.flatMap((path) => violationsIn(path, terms, markers))).toEqual([]);
    });
  });
});
