/** Access-policy validation, version and rollback response schemas. */
import { z } from 'zod';

import { policyBody } from './served';

/**
 * `POST /api/auth/validate-condition` — the fail-closed jq guard. `ok` is the
 * compile/render result; `result` is the boolean of a sample evaluation, or
 * `null` when no `sample_context` was supplied (compile-only). A broken condition
 * is a `400 {error}` surfaced by the transport, NEVER a false `ok` — so a
 * syntactically-broken condition can be caught before it locks a key out. A drift
 * throws `ApiSchemaError`.
 */
export const validateConditionResult = z.object({
  ok: z.boolean(),
  result: z.boolean().nullable(),
});
export type ValidateConditionResult = z.infer<typeof validateConditionResult>;

/**
 * One immutable policy version row
 * (`GET /api/auth/api-keys/{user_id}/policy/versions`). `is_current` flags the
 * active pointer; `tags` is the generic per-version label list (kind-agnostic),
 * mirroring the preset version shape.
 */
export const policyVersion = z.object({
  version: z.number(),
  body: policyBody,
  tags: z.array(z.string()),
  created_at: z.string(),
  is_current: z.boolean(),
});
export type PolicyVersion = z.infer<typeof policyVersion>;

export const policyVersionList = z.array(policyVersion);

/** `POST /api/auth/api-keys/{user_id}/policy/rollback` — the re-pointed version. */
export const policyRollback = z.object({ user_id: z.string(), active_version: z.number() });
