/** The fire-path submit gate: which execution-key read states block. */
import { describe, expect, it } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import type { TokensPayload } from '@tai42/api-client';

import { fireGateUnsatisfiable, isExecutionKeyListEmpty } from './fire-path-gate';

/** Only the flags + data the gate reads; the rest of `UseQueryResult` is irrelevant. */
function query<T>(state: 'pending' | 'error' | 'success', data?: T): UseQueryResult<T> {
  return {
    isPending: state === 'pending',
    isError: state === 'error',
    isSuccess: state === 'success',
    data,
  } as UseQueryResult<T>;
}

const KEYS = query('success', [{ user_id: 'svc' }] as unknown as TokensPayload);

describe('isExecutionKeyListEmpty', () => {
  // Query retains `data` across a failed refetch, so the non-success cases carry [].
  it('is true only for a RESOLVED empty list, never for a pending or failed one holding []', () => {
    expect(isExecutionKeyListEmpty(query('success', []))).toBe(true);
    expect(isExecutionKeyListEmpty(query('pending', []))).toBe(false);
    expect(isExecutionKeyListEmpty(query('error', []))).toBe(false);
  });
});

describe('fireGateUnsatisfiable — the execution key gates the fire path', () => {
  it('is satisfied only when the key list resolved non-empty', () => {
    expect(fireGateUnsatisfiable(KEYS)).toBe(false);
  });

  it.each(['pending', 'error'] as const)('blocks while the key list is %s', (state) => {
    expect(fireGateUnsatisfiable(query(state))).toBe(true);
  });

  it('blocks when no key exists to bind', () => {
    expect(fireGateUnsatisfiable(query('success', []))).toBe(true);
  });
});
