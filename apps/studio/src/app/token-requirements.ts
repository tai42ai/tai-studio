/**
 * The declarative capability map behind shell nav filtering: each feature token
 * names the API surface a session must be able to reach for that nav entry to be
 * shown. The UI is a projection of the caller's capabilities — a token renders
 * only when the projection covers its backing route(s), and the server stays the
 * sole authority (nav hides, direct URLs still render, 403s stay loud).
 *
 * The map is exhaustively `satisfies Record<FeatureToken, TokenRequirement>`, so a
 * new feature token FAILS THE BUILD until it is classified here — there is no
 * silent always-on default.
 */
import type { MeProjection } from '@tai42/api-client';
import { coversAnyRoute, isFullProjection, type RequiredCapabilities } from '@tai42/studio-sdk';

import { type FeatureToken } from './routes';

/**
 * What a feature token needs to appear in the nav: `'always'` for a token that
 * self-limits server-side (settings shows only the caller's own keys), or an
 * `anyOf` list of route-path prefixes — the token renders when the projection
 * reaches at least one of them.
 */
export type TokenRequirement = 'always' | { readonly anyOf: readonly string[] };

/**
 * Token → the capability it requires. Prefixes are matched against the
 * projection's `routes[].path` (and pattern rows) by {@link coversAnyRoute}, so
 * `/api/tools` covers `/api/tools`, `/api/tools/tags`, and every deeper path.
 */
export const TOKEN_REQUIREMENTS = {
  tools: { anyOf: ['/api/tools'] },
  agents: { anyOf: ['/api/agents'] },
  presets: { anyOf: ['/api/presets'] },
  extensions: { anyOf: ['/api/extensions'] },
  interactions: { anyOf: ['/api/interactions'] },
  notifications: { anyOf: ['/api/notifications'] },
  connectors: { anyOf: ['/api/connectors'] },
  hooks: { anyOf: ['/api/hooks'] },
  templates: { anyOf: ['/api/templates'] },
  storage: { anyOf: ['/api/storage'] },
  manifest: { anyOf: ['/api/manifest'] },
  settings: 'always',
  system: { anyOf: ['/api/system'] },
  scheduling: { anyOf: ['/api/schedules'] },
  observability: { anyOf: ['/api/observability'] },
  marketplace: { anyOf: ['/api/marketplace'] },
} satisfies Record<FeatureToken, TokenRequirement>;

/**
 * Whether a feature token is reachable under a projection. A full projection
 * (admin / gate-off local dev) shows every token; a scoped session shows a token
 * only when the projection covers its backing route (or it is `'always'`).
 */
export function tokenCovered(projection: MeProjection, token: FeatureToken): boolean {
  if (isFullProjection(projection)) return true;
  const requirement = TOKEN_REQUIREMENTS[token];
  if (requirement === 'always') return true;
  return coversAnyRoute(projection, requirement.anyOf);
}

/**
 * Whether a plugin contribution is visible under a projection — the same
 * evaluator, applied to a contribution's optional `requiredCapabilities`. A full
 * projection shows every contribution; ABSENT capabilities render only for a full
 * projection (safe-by-default for every existing plugin); a declared requirement
 * renders when the projection covers at least one of its routes.
 */
export function contributionCovered(
  projection: MeProjection,
  required: RequiredCapabilities | undefined,
): boolean {
  if (isFullProjection(projection)) return true;
  if (required === undefined) return false;
  return coversAnyRoute(projection, required.routes);
}
