/**
 * The browser's coverage mirror agrees with the platform's published conformance
 * vectors: `coversAnyRoute` (the SDK) decides path coverage and pattern reach exactly as
 * the server rules the vectors describe. The vectors are the api-client's generated
 * `servedVectors`; the SDK may not import them at runtime, so the agreement is proven here,
 * where both are in reach.
 */
import { type MeProjection, servedVectors } from '@tai42/api-client';
import { coversAnyRoute } from '@tai42/studio-sdk';
import { describe, expect, it } from 'vitest';

function projection(overrides: Partial<MeProjection>): MeProjection {
  return {
    user_id: 'u',
    owner_user_id: null,
    principal: null,
    admin: false,
    public_resource_id: 'public',
    scopes: [],
    routes: [],
    route_patterns: [],
    sub_mcp: [],
    tools: [],
    agents: [],
    mintable: false,
    ...overrides,
  };
}

describe('the coverage mirror against the published vectors', () => {
  it.each(servedVectors.path_coverage)(
    'a route at $path covers $prefix: $covered',
    ({ path, prefix, covered }) => {
      const p = projection({ routes: [{ path, methods: ['GET'] }] });
      expect(coversAnyRoute(p, [prefix])).toBe(covered);
    },
  );

  it.each(servedVectors.pattern_open_prefix)(
    'the pattern $pattern reaches by its served open prefix $open_prefix',
    ({ pattern, open_prefix }) => {
      const p = projection({ route_patterns: [{ pattern, open_prefix, scope_id: 's' }] });
      if (open_prefix === null) {
        expect(coversAnyRoute(p, ['/api'])).toBe(false);
      } else {
        expect(coversAnyRoute(p, [open_prefix])).toBe(true);
      }
    },
  );
});
