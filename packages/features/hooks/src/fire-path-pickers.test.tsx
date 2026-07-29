/**
 * The execution-key picker driven DIRECTLY — a host-form test cannot reach a
 * failed/empty read while still passing a required-field error.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import { ExecutionKeyPicker } from './ExecutionKeyPicker';
import {
  apiKey,
  renderWithProviders,
  type RenderWithProvidersResult,
  type StubApiClient,
} from './test-utils';

const KEY_ERROR = 'An execution key is required.';

function picker(client: StubApiClient): RenderWithProvidersResult {
  return renderWithProviders(
    <ExecutionKeyPicker value="" onValueChange={vi.fn()} error={KEY_ERROR} />,
    { client },
  );
}

describe('ExecutionKeyPicker — the field error never doubles a louder one', () => {
  it('shows the required-field error while the list is healthy', async () => {
    picker({ listTokensPayload: vi.fn().mockResolvedValue([apiKey()]) });
    expect(await screen.findByText(KEY_ERROR)).toBeInTheDocument();
  });

  it('suppresses it when the list is EMPTY — the note already says why', async () => {
    picker({ listTokensPayload: vi.fn().mockResolvedValue([]) });
    await screen.findByText(/No api keys available to run as/);
    expect(screen.queryByText(KEY_ERROR)).not.toBeInTheDocument();
  });

  it('suppresses it when the list FAILED — the ErrorState already says why', async () => {
    picker({ listTokensPayload: vi.fn().mockRejectedValue(new Error('keys boom')) });
    await screen.findByText('keys boom');
    expect(screen.queryByText(KEY_ERROR)).not.toBeInTheDocument();
  });
});
