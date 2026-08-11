/**
 * Tests for the compose box: the send that POSTs the typed text, the clear +
 * transcript invalidation on success, the empty-input guard, the pending disable,
 * and the loud send failure that keeps the typed text — a read-only session sees
 * the refusal, never a hidden control.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { ComposeMessage } from './ComposeMessage';
import { conversationTranscriptKey } from './keys';
import { TRANSCRIPT_PAGE_SIZE } from './Transcript';
import { renderWithProviders, type StubApiClient } from './test-utils';

function renderCompose(client: StubApiClient) {
  return renderWithProviders(<ComposeMessage route="chat" threadId="svc-chat/u1" />, { client });
}

describe('ComposeMessage', () => {
  it('sends the typed text, clears the box, and invalidates the transcript read', async () => {
    const user = userEvent.setup();
    const sendConversationThreadMessage = vi
      .fn()
      .mockResolvedValue({ message_id: 'm9', thread_id: 'svc-chat/u1' });
    const { queryClient } = renderCompose({ sendConversationThreadMessage });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const box = screen.getByRole('textbox', { name: 'Message' });
    await user.type(box, 'On it.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(sendConversationThreadMessage).toHaveBeenCalledWith('chat', {
        thread_id: 'svc-chat/u1',
        text: 'On it.',
      });
    });
    await waitFor(() => {
      expect(box).toHaveValue('');
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: conversationTranscriptKey('chat', 'svc-chat/u1', TRANSCRIPT_PAGE_SIZE),
    });
  });

  it('trims surrounding whitespace before sending', async () => {
    const user = userEvent.setup();
    const sendConversationThreadMessage = vi
      .fn()
      .mockResolvedValue({ message_id: 'm9', thread_id: 'svc-chat/u1' });
    renderCompose({ sendConversationThreadMessage });

    await user.type(screen.getByRole('textbox', { name: 'Message' }), '  hi  ');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(sendConversationThreadMessage).toHaveBeenCalledWith('chat', {
        thread_id: 'svc-chat/u1',
        text: 'hi',
      });
    });
  });

  it('disables the send button while the box is empty or whitespace-only', async () => {
    const user = userEvent.setup();
    const sendConversationThreadMessage = vi.fn();
    renderCompose({ sendConversationThreadMessage });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), '   ');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(sendConversationThreadMessage).not.toHaveBeenCalled();
  });

  it('keeps the typed text and shows the failure when a send is refused', async () => {
    const user = userEvent.setup();
    const sendConversationThreadMessage = vi
      .fn()
      .mockRejectedValue(new ApiError('send denied', 403));
    renderCompose({ sendConversationThreadMessage });

    const box = screen.getByRole('textbox', { name: 'Message' });
    await user.type(box, 'On it.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('send denied')).toBeInTheDocument();
    expect(box).toHaveValue('On it.');
  });
});
