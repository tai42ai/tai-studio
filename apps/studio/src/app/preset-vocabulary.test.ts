/**
 * The tai42 platform stays agnostic to the engines and flows that merely consume
 * it: Studio source must carry no consumer (flows-engine) vocabulary. The saved-
 * tool feature is the platform's "preset"; the consumer terms this guard bans —
 * listed, each assembled from parts, in BANNED_PHRASES — belong to a flow's own
 * configuration, never to the host.
 *
 * This is a plain in-repo SOURCE SCAN, deliberately separate from the
 * secret-sourced client-term guard (`banned-terms.test.ts`): the needles here are
 * a fixed platform-vocabulary rule, not a runtime-loaded client list. Each phrase
 * is assembled from parts so no contiguous literal appears in this file, matched at
 * word boundaries (so an unrelated identifier that merely embeds a phrase is not a
 * hit), and this file excludes itself from the scan, so the guard is never its own
 * false positive.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const selfRelPath = fileURLToPath(import.meta.url).slice(resolve(repoRoot).length + 1);

/** Banned consumer phrases, each assembled from parts so none is a literal here. */
const BANNED_PHRASES = [
  ['custom', 'node'].join(' '),
  ['babel', 'fish'].join(''),
  ['router', 'loop'].join(' '),
  ['flow', 'views'].join('-'),
];

const RULE_MSG =
  `Studio source is platform-generic and must name no consumer vocabulary — ` +
  `the feature is "preset"; ${BANNED_PHRASES.map((p) => `"${p}"`).join(', ')} are consumer terms`;

/** Source roots the platform-vocabulary rule governs, as repo-relative prefixes. */
const SCANNED_ROOTS = /^(apps\/studio\/src\/|packages\/[^/]+\/src\/)/;

/** Escapes a phrase for literal use inside a regular expression. */
function escapeForRegExp(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every banned phrase as a case-insensitive word-boundary matcher. */
function phrasePattern(phrase: string): RegExp {
  return new RegExp(`\\b${escapeForRegExp(phrase)}\\b`, 'i');
}

/**
 * Every path git tracks or would track — tracked plus untracked-but-not-ignored —
 * under a governed source root, excluding this guard's own file.
 */
function scannedFiles(): string[] {
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
    .filter((path) => path !== '' && SCANNED_ROOTS.test(path) && path !== selfRelPath);
}

/** Every `path:line:phrase` where a banned phrase sits in a text body. */
function phraseHits(relPath: string, text: string): string[] {
  const hits: string[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    for (const phrase of BANNED_PHRASES) {
      if (phrasePattern(phrase).test(line)) hits.push(`${relPath}:${String(index + 1)}:${phrase}`);
    }
  }
  return hits;
}

/** Hits in one file, skipping binaries (a NUL byte marks a binary body). */
function violationsIn(relPath: string): string[] {
  const bytes = readFileSync(resolve(repoRoot, relPath));
  if (bytes.includes(0)) return [];
  return phraseHits(relPath, bytes.toString('utf8'));
}

const scanned = scannedFiles();

describe('preset vocabulary guard', () => {
  it('scans the governed source roots (a scan that read nothing would pass vacuously)', () => {
    expect(scanned.length).toBeGreaterThan(50);
  });

  it('still detects each banned phrase where one really sits', () => {
    for (const phrase of BANNED_PHRASES) {
      expect(phraseHits('probe', `open the ${phrase.toUpperCase()} here`)).toEqual([
        `probe:1:${phrase}`,
      ]);
      // Word boundary: a phrase buried inside a larger token is not a hit.
      expect(phraseHits('probe', `tai42_${phrase.replace(/[ -]/g, '_')}_x`)).toEqual([]);
    }
  });

  it(`names no consumer vocabulary anywhere in Studio source — ${RULE_MSG}`, () => {
    expect(scanned.flatMap((path) => violationsIn(path))).toEqual([]);
  });
});
