/** The fire-path submit gate reads the execution-key picker's own predicate. */
import type { TokensPayload } from '@tai42/api-client';
import {
  canHoldExecutionKey,
  type ExecutionKeyBinding,
  type ExecutionKeyQuery,
} from '@tai42/studio-sdk';
import { describe, expect, it, vi } from 'vitest';

import { fireGateUnsatisfiable } from './fire-path-gate';

function query(overrides: Partial<ExecutionKeyQuery>): ExecutionKeyQuery {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

const KEYS = [{ user_id: 'svc' }] as unknown as TokensPayload;
const QUERIES: [string, ExecutionKeyQuery][] = [
  ['pending', query({ isPending: true })],
  ['refused', query({ isError: true, error: { status: 403 } })],
  ['loaded', query({ isSuccess: true, data: KEYS })],
  ['loaded empty', query({ isSuccess: true, data: [] })],
];
const BINDINGS: [string, ExecutionKeyBinding][] = [
  ['pending', { mode: 'pending' }],
  ['unchecked', { mode: 'unchecked', fillKey: '__no_auth__' }],
  ['checked key', { mode: 'checked', own: { userId: 'me', kind: 'key', admin: false } }],
  ['checked account', { mode: 'checked', own: { userId: 'me', kind: 'account', admin: false } }],
];

describe('fireGateUnsatisfiable', () => {
  for (const [queryName, keys] of QUERIES) {
    for (const [bindingName, binding] of BINDINGS) {
      for (const value of ['', 'svc']) {
        it(`a ${queryName} list under a ${bindingName} binding, value "${value}"`, () => {
          expect(fireGateUnsatisfiable(keys, binding, value)).toBe(
            !canHoldExecutionKey(keys, binding, value),
          );
        });
      }
    }
  }
});
