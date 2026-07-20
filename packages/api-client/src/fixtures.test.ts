/**
 * Fixtures guard + zod-validation.
 *
 * GUARD: the capture set must REFUSE every secret-bearing endpoint. env-config and
 * the connector endpoints are excluded outright; adding one to the capture set must
 * fail `assertCaptureSetSafe` — the regression this pins against is a live secret
 * committed into the PUBLIC fixtures.
 *
 * ZOD: every captured fixture (captured from the live e2e boot skeleton by
 * `pnpm fixtures:refresh`) must validate against the api-client schema that consumes
 * that endpoint — so a skeleton response-shape drift is caught in CI.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ZodTypeAny } from 'zod';

import {
  FIXTURE_ENDPOINTS,
  EXCLUDED_FROM_CAPTURE,
  isExcluded,
  assertCaptureSetSafe,
} from '../fixtures/contract.mjs';
import * as schemas from './schemas';

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');

describe('fixtures capture guard', () => {
  it('excludes env-config and every connector endpoint outright', () => {
    expect(EXCLUDED_FROM_CAPTURE).toContain('/api/config/env');
    expect(isExcluded('/api/config/env')).toBe(true);
    expect(isExcluded('/api/connectors/providers')).toBe(true);
    expect(isExcluded('/api/connectors/connections/abc')).toBe(true);
  });

  it('never captures an excluded endpoint (the current capture set is safe)', () => {
    for (const endpoint of FIXTURE_ENDPOINTS) {
      expect(isExcluded(endpoint.path)).toBe(false);
    }
    expect(() => {
      assertCaptureSetSafe();
    }).not.toThrow();
  });

  it('FAILS loudly if a secret-bearing endpoint is added to the capture set', () => {
    // Simulate the regression: adding env-config (a live secret) to the capture set.
    const poisoned = [
      ...FIXTURE_ENDPOINTS,
      { name: 'env', path: '/api/config/env', schema: 'envConfig' },
    ];
    expect(() => {
      assertCaptureSetSafe(poisoned);
    }).toThrow(/EXCLUDED/);

    // And a connector endpoint (excluded outright).
    const poisonedConnector = [
      ...FIXTURE_ENDPOINTS,
      { name: 'providers', path: '/api/connectors/providers', schema: 'providers' },
    ];
    expect(() => {
      assertCaptureSetSafe(poisonedConnector);
    }).toThrow(/EXCLUDED/);
  });
});

describe('captured fixtures validate against their zod schemas', () => {
  const schemaMap = schemas as unknown as Record<string, ZodTypeAny>;

  for (const endpoint of FIXTURE_ENDPOINTS) {
    it(`${endpoint.name} validates with schemas.${endpoint.schema}`, () => {
      const schema = schemaMap[endpoint.schema];
      if (schema === undefined) throw new Error(`schema ${endpoint.schema} does not exist`);
      const raw: unknown = JSON.parse(
        readFileSync(resolve(fixturesDir, `${endpoint.name}.json`), 'utf8'),
      );
      const result = schema.safeParse(raw);
      if (!result.success) {
        throw new Error(
          `fixture ${endpoint.name}.json failed ${endpoint.schema}: ${result.error.message}`,
        );
      }
    });
  }
});
