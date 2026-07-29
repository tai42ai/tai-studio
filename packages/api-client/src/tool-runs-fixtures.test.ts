/**
 * Hand-authored tool-runs fixtures — zod-validation + secret scan.
 *
 * These are Class-2 fixtures (never captured from a live skeleton): one MUTATION
 * response for `POST /api/tool-runs`, and REDACTED stand-ins for the two
 * secret-bearing GETs (a run record embeds the tool's output; the list carries
 * the run ids). They are validated against THIS module's zod schemas here, and
 * scanned for any secret-like token — the exact material a redacted fixture must
 * never ship.
 *
 * The shared capture-guard machinery (`fixtures/contract.mjs` + the excluded-set
 * test) must additionally register these and hard-exclude `/api/tool-runs` from
 * auto-capture; that wiring is reported to the maintainer (parallel-safe), while
 * this test keeps the authored fixtures pinned to their schema regardless.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ZodTypeAny } from 'zod';

import { toolRunList, toolRunRecord, toolRunSubmitResult } from './tool-runs';

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');

const FIXTURES: readonly { file: string; schema: ZodTypeAny }[] = [
  { file: 'mutations/submit-tool-run.json', schema: toolRunSubmitResult },
  { file: 'redacted/tool-run.json', schema: toolRunRecord },
  { file: 'redacted/tool-runs.json', schema: toolRunList },
];

function readFixture(file: string): { text: string; json: unknown } {
  const text = readFileSync(resolve(fixturesDir, file), 'utf8');
  return { text, json: JSON.parse(text) as unknown };
}

describe('tool-runs authored fixtures', () => {
  for (const { file, schema } of FIXTURES) {
    it(`${file} validates against its schema`, () => {
      const result = schema.safeParse(readFixture(file).json);
      if (!result.success) throw new Error(`${file} failed its schema: ${result.error.message}`);
    });
  }

  it('carries no secret-like token', () => {
    const secretLike = new RegExp(
      [
        '\\b(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,}|xox[baprs]-[A-Za-z0-9-]{10,})\\b',
        'AIza[0-9A-Za-z_-]{20,}',
        'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
        '://[^/\\s:@]+:[^/\\s:@]+@',
      ].join('|'),
    );
    for (const { file } of FIXTURES) {
      expect(readFixture(file).text).not.toMatch(secretLike);
    }
  });

  it('the run record redacts its result (no live tool output committed)', () => {
    const record = toolRunRecord.parse(readFixture('redacted/tool-run.json').json);
    expect(record.result).toBe('***');
  });
});
