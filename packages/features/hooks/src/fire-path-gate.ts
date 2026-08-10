/** The fire-path form submit gate. */
import type { UseQueryResult } from '@tanstack/react-query';
import type { TokensPayload } from '@tai42/api-client';

/** Resolved, and holding no key at all. */
export function isExecutionKeyListEmpty(keys: UseQueryResult<TokensPayload>): boolean {
  return keys.isSuccess && keys.data.length === 0;
}

/** Unsatisfiable when no execution key is pickable (pending, failed, or empty). */
export function fireGateUnsatisfiable(keys: UseQueryResult<TokensPayload>): boolean {
  return keys.isPending || keys.isError || isExecutionKeyListEmpty(keys);
}
