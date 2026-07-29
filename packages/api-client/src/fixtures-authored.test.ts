/**
 * Authored fixtures (Class 2) — zod-validation.
 *
 * Unlike the captured Class-1 fixtures, these are hand-authored: MUTATION responses
 * (POST/DELETE/PATCH, no live capture) and REDACTED stand-ins for the secret-bearing
 * GETs the UI reads. Both classes are pinned to the canonical `@tai42/api-client`
 * schemas here, so a fixture drifting from its schema fails CI.
 *
 * The redacted set covers EXCLUDED-from-capture paths BY DESIGN — so we also assert
 * every redacted fixture's path is on the excluded list (keeping the two aligned),
 * and that no redacted value looks like committed secret material.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZodType } from 'zod';

import { MUTATION_FIXTURES, REDACTED_FIXTURES, isExcluded } from '../fixtures/contract.mjs';
import * as schemas from './schemas';

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const schemaMap = schemas as unknown as Record<string, unknown>;

/** Load a fixture file and parse it with its named schema, throwing loudly on drift. */
function parseFixture(name: string, file: string, schemaName: string): void {
  const schema = schemaMap[schemaName];
  if (schema === undefined) throw new Error(`schema ${schemaName} does not exist`);
  if (!(schema instanceof ZodType)) throw new Error(`schema ${schemaName} is not a zod schema`);
  const raw: unknown = JSON.parse(readFileSync(resolve(fixturesDir, file), 'utf8'));
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`fixture ${name} (${file}) failed ${schemaName}: ${result.error.message}`);
  }
}

describe('mutation fixtures validate against their zod schemas', () => {
  // Both describe blocks iterate their fixture array, so an emptied array would
  // silently yield zero tests — assert the set is non-empty so a dropped fixture
  // set fails loudly rather than passing vacuously.
  it('the mutation fixture set is non-empty', () => {
    expect(MUTATION_FIXTURES.length).toBeGreaterThan(0);
  });

  for (const fixture of MUTATION_FIXTURES) {
    it(`${fixture.name} validates with schemas.${fixture.schema}`, () => {
      parseFixture(fixture.name, fixture.file, fixture.schema);
    });
  }
});

describe('redacted fixtures validate against their zod schemas', () => {
  it('the redacted fixture set is non-empty', () => {
    expect(REDACTED_FIXTURES.length).toBeGreaterThan(0);
  });

  for (const fixture of REDACTED_FIXTURES) {
    it(`${fixture.name} validates with schemas.${fixture.schema}`, () => {
      parseFixture(fixture.name, fixture.file, fixture.schema);
    });
  }

  it('every redacted fixture stands in for an EXCLUDED-from-capture endpoint', () => {
    for (const fixture of REDACTED_FIXTURES) {
      expect(isExcluded(fixture.path)).toBe(true);
    }
  });

  it('no authored fixture carries an obvious secret token', () => {
    // Cheap regression net: a long opaque token or a known provider key prefix
    // slipping into an authored fixture is exactly what this class must never ship.
    // Mutation fixtures are equally secret-capable, so scan both sets.
    const secretLike = new RegExp(
      [
        '\\b(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,}|xox[baprs]-[A-Za-z0-9-]{10,})\\b',
        'AIza[0-9A-Za-z_-]{20,}',
        'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
        '://[^/\\s:@]+:[^/\\s:@]+@',
      ].join('|'),
    );
    for (const fixture of [...MUTATION_FIXTURES, ...REDACTED_FIXTURES]) {
      const text = readFileSync(resolve(fixturesDir, fixture.file), 'utf8');
      expect(text).not.toMatch(secretLike);
    }
  });
});
