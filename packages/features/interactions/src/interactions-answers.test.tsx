import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiConflictError, ApiError, type ApiClient } from '@tai42/api-client';

import { InteractionsPage } from './interactions';
import {
  emitFrame,
  encodeInteraction,
  fullProjection,
  idJson,
  interactionJson,
  interactionsPage,
  makeChannel,
  pendingItem,
  renderInbox,
  renderWithProviders,
  stubClient,
  type StreamChannel,
} from './test-utils';

describe('TextAnswer — empty submit guard', () => {
  it('keeps Submit disabled until the answer has non-whitespace content', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q-text', format: 'text', prompt: 'Name?' }),
    );

    const submit = screen.getByRole('button', { name: 'Submit' });
    // A one-shot interaction 409s once answered, so an empty/whitespace answer must
    // never be submittable — the control is a textarea guarded on trimmed content.
    expect(screen.getByLabelText('Your answer').tagName).toBe('TEXTAREA');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Your answer'), '   ');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Your answer'), 'Ada');
    expect(submit).toBeEnabled();
  });
});

describe('InteractionsPage — answer submission per format', () => {
  it('text → answerInteraction(id, string)', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q-text', format: 'text', prompt: 'Name?' }),
    );

    await user.type(screen.getByLabelText('Your answer'), 'Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-text', 'Ada Lovelace');
    });
  });

  it('confirm → answerInteraction(id, boolean)', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q-confirm', format: 'confirm', prompt: 'Proceed?' }),
    );

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-confirm', true);
    });
  });

  it('select → answerInteraction(id, chosen value)', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-select',
        format: 'select',
        prompt: 'Pick a colour',
        format_payload: { options: ['red', 'green', 'blue'] },
      }),
    );

    await user.click(screen.getByRole('radio', { name: 'green' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-select', 'green');
    });
  });

  it('form → answerInteraction(id, built object)', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form',
        format: 'form',
        prompt: 'Fill this in',
        format_payload: {
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
      }),
    );

    await user.type(screen.getByLabelText('name'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-form', { name: 'Ada' });
    });
  });

  it('a malformed select payload is a loud inline error, never a silent empty control', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-bad',
        format: 'select',
        prompt: 'Pick',
        format_payload: { options: 'not-an-array' },
      }),
    );

    const malformed = screen.getByTestId('malformed-payload');
    expect(malformed).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('a malformed form payload (non-object schema) is a loud inline error, never a crash', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-bad-form',
        format: 'form',
        prompt: 'Fill',
        format_payload: { schema: 'x' },
      }),
    );

    const malformed = screen.getByTestId('malformed-payload');
    expect(malformed).toHaveAttribute('role', 'alert');
    // No form control rendered from the bad schema, and no submit affordance.
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('a malformed external payload (non-string url) is a loud inline error, never a crash', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-bad-link',
        format: 'external',
        prompt: 'Authorise',
        format_payload: { url: 42 },
      }),
    );

    const malformed = screen.getByTestId('malformed-payload');
    expect(malformed).toHaveAttribute('role', 'alert');
    // No navigable anchor was built from the non-string url.
    expect(container.querySelector('a')).toBeNull();
  });

  it('a 409 surfaces "already answered elsewhere", not a generic error', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockRejectedValue(new ApiConflictError('duplicate answer'));
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q1', format: 'confirm', prompt: 'Proceed?' }),
    );

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(
      await screen.findByText('This question was already answered elsewhere.'),
    ).toBeInTheDocument();
  });
});

describe('InteractionsPage — cancel (withdraw) a pending question', () => {
  /** Render the inbox with a scripted stream and a controllable cancel/list stub. */
  function renderWithCancel(
    opts: {
      cancelInteraction?: ApiClient['cancelInteraction'];
      listInteractions?: ApiClient['listInteractions'];
    } = {},
  ): { channel: StreamChannel; cancel: ApiClient['cancelInteraction'] } {
    const channel = makeChannel();
    const cancel =
      opts.cancelInteraction ??
      vi.fn().mockResolvedValue({ interaction_id: 'q1', status: 'cancelled' });
    const client = stubClient({
      channel,
      cancelInteraction: cancel,
      listInteractions: opts.listInteractions,
      listChannels: vi.fn().mockResolvedValue({ channels: [] }),
    });
    renderWithProviders(<InteractionsPage search={{}} />, {
      client,
      projection: fullProjection(),
    });
    return { channel, cancel };
  }

  it('shows the Cancel action on a pending card and drops it once the card is answered', async () => {
    const { channel } = renderWithCancel();
    const base = { interaction_id: 'q1', format: 'text', prompt: 'Name?' };
    await emitFrame(channel, 'interaction.add', interactionJson(base));
    // A pending question is withdrawable.
    expect(screen.getByTestId('interaction-cancel')).toBeInTheDocument();

    await emitFrame(channel, 'interaction.answered', interactionJson(base));
    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    // An answered question is terminal — there is nothing left to withdraw.
    expect(screen.queryByTestId('interaction-cancel')).not.toBeInTheDocument();
  });

  it('confirming the withdraw dialog calls cancelInteraction(id)', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn().mockResolvedValue({ interaction_id: 'q1', status: 'cancelled' });
    const { channel } = renderWithCancel({ cancelInteraction: cancel });
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q1', format: 'text', prompt: 'Name?' }),
    );

    // The card's quiet ghost action opens the confirm; the door is not hit yet.
    await user.click(screen.getByTestId('interaction-cancel'));
    expect(cancel).not.toHaveBeenCalled();

    // The dialog's danger confirm reads "Withdraw question" — unambiguous beside the plain Cancel.
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw question' }));

    await waitFor(() => {
      expect(cancel).toHaveBeenCalledWith('q1');
    });
  });

  it('on success the withdrawn card leaves the list (the refetched base no longer carries it)', async () => {
    const user = userEvent.setup();
    // The seeded pending row is the paged base; the cancel drops it server-side, so the
    // refetch onSuccess triggers returns an empty page and the card leaves the list.
    let page = interactionsPage([pendingItem('a', { question: 'Withdraw me?' })], { total: 1 });
    const listInteractions = vi.fn(() => Promise.resolve(page));
    const cancel = vi.fn(() => {
      page = interactionsPage([], { total: 0 });
      return Promise.resolve({ interaction_id: 'a', status: 'cancelled' });
    }) as unknown as ApiClient['cancelInteraction'];
    renderWithCancel({ cancelInteraction: cancel, listInteractions });

    expect(await screen.findByTestId('interaction-card')).toBeInTheDocument();

    await user.click(screen.getByTestId('interaction-cancel'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw question' }));

    await waitFor(() => {
      expect(screen.queryByTestId('interaction-card')).not.toBeInTheDocument();
    });
  });

  it('a 404 surfaces the "no longer pending" copy in the dialog and keeps it open', async () => {
    const user = userEvent.setup();
    const cancel = vi
      .fn()
      .mockRejectedValue(new ApiError('interaction not found', 404, 'not-found'));
    const { channel } = renderWithCancel({ cancelInteraction: cancel });
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q1', format: 'text', prompt: 'Name?' }),
    );

    await user.click(screen.getByTestId('interaction-cancel'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw question' }));

    // A gone ask (answered elsewhere or already withdrawn) reads as its own calm copy,
    // never a raw server line — and the dialog stays open, no half-open state.
    expect(
      await screen.findByText(
        'This question is no longer pending — it may have been answered or already withdrawn.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a 409 surfaces the "already answered" copy in the dialog and keeps it open', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn().mockRejectedValue(new ApiConflictError('interaction already answered'));
    const { channel } = renderWithCancel({ cancelInteraction: cancel });
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q1', format: 'text', prompt: 'Name?' }),
    );

    await user.click(screen.getByTestId('interaction-cancel'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw question' }));

    // The conflict is specific, non-retryable copy — not a raw server line — and the
    // dialog stays open so there is no half-open, ambiguous state.
    expect(
      await screen.findByText('This question was already answered and can no longer be cancelled.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closing the withdraw dialog dismisses it without hitting the cancel door', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn().mockResolvedValue({ interaction_id: 'q1', status: 'cancelled' });
    const { channel } = renderWithCancel({ cancelInteraction: cancel });
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q1', format: 'text', prompt: 'Name?' }),
    );

    await user.click(screen.getByTestId('interaction-cancel'));
    const dialog = await screen.findByRole('dialog');
    // The dialog's plain "Cancel" (its close) is distinct from the danger "Cancel
    // question" confirm: closing withdraws nothing.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('withdraws the still-pending question from within a multi-question group', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn().mockResolvedValue({ interaction_id: 'q2', status: 'cancelled' });
    const { channel } = renderWithCancel({ cancelInteraction: cancel });
    // Two questions sharing a group_id fold into one collapsible group. Answering q1
    // leaves exactly one pending card (q2) carrying a withdraw action, so the group's
    // own cancel wiring is exercised unambiguously.
    const grouped = (id: string): string =>
      encodeInteraction({
        interaction_id: id,
        group_id: 'flow-1',
        answer_format: 'text',
        question: `Step ${id}`,
        format_payload: {},
        created_at: '2026-07-04T00:00:00Z',
        timeout_at: '2026-07-04T00:05:00Z',
      });
    await emitFrame(channel, 'interaction.add', grouped('q1'));
    await emitFrame(channel, 'interaction.add', grouped('q2'));
    await emitFrame(channel, 'interaction.answered', idJson('q1'));

    const group = screen.getByTestId('interaction-group');
    // q1 is answered (no withdraw), so the group has a single withdraw target: q2.
    await user.click(within(group).getByTestId('interaction-cancel'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw question' }));

    await waitFor(() => {
      expect(cancel).toHaveBeenCalledWith('q2');
    });
  });
});
