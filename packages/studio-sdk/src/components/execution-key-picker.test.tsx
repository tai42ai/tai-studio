/**
 * The execution-key picker's read states — driven directly with a stub query so the
 * healthy / empty / failed branches are exercised without a data layer. The
 * required-field error is suppressed whenever a louder note (empty / error) already
 * says why, and shown while the list is healthy.
 */
import type { TokensPayload } from '@tai42/api-client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ExecutionKeyPicker,
  type ExecutionKeyQuery,
  isExecutionKeyListEmpty,
} from './execution-key-picker';

const KEY_ERROR = 'An execution key is required.';

function apiKey(overrides: Partial<TokensPayload[number]> = {}): TokensPayload[number] {
  return {
    user_id: 'svc-events',
    description: 'events service key',
    scopes: [],
    policy_data: { key_fingerprint: 'fp-events' },
    ...overrides,
  };
}

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

function renderPicker(q: ExecutionKeyQuery): void {
  render(<ExecutionKeyPicker query={q} value="" onValueChange={vi.fn()} error={KEY_ERROR} />);
}

describe('ExecutionKeyPicker', () => {
  it('lists the pickable keys and shows the required-field error while the list is healthy', () => {
    renderPicker(query({ data: [apiKey()], isSuccess: true }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(KEY_ERROR)).toBeInTheDocument();
  });

  it('suppresses the field error when the list is EMPTY — the note already says why', () => {
    renderPicker(query({ data: [], isSuccess: true }));
    expect(screen.getByText(/No api keys available to run as/)).toBeInTheDocument();
    expect(screen.queryByText(KEY_ERROR)).not.toBeInTheDocument();
  });

  it('suppresses the field error when the list FAILED — the ErrorState already says why', () => {
    renderPicker(query({ isError: true, error: new Error('keys boom') }));
    expect(screen.getByText('keys boom')).toBeInTheDocument();
    expect(screen.queryByText(KEY_ERROR)).not.toBeInTheDocument();
  });
});

describe('isExecutionKeyListEmpty', () => {
  it('is empty only when the read resolved with no keys', () => {
    expect(isExecutionKeyListEmpty(query({ data: [], isSuccess: true }))).toBe(true);
    expect(isExecutionKeyListEmpty(query({ data: [apiKey()], isSuccess: true }))).toBe(false);
    expect(isExecutionKeyListEmpty(query({ isPending: true }))).toBe(false);
  });
});
