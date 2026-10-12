/**
 * Whether a plugin contribution is visible under a capability projection — the one
 * evaluator every host surface applies to a contribution's optional
 * `requiredCapabilities`. Host-only (`@tai42/studio-sdk/host`).
 */
import type { MeProjection } from '@tai42/api-client';

import { coversAnyRoute, isFullProjection } from '../hooks/useCapabilities';
import type { RequiredCapabilities } from './types';

/**
 * A full projection shows every contribution; an ABSENT requirement renders only for a
 * full projection (safe-by-default); a declared requirement renders when the projection
 * reaches at least one of its routes.
 */
export function contributionCovered(
  projection: MeProjection,
  required: RequiredCapabilities | undefined,
): boolean {
  if (isFullProjection(projection)) return true;
  if (required === undefined) return false;
  return coversAnyRoute(projection, required.routes);
}
