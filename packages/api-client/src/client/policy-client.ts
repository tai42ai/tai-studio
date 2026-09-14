/** Access-policy validation, versioning and rollback sub-client. */
import * as s from '../schemas';
import { encodeSegment } from '../http';
import type { Transport } from './transport';

/**
 * Body for the fail-closed jq guard (POST `/api/auth/validate-condition`). The guard
 * compile-checks the inline jq `condition` the author typed. `sample_context` is a
 * `JqAuthContext`-shaped sample; when present the guard also evaluates the condition
 * against it and returns the boolean `result` (else `result` is `null`).
 */
export interface ValidateConditionBody {
  readonly condition?: string;
  readonly sample_context?: Record<string, unknown>;
}

export function policyClient(t: Transport) {
  const { req } = t;
  return {
    // The fail-closed jq guard: compiles (and, with `sample_context`, evaluates) a
    // condition without persisting anything, so a broken condition is caught at
    // author time instead of locking a key out at enforcement. A broken condition
    // is a 400 the transport throws — never a false-positive `ok`.
    validateCondition: (body: ValidateConditionBody) =>
      req('/api/auth/validate-condition', s.validateConditionResult, { method: 'POST', body }),
    // The user's append-only policy version history (each row's `is_current`
    // derived from the active pointer). SECRET-ADJACENT — the body carries the raw
    // condition, so its fixtures are hand-authored.
    listPolicyVersions: (userId: string, signal?: AbortSignal) =>
      req(`/api/auth/api-keys/${encodeSegment(userId)}/policy/versions`, s.policyVersionList, {
        signal,
      }),
    // Re-point the enforced policy to a prior version; returns the re-pointed
    // active version. Enforcement follows on cache invalidation.
    rollbackPolicy: (userId: string, version: number) =>
      req(`/api/auth/api-keys/${encodeSegment(userId)}/policy/rollback`, s.policyRollback, {
        method: 'POST',
        body: { version },
      }),
  };
}
