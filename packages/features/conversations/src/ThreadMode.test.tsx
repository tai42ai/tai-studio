/**
 * Tests for the thread reply-mode control: the read that sets the checkbox, the
 * flip that PUTs the new mode and invalidates the read, the pending disable, and
 * the loud failure of both the read and the flip — a read-only session sees the
 * refusal, never a hidden control.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { ThreadMode } from './ThreadMode';
import { conversationThreadModeKey } from './keys';
import { renderWithProviders, type StubApiClient } from './test-utils';

function renderMode(client: StubApiClient) {
  return renderWithProviders(<ThreadMode route="chat" threadId="svc-chat/u1" />, { client });
}

describe('ThreadMode', () => {
  it('reads the mode on mount and checks the box for the agent mode', async () => {
    const getConversationThreadMode = vi.fn().mockResolvedValue({ mode: 'agent', source: 'route' });
    renderMode({ getConversationThreadMode });

    const box = await screen.findByRole('checkbox', { name: 'Agent replies automatically' });
    await waitFor(() => expect(box).toBeChecked());
    expect(getConversationThreadMode).toHaveBeenCalledWith(
      'chat',
      'svc-chat/u1',
      expect.anything(),
    );
  });

  it('leaves the box unchecked for the manual mode', async () => {
    const getConversationThreadMode = vi
      .fn()
      .mockResolvedValue({ mode: 'manual', source: 'thread' });
    renderMode({ getConversationThreadMode });

    const box = await screen.findByRole('checkbox', { name: 'Agent replies automatically' });
    expect(box).not.toBeChecked();
    expect(screen.getByText('New messages wait for a human reply.')).toBeInTheDocument();
  });

  it('shows a skeleton while the mode loads', () => {
    const getConversationThreadMode = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderMode({ getConversationThreadMode });
    expect(document.querySelector('.tai-skeleton')).not.toBeNull();
  });

  it('flips to manual and invalidates the mode read on success', async () => {
    const user = userEvent.setup();
    const setConversationThreadMode = vi
      .fn()
      .mockResolvedValue({ mode: 'manual', source: 'thread' });
    const getConversationThreadMode = vi.fn().mockResolvedValue({ mode: 'agent', source: 'route' });
    const { queryClient } = renderMode({ getConversationThreadMode, setConversationThreadMode });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('checkbox', { name: 'Agent replies automatically' }));
    await waitFor(() => {
      expect(setConversationThreadMode).toHaveBeenCalledWith('chat', 'svc-chat/u1', 'manual');
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: conversationThreadModeKey('chat', 'svc-chat/u1'),
      });
    });
  });

  it('flips to agent from the manual mode', async () => {
    const user = userEvent.setup();
    const setConversationThreadMode = vi
      .fn()
      .mockResolvedValue({ mode: 'agent', source: 'thread' });
    const getConversationThreadMode = vi
      .fn()
      .mockResolvedValue({ mode: 'manual', source: 'thread' });
    renderMode({ getConversationThreadMode, setConversationThreadMode });

    await user.click(await screen.findByRole('checkbox', { name: 'Agent replies automatically' }));
    await waitFor(() => {
      expect(setConversationThreadMode).toHaveBeenCalledWith('chat', 'svc-chat/u1', 'agent');
    });
  });

  it('raises the mode-read failure loudly with a retry', async () => {
    const user = userEvent.setup();
    const getConversationThreadMode = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('mode read boom', 500))
      .mockResolvedValue({ mode: 'agent', source: 'route' });
    renderMode({ getConversationThreadMode });

    expect(await screen.findByRole('alert')).toHaveTextContent('mode read boom');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('checkbox', { name: 'Agent replies automatically' }),
    ).toBeInTheDocument();
  });

  it('surfaces a flip failure loudly without hiding the control', async () => {
    const user = userEvent.setup();
    const setConversationThreadMode = vi.fn().mockRejectedValue(new ApiError('flip denied', 403));
    const getConversationThreadMode = vi.fn().mockResolvedValue({ mode: 'agent', source: 'route' });
    renderMode({ getConversationThreadMode, setConversationThreadMode });

    await user.click(await screen.findByRole('checkbox', { name: 'Agent replies automatically' }));
    expect(await screen.findByText('flip denied')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Agent replies automatically' }),
    ).toBeInTheDocument();
  });
});
