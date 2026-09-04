/**
 * The admin failed-delivery view's state machine: loading, the empty (all-delivered)
 * state, the rows with their route/address preface and the admin `error` detail, and
 * the 403 capability boundary a scoped session hits.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { FailedMessages } from './FailedMessages';
import { makeMessage, renderWithProviders } from './test-utils';

function renderView(listFailedConversationMessages: unknown) {
  return renderWithProviders(<FailedMessages />, {
    client: { listFailedConversationMessages } as never,
  });
}

const failedRecord = makeMessage({
  message_id: 'f1',
  route_name: 'support',
  client_address: '+15559990000',
  inbound_text: 'my order never arrived',
  answer: 'Let me check that for you.',
  delivery_status: 'failed',
  error: 'provider 500: connection reset',
  attempts: 3,
});

describe('FailedMessages', () => {
  it('shows a skeleton while the listing loads', () => {
    renderView(vi.fn().mockReturnValue(new Promise(() => undefined)));
    expect(document.querySelector('.tai-skeleton')).not.toBeNull();
  });

  it('explains an all-delivered deployment rather than a bare list', async () => {
    renderView(vi.fn().mockResolvedValue({ items: [], total: 0 }));
    expect(await screen.findByText('No failed deliveries')).toBeInTheDocument();
  });

  it('renders a failed row prefaced with its route and address', async () => {
    renderView(vi.fn().mockResolvedValue({ items: [failedRecord], total: 1 }));
    const list = await screen.findByTestId('conversation-failed-list');
    expect(within(list).getByText('support')).toBeInTheDocument();
    expect(within(list).getByText('+15559990000')).toBeInTheDocument();
    expect(within(list).getByText('my order never arrived')).toBeInTheDocument();
    // The failure carries the danger delivery chip.
    expect(within(list).getByText('Failed')).toBeInTheDocument();
  });

  it('exposes the admin error detail behind the disclosure', async () => {
    renderView(vi.fn().mockResolvedValue({ items: [failedRecord], total: 1 }));
    const detail = await screen.findByTestId('exchange-admin-detail');
    expect(within(detail).getByText('provider 500: connection reset')).toBeInTheDocument();
  });

  it('reads a 403 as a capability boundary, not a failure', async () => {
    renderView(vi.fn().mockRejectedValue(new ApiError('forbidden', 403)));
    expect(await screen.findByText('Not available to this session')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('raises a real failure loudly and offers a retry', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('backend exploded', 500))
      .mockResolvedValue({ items: [failedRecord], total: 1 });
    renderView(list);
    expect(await screen.findByRole('alert')).toHaveTextContent('backend exploded');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('conversation-failed-list')).toBeInTheDocument();
  });
});
