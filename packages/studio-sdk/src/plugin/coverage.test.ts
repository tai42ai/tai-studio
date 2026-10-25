import type { MeProjection } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import { contributionCovered } from './coverage';

function projection(overrides: Partial<MeProjection> = {}): MeProjection {
  return {
    access_control_enabled: true,
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

describe('contributionCovered', () => {
  it('a full projection shows every contribution', () => {
    expect(contributionCovered(projection({ admin: true }), undefined)).toBe(true);
    expect(contributionCovered(projection({ admin: true }), { routes: ['/api/x'] })).toBe(true);
  });

  it('an absent requirement renders only for a full projection', () => {
    expect(contributionCovered(projection(), undefined)).toBe(false);
  });

  it('a declared requirement renders when the projection reaches one of its routes', () => {
    const scoped = projection({ routes: [{ path: '/api/synthetic/gates', methods: ['GET'] }] });
    expect(contributionCovered(scoped, { routes: ['/api/synthetic/gates'] })).toBe(true);
    expect(contributionCovered(scoped, { routes: ['/api/other'] })).toBe(false);
  });
});
