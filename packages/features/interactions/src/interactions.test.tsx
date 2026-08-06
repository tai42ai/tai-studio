import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiConflictError, ApiError, type ApiClient, type MeProjection } from '@tai42/api-client';

import { InteractionsBadge, InteractionsPage } from './interactions';
import {
  emitFrame,
  encodeInteraction,
  fullProjection,
  makeChannel,
  renderWithProviders,
  scopedProjection,
  stubClient,
  type StreamChannel,
} from './test-utils';

/**
 * Build the JSON `data` of an `interaction.add` SSE frame. Inputs use the concise
 * test aliases `format`/`prompt`; the emitted payload uses the real wire fields
 * the skeleton sends — `answer_format`/`question` plus the id/timestamp fields.
 */
function interactionJson(fields: {
  interaction_id: string;
  format: string;
  prompt?: string;
  format_payload?: Record<string, unknown>;
}): string {
  return encodeInteraction({
    interaction_id: fields.interaction_id,
    group_id: `g-${fields.interaction_id}`,
    answer_format: fields.format,
    question: fields.prompt ?? '',
    format_payload: fields.format_payload ?? {},
    created_at: '2026-07-04T00:00:00Z',
    timeout_at: '2026-07-04T00:05:00Z',
  });
}

/**
 * The `data` of an `interaction.answered` / `interaction.removed` frame — the
 * skeleton sends only ids on those events, never the question fields.
 */
function idJson(interactionId: string): string {
  return encodeInteraction({ interaction_id: interactionId, group_id: `g-${interactionId}` });
}

/** A hand-resolved projection promise, so a test can drive `getMe` past a barrier. */
function deferredProjection(): {
  promise: Promise<MeProjection>;
  resolve: (projection: MeProjection) => void;
} {
  let resolve!: (projection: MeProjection) => void;
  const promise = new Promise<MeProjection>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Let mount-time async effects (stream connect) settle inside `act`. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Render the inbox page wired to a fresh scripted stream. Defaults to a full
 * (admin) projection so the answer control is gated ON — the submission and
 * lifecycle tests exercise a real control; the gating tests below pass their own
 * scoped/absent projection.
 */
function renderInbox(
  answerInteraction?: ApiClient['answerInteraction'],
  projection: MeProjection = fullProjection(),
): {
  channel: StreamChannel;
  answer: ApiClient['answerInteraction'];
  container: HTMLElement;
} {
  const channel = makeChannel();
  const answer = answerInteraction ?? vi.fn().mockResolvedValue(undefined);
  // A populated channel catalog so the delivery-channels chrome renders badges, not
  // its empty-state marketplace anchor — these tests scan the page for the interaction
  // card's own anchor (the empty-state link is covered in ChannelsCard.test.tsx).
  const client = stubClient({
    channel,
    answerInteraction: answer,
    listChannels: vi.fn().mockResolvedValue({ channels: ['telegram'] }),
  });
  const { container } = renderWithProviders(<InteractionsPage search={{}} />, {
    client,
    projection,
  });
  return { channel, answer, container };
}

const XSS = "<script>window.__xss='pwned'</script>";

describe('InteractionsPage — inbox lifecycle', () => {
  it('shows the loading placeholder before the backlog has replayed', async () => {
    renderInbox();
    expect(screen.getByTestId('interactions-loading')).toBeInTheDocument();
    expect(screen.queryByText('No pending questions')).not.toBeInTheDocument();
    await settle();
  });

  it('shows the empty state once the backlog replays with no questions', async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.backlog_done', '{}');
    expect(await screen.findByText('No pending questions')).toBeInTheDocument();
    // The page header is the SDK PageHeader; its h1 name stays verbatim.
    expect(screen.getByRole('heading', { level: 1, name: 'Interactions' })).toBeInTheDocument();
    expect(screen.queryByTestId('interactions-loading')).not.toBeInTheDocument();
  });

  it('a scoped projection shows the per-identity empty-state copy', async () => {
    const channel = makeChannel();
    const client = stubClient({ channel });
    renderWithProviders(<InteractionsPage search={{}} />, {
      client,
      projection: scopedProjection({ routes: [{ path: '/api/interactions', methods: ['GET'] }] }),
    });
    await emitFrame(channel, 'interaction.backlog_done', '{}');

    expect(await screen.findByText('Questions addressed to you appear here.')).toBeInTheDocument();
  });

  it('a full projection shows the default empty-state copy (not the per-identity copy) once resolved', async () => {
    // The default copy also renders while the projection is still LOADING, so drive
    // `getMe` through a deferred and only assert AFTER resolving it to full — that
    // barrier makes the assertion exercise the ready+full branch, and the negative
    // (the per-identity copy is absent) fails if the ready/full logic were inverted.
    const channel = makeChannel();
    const client = stubClient({ channel });
    const deferred = deferredProjection();
    renderWithProviders(<InteractionsPage search={{}} />, {
      client,
      getMe: () => deferred.promise,
    });
    await emitFrame(channel, 'interaction.backlog_done', '{}');

    await act(async () => {
      deferred.resolve(fullProjection());
    });

    expect(
      await screen.findByText('Questions that need your input will appear here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Questions addressed to you appear here.')).not.toBeInTheDocument();
  });

  it('adds a card when an interaction.add frame arrives', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q1', format: 'text', prompt: 'What is your name?' }),
    );
    expect(screen.getByTestId('interaction-card')).toBeInTheDocument();
    expect(screen.getByText('What is your name?')).toBeInTheDocument();
  });

  it('flips a card to the answered state on interaction.answered', async () => {
    const { channel } = renderInbox();
    const base = { interaction_id: 'q1', format: 'text', prompt: 'Name?' };
    await emitFrame(channel, 'interaction.add', interactionJson(base));
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();

    await emitFrame(channel, 'interaction.answered', interactionJson(base));
    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    // The pending control is gone once answered.
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
  });

  it('labels a sensitive answered card "content not stored"', async () => {
    const { channel } = renderInbox();
    // A sensitive add frame carries sensitive:true; the answered frame carries
    // only ids and the hook flips the existing card's flag.
    const addData = encodeInteraction({
      interaction_id: 'q1',
      group_id: 'g-q1',
      answer_format: 'text',
      question: 'Paste your API key',
      format_payload: {},
      created_at: '2026-07-04T00:00:00Z',
      timeout_at: '2026-07-04T00:05:00Z',
      sensitive: true,
    });
    await emitFrame(channel, 'interaction.add', addData);
    await emitFrame(channel, 'interaction.answered', idJson('q1'));

    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    expect(screen.getByTestId('interaction-sensitive-note')).toHaveTextContent(
      'content not stored',
    );
  });

  it('a non-sensitive answered card shows no "content not stored" note', async () => {
    const { channel } = renderInbox();
    const base = { interaction_id: 'q1', format: 'text', prompt: 'Name?' };
    await emitFrame(channel, 'interaction.add', interactionJson(base));
    await emitFrame(channel, 'interaction.answered', idJson('q1'));

    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    expect(screen.queryByTestId('interaction-sensitive-note')).not.toBeInTheDocument();
  });

  it('drops a card on interaction.removed', async () => {
    const { channel } = renderInbox();
    const base = { interaction_id: 'q1', format: 'text', prompt: 'Name?' };
    await emitFrame(channel, 'interaction.add', interactionJson(base));
    expect(screen.getByTestId('interaction-card')).toBeInTheDocument();

    await emitFrame(channel, 'interaction.removed', interactionJson(base));
    expect(screen.queryByTestId('interaction-card')).not.toBeInTheDocument();
  });

  it('de-duplicates a re-delivered add (backlog replay does not duplicate)', async () => {
    const { channel } = renderInbox();
    const base = { interaction_id: 'q1', format: 'text', prompt: 'Name?' };
    await emitFrame(channel, 'interaction.add', interactionJson(base));
    // The reconnect/backlog replay re-delivers the same add at-least-once.
    await emitFrame(channel, 'interaction.add', interactionJson(base));
    expect(screen.getAllByTestId('interaction-card')).toHaveLength(1);
  });

  it('surfaces a stream error as a loud, visible ErrorState', async () => {
    const { channel } = renderInbox();
    // A malformed frame (no interaction_id) makes the hook publish an error.
    await emitFrame(channel, 'interaction.add', '{not json');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/malformed interaction frame/i);
  });
});

describe('InteractionsBadge — floating count', () => {
  it('reflects the number of pending (unanswered) interactions', async () => {
    const channel = makeChannel();
    const client = stubClient({ channel });
    renderWithProviders(<InteractionsBadge />, { client });

    // Nothing pending → no badge.
    await settle();
    expect(screen.queryByTestId('interactions-badge')).not.toBeInTheDocument();

    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'a', format: 'text' }),
    );
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'b', format: 'confirm' }),
    );
    expect(screen.getByTestId('interactions-badge')).toHaveTextContent('2');

    // Answering one drops the pending count.
    await emitFrame(
      channel,
      'interaction.answered',
      interactionJson({ interaction_id: 'a', format: 'text' }),
    );
    expect(screen.getByTestId('interactions-badge')).toHaveTextContent('1');

    // Removing the last pending one hides the badge.
    await emitFrame(
      channel,
      'interaction.removed',
      interactionJson({ interaction_id: 'b', format: 'confirm' }),
    );
    expect(screen.queryByTestId('interactions-badge')).not.toBeInTheDocument();
  });
});

describe('InteractionsBadge — navigation + degraded state', () => {
  it('is a real link to the interactions view (keyboard-operable), not an inert div', async () => {
    const channel = makeChannel();
    const client = stubClient({ channel });
    renderWithProviders(<InteractionsBadge />, { client });
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'a', format: 'text' }),
    );

    const badge = screen.getByTestId('interactions-badge');
    const link = within(badge).getByRole('link');
    // A real anchor carries an href (its resolved route), so it is focusable and
    // middle-clickable — the fix for the old non-interactive status div.
    expect(link).toHaveAttribute('href');
    expect(link).toHaveAttribute('aria-label', expect.stringContaining('pending question'));
  });

  it('exposes a polite live region (role=status) so an arriving count is announced', async () => {
    const channel = makeChannel();
    const client = stubClient({ channel });
    renderWithProviders(<InteractionsBadge />, { client });
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'a', format: 'text' }),
    );

    // The badge is a live region so a screen reader is notified as pending
    // questions arrive; its meaningful announced text is the link's label.
    const badge = screen.getByTestId('interactions-badge');
    expect(badge).toHaveAttribute('role', 'status');
    expect(within(badge).getByRole('link')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('1 pending question'),
    );
    // A healthy badge carries no degraded icon — the icon marks only the outage.
    expect(badge.querySelector('svg')).toBeNull();
  });

  it('does not degrade on a malformed frame while the stream stays connected', async () => {
    const channel = makeChannel();
    const client = stubClient({ channel });
    renderWithProviders(<InteractionsBadge />, { client });
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'a', format: 'text' }),
    );
    // A parse error on a still-open stream is transient — the count is intact and the
    // stream is not disconnected, so the badge must keep its honest count, not flip.
    await emitFrame(channel, 'interaction.add', '{not json');

    const badge = screen.getByTestId('interactions-badge');
    expect(badge).not.toHaveAttribute('data-degraded');
    expect(within(badge).getByRole('link')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('1 pending question'),
    );
  });

  it('flips to a degraded indicator on a true outage (errored and disconnected), even at a stale zero', async () => {
    const client = {
      streamInteractions: vi.fn().mockRejectedValue(new Error('network down')),
      answerInteraction: vi.fn().mockResolvedValue(undefined),
      listChannels: vi.fn().mockResolvedValue({ channels: [] }),
    } as unknown as ApiClient;
    renderWithProviders(<InteractionsBadge />, { client });
    await settle();

    // The connection dropped with nothing pending: the badge announces the outage
    // rather than vanishing or trusting a stale zero.
    const badge = screen.getByTestId('interactions-badge');
    expect(badge).toHaveAttribute('data-degraded', 'true');
    expect(within(badge).getByRole('link')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('disconnected'),
    );
    // WCAG 1.4.1: the outage is marked by an icon, not the warning tint alone.
    expect(badge.querySelector('svg')).not.toBeNull();
  });
});

describe('InteractionsPage — group_id grouping', () => {
  /** A text add frame carrying an explicit shared `group_id`. */
  function groupedJson(interactionId: string, groupId: string, prompt: string): string {
    return encodeInteraction({
      interaction_id: interactionId,
      group_id: groupId,
      answer_format: 'text',
      question: prompt,
      format_payload: {},
      created_at: '2026-07-04T00:00:00Z',
      timeout_at: '2026-07-04T00:05:00Z',
    });
  }

  it('folds questions sharing a group_id into one collapsible group with a pending count', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', groupedJson('q1', 'flow-1', 'First step?'));
    await emitFrame(channel, 'interaction.add', groupedJson('q2', 'flow-1', 'Second step?'));

    const group = screen.getByTestId('interaction-group');
    expect(within(group).getAllByTestId('interaction-card')).toHaveLength(2);
    // The per-group pending count is honest: both are unanswered.
    expect(within(group).getByText('2 of 2 pending')).toBeInTheDocument();

    // The header is a keyboard-operable disclosure; collapsing hides the questions.
    const header = within(group).getByRole('button', { expanded: true });
    await user.click(header);
    expect(within(group).queryByTestId('interaction-card')).not.toBeInTheDocument();
  });

  it('leaves a lone question in its own group as a bare card (no group chrome)', async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', groupedJson('solo', 'flow-solo', 'Only one?'));

    expect(screen.getByTestId('interaction-card')).toBeInTheDocument();
    expect(screen.queryByTestId('interaction-group')).not.toBeInTheDocument();
  });

  it('keeps questions with an empty group_id ungrouped as separate bare cards', async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', groupedJson('u1', '', 'Unrelated one?'));
    await emitFrame(channel, 'interaction.add', groupedJson('u2', '', 'Unrelated two?'));

    // An empty group_id is not a shared group: the two stay standalone cards, never
    // folded into one section under a blank id.
    expect(screen.getAllByTestId('interaction-card')).toHaveLength(2);
    expect(screen.queryByTestId('interaction-group')).not.toBeInTheDocument();
  });
});

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

describe('interactions store not configured — honest OFF state', () => {
  /** A client whose interactions stream is terminally 501 `interactions-not-configured`. */
  function offClient(): ApiClient {
    return {
      // Mirrors the parsed 501 envelope the client produces from the skeleton's OFF
      // store: the verbatim remediation message plus its machine `code`.
      streamInteractions: () =>
        Promise.reject(
          new ApiError(
            'the interactions store is not configured: set INTERACTIONS_REDIS_URL (or TAI_DEFAULT_REDIS_URL)',
            501,
            'interactions-not-configured',
          ),
        ),
      answerInteraction: vi.fn().mockResolvedValue(undefined),
      listChannels: vi.fn().mockResolvedValue({ channels: [] }),
    } as unknown as ApiClient;
  }

  it('the page shows the muted "not configured" note, never the red stream error', async () => {
    renderWithProviders(<InteractionsPage search={{}} />, {
      client: offClient(),
      projection: fullProjection(),
    });
    await settle();

    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
    expect(screen.getByText('Interactions is not configured')).toBeInTheDocument();
    expect(
      screen.getByText(
        'the interactions store is not configured: set INTERACTIONS_REDIS_URL (or TAI_DEFAULT_REDIS_URL)',
      ),
    ).toBeInTheDocument();
    // The OFF state is muted (role=status), not the loud stream ErrorState (role=alert).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('the floating badge stays absent when the stream is disabled', async () => {
    renderWithProviders(<InteractionsBadge />, { client: offClient() });
    await settle();
    expect(screen.queryByTestId('interactions-badge')).not.toBeInTheDocument();
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

describe('InteractionsPage — null format_payload', () => {
  // The skeleton sends `format_payload: null` for text/confirm questions; the
  // stream normalizes it to `{}` so every renderer always sees an object.
  function nullPayloadJson(interactionId: string, format: string, prompt: string): string {
    return encodeInteraction({
      interaction_id: interactionId,
      group_id: `g-${interactionId}`,
      answer_format: format,
      question: prompt,
      format_payload: null,
      created_at: '2026-07-04T00:00:00Z',
      timeout_at: '2026-07-04T00:05:00Z',
    });
  }

  it('renders the text answer control for a null format_payload', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      nullPayloadJson('q-text', 'text', 'What is your name?'),
    );
    expect(screen.getByText('What is your name?')).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
  });

  it('renders a loud malformed notice for a select with a null format_payload', async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', nullPayloadJson('q-select', 'select', 'Pick'));
    const malformed = screen.getByTestId('malformed-payload');
    expect(malformed).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

describe('ExternalLinkCard — render → flip → drop lifecycle', () => {
  it('renders a navigable link while pending, flips to answered, then disappears', async () => {
    const { channel, container } = renderInbox();
    const base = {
      interaction_id: 'q-link',
      format: 'external',
      prompt: 'Authorise here',
      format_payload: { url: 'https://example.com/authorise' },
    };

    // 1. render — a real, navigable external-link anchor.
    await emitFrame(channel, 'interaction.add', interactionJson(base));
    expect(screen.getByTestId('external-link')).toBeInTheDocument();
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://example.com/authorise');

    // 2. flip — answered state replaces the link. The answered frame carries
    // only ids; the hook flips the existing card's `answered` flag.
    await emitFrame(channel, 'interaction.answered', idJson(base.interaction_id));
    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    expect(screen.queryByTestId('external-link')).not.toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();

    // 3. drop — the card is gone entirely.
    await emitFrame(channel, 'interaction.removed', idJson(base.interaction_id));
    expect(screen.queryByTestId('interaction-card')).not.toBeInTheDocument();
  });
});

describe('server-verified external question — non-actionable pending card', () => {
  /** An external add frame carrying `server_verified: true`. */
  function serverVerifiedJson(interactionId: string, prompt: string): string {
    return encodeInteraction({
      interaction_id: interactionId,
      group_id: `g-${interactionId}`,
      answer_format: 'external',
      question: prompt,
      format_payload: { url: 'https://example.com/authorise' },
      created_at: '2026-07-04T00:00:00Z',
      timeout_at: '2026-07-04T00:05:00Z',
      server_verified: true,
    });
  }

  it('renders the "awaiting a verified server callback" card, never an actionable link', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(channel, 'interaction.add', serverVerifiedJson('q-sv', 'Approve the deploy'));

    expect(screen.getByTestId('verified-callback-pending')).toHaveTextContent(
      'awaiting a verified server callback',
    );
    // Not the clickable external-link card, and no navigable anchor (the browser
    // confirm page is suppressed server-side, so a link would be dead).
    expect(screen.queryByTestId('external-link')).not.toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();
  });

  it('flips to the answered state when the signed callback resolves it', async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', serverVerifiedJson('q-sv', 'Approve the deploy'));
    expect(screen.getByTestId('verified-callback-pending')).toBeInTheDocument();

    await emitFrame(channel, 'interaction.answered', idJson('q-sv'));
    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    expect(screen.queryByTestId('verified-callback-pending')).not.toBeInTheDocument();
  });

  it('escapes a <script> prompt on the server-verified card — never a live sink', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(channel, 'interaction.add', serverVerifiedJson('q-sv-xss', XSS));

    expect(screen.getByText(XSS)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('a normal external question (no server_verified) keeps its actionable link', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-ext',
        format: 'external',
        prompt: 'Authorise here',
        format_payload: { url: 'https://example.com/authorise' },
      }),
    );

    expect(screen.getByTestId('external-link')).toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeNull();
    expect(screen.queryByTestId('verified-callback-pending')).not.toBeInTheDocument();
  });
});

describe('channel-delivered interaction — "via <channel>" badge', () => {
  /** An add frame carrying an optional delivery `channel` name. */
  function channelJson(interactionId: string, channel?: string): string {
    const data: Record<string, unknown> = {
      interaction_id: interactionId,
      group_id: `g-${interactionId}`,
      answer_format: 'text',
      question: 'Reply on your phone',
      format_payload: {},
      created_at: '2026-07-04T00:00:00Z',
      timeout_at: '2026-07-04T00:05:00Z',
    };
    if (channel !== undefined) data.channel = channel;
    return encodeInteraction(data);
  }

  it('shows a "via telegram" badge when the add frame carries a channel', async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', channelJson('q-ch', 'telegram'));

    const badge = screen.getByTestId('interaction-channel');
    expect(badge).toHaveTextContent('via telegram');
  });

  it('renders no channel badge for an inbox-only question (no channel field)', async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', channelJson('q-inbox'));

    expect(screen.queryByTestId('interaction-channel')).not.toBeInTheDocument();
  });

  it('keeps the channel badge on the answered card (delivery info survives the flip)', async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', channelJson('q-ch', 'telegram'));
    await emitFrame(channel, 'interaction.answered', idJson('q-ch'));

    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    expect(screen.getByTestId('interaction-channel')).toHaveTextContent('via telegram');
  });
});

describe('interaction attribution — recipient / audience / origin badges', () => {
  /** An add frame carrying any subset of the optional attribution fields. */
  function attributionJson(
    interactionId: string,
    attribution: { recipient?: string; audience?: string; origin?: string } = {},
  ): string {
    const data: Record<string, unknown> = {
      interaction_id: interactionId,
      group_id: `g-${interactionId}`,
      answer_format: 'text',
      question: 'Reply on your phone',
      format_payload: {},
      created_at: '2026-07-04T00:00:00Z',
      timeout_at: '2026-07-04T00:05:00Z',
    };
    if (attribution.recipient !== undefined) data.recipient = attribution.recipient;
    if (attribution.audience !== undefined) data.audience = attribution.audience;
    if (attribution.origin !== undefined) data.origin = attribution.origin;
    return encodeInteraction(data);
  }

  it('shows all three attribution badges when the add frame carries them', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      attributionJson('q-attr', {
        recipient: 'wa:+15551234',
        audience: 'user-42',
        origin: 'run-abc',
      }),
    );

    expect(screen.getByTestId('interaction-recipient')).toHaveTextContent('to wa:+15551234');
    expect(screen.getByTestId('interaction-audience')).toHaveTextContent('for user-42');
    expect(screen.getByTestId('interaction-origin')).toHaveTextContent('run run-abc');
  });

  it('shows only the attribution fields the frame carries', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      attributionJson('q-partial', { origin: 'run-abc' }),
    );

    expect(screen.getByTestId('interaction-attribution')).toBeInTheDocument();
    expect(screen.getByTestId('interaction-origin')).toHaveTextContent('run run-abc');
    expect(screen.queryByTestId('interaction-recipient')).not.toBeInTheDocument();
    expect(screen.queryByTestId('interaction-audience')).not.toBeInTheDocument();
  });

  it('renders no attribution block when the frame carries none (card unchanged)', async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', attributionJson('q-none'));

    expect(screen.getByTestId('interaction-card')).toBeInTheDocument();
    expect(screen.queryByTestId('interaction-attribution')).not.toBeInTheDocument();
  });

  it('keeps the attribution badges on the answered card (they survive the flip)', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      attributionJson('q-attr', {
        recipient: 'wa:+15551234',
        audience: 'user-42',
        origin: 'run-abc',
      }),
    );
    await emitFrame(channel, 'interaction.answered', idJson('q-attr'));

    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    expect(screen.getByTestId('interaction-recipient')).toHaveTextContent('to wa:+15551234');
    expect(screen.getByTestId('interaction-audience')).toHaveTextContent('for user-42');
    expect(screen.getByTestId('interaction-origin')).toHaveTextContent('run run-abc');
  });
});

describe('untrusted payloads — XSS is never a live sink', () => {
  const formats: readonly (readonly [string, Record<string, unknown>])[] = [
    ['text', {}],
    ['confirm', {}],
    ['select', { options: ['a'] }],
    ['form', { schema: { type: 'object', properties: {} } }],
    ['external', { url: 'https://example.com' }],
  ];

  it.each(formats)('escapes a <script> prompt in the %s renderer', async (format, payload) => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: `q-${format}`,
        format,
        prompt: XSS,
        format_payload: payload,
      }),
    );
    // The literal markup is present as TEXT, and no <script> element was created.
    expect(screen.getByText(XSS)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('escapes a <script> select option label', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-select-xss',
        format: 'select',
        prompt: 'Pick',
        format_payload: { options: [XSS] },
      }),
    );
    expect(screen.getByText(XSS)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('escapes a <script> form schema title', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-xss',
        format: 'form',
        prompt: 'Fill',
        format_payload: {
          schema: { type: 'object', properties: { field: { type: 'string', title: XSS } } },
        },
      }),
    );
    expect(screen.getAllByText(XSS).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
  });

  it('neutralizes a javascript: url in an external question — not a navigable anchor', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-js',
        format: 'external',
        prompt: 'Bad link',
        format_payload: { url: 'javascript:alert(1)' },
      }),
    );
    // No anchor at all, and the neutralized text marker is present.
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-neutralized="true"]')).not.toBeNull();
    expect(
      within(screen.getByTestId('external-link')).getByText(/javascript:alert/),
    ).toBeInTheDocument();
  });

  it('neutralizes a data: url in an external question — not a navigable anchor', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-data',
        format: 'external',
        prompt: 'Bad link',
        format_payload: { url: 'data:text/html,<script>alert(1)</script>' },
      }),
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-neutralized="true"]')).not.toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('MediaGallery — display-only question media (gated render + loud fallbacks)', () => {
  // A tiny hermetic 1×1 PNG — a valid `data:image/*` src that renders with no network.
  const PNG_DATA_URI =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  /** An `interaction.add` frame carrying a `media` array (defaults to a text question). */
  function mediaJson(fields: {
    interaction_id: string;
    media: readonly unknown[];
    format?: string;
    prompt?: string;
    format_payload?: Record<string, unknown>;
  }): string {
    return encodeInteraction({
      interaction_id: fields.interaction_id,
      group_id: `g-${fields.interaction_id}`,
      answer_format: fields.format ?? 'text',
      question: fields.prompt ?? 'Which one?',
      format_payload: fields.format_payload ?? {},
      created_at: '2026-07-04T00:00:00Z',
      timeout_at: '2026-07-04T00:05:00Z',
      media: fields.media,
    });
  }

  it('renders a data:image/* item as an <img> with the exact src, alt fallback, and no-referrer', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({ interaction_id: 'q-img', media: [{ kind: 'image', url: PNG_DATA_URI }] }),
    );

    expect(screen.getByTestId('media-gallery')).toBeInTheDocument();
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(PNG_DATA_URI);
    // No caption → the accessibility fallback, never `alt=""`.
    expect(img?.getAttribute('alt')).toBe('Attached image');
    // The privacy mitigation is a PINNED invariant, not optional polish.
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('renders a caption as escaped text and uses it as the img alt', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-img-cap',
        media: [{ kind: 'image', url: PNG_DATA_URI, caption: 'The blue widget' }],
      }),
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('The blue widget');
    expect(screen.getByText('The blue widget')).toBeInTheDocument();
  });

  it('passes a caption-less item that sends caption: null (nullish schema)', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-null-cap',
        media: [{ kind: 'image', url: PNG_DATA_URI, caption: null }],
      }),
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('Attached image');
    expect(screen.queryByTestId('media-item-malformed')).not.toBeInTheDocument();
  });

  it('renders a remote https image (the gate passes https) with no-referrer', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-https',
        media: [{ kind: 'image', url: 'https://images.example.com/widget.png' }],
      }),
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://images.example.com/widget.png');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('blocks a javascript: image src — no <img>, no script, url only as literal text', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-js-img',
        media: [{ kind: 'image', url: 'javascript:alert(1)' }],
      }),
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    const blocked = screen.getByTestId('media-item-blocked');
    expect(blocked).toHaveAttribute('role', 'alert');
    expect(within(blocked).getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('blocks a data:text/html image src (both gate branches fail) — no <img>, no script', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-html-img',
        media: [{ kind: 'image', url: 'data:text/html,<script>alert(1)</script>' }],
      }),
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByTestId('media-item-blocked')).toBeInTheDocument();
  });

  it('blocks a data:application/pdf image src (prefix pin — data: alone is not enough)', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-pdf-img',
        media: [{ kind: 'image', url: 'data:application/pdf;base64,AAAA' }],
      }),
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('media-item-blocked')).toBeInTheDocument();
  });

  it('blocks an http:// image src (images are https-only) — no <img>, url as escaped text', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-http-img',
        media: [{ kind: 'image', url: 'http://host.example/x.png' }],
      }),
    );

    expect(container.querySelector('img')).toBeNull();
    const blocked = screen.getByTestId('media-item-blocked');
    expect(within(blocked).getByText('http://host.example/x.png')).toBeInTheDocument();
  });

  it('neutralizes a javascript: link url — a non-navigable span, never an anchor', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-js-link',
        media: [{ kind: 'link', url: 'javascript:alert(1)' }],
      }),
    );

    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-neutralized="true"]')).not.toBeNull();
  });

  it('neutralizes a data:text/html link url — a non-navigable span, never an anchor', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-data-link',
        media: [{ kind: 'link', url: 'data:text/html,<script>alert(1)</script>' }],
      }),
    );

    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-neutralized="true"]')).not.toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders a valid https link with the caption as its label', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-link',
        media: [{ kind: 'link', url: 'https://shop.example/item', caption: 'Buy it here' }],
      }),
    );

    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('https://shop.example/item');
    expect(anchor).toHaveTextContent('Buy it here');
  });

  it('renders an http:// link as a live anchor (links keep http, unlike the https-only image gate)', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-http-link',
        media: [{ kind: 'link', url: 'http://shop.example/item' }],
      }),
    );

    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('http://shop.example/item');
    expect(container.querySelector('[data-neutralized="true"]')).toBeNull();
  });

  it('treats a blank caption as absent — img alt falls back, no empty caption text', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-blank-cap',
        media: [
          { kind: 'image', url: PNG_DATA_URI, caption: '   ' },
          { kind: 'link', url: 'https://shop.example/item', caption: '' },
        ],
      }),
    );

    // The image falls back to the accessibility alt, never a blank `alt=""`.
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Attached image');
    // The link label falls back to its url rather than rendering a blank anchor.
    expect(container.querySelector('a')).toHaveTextContent('https://shop.example/item');
  });

  it('renders a hostile caption as literal escaped text — never a live sink', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-cap-xss',
        media: [{ kind: 'image', url: PNG_DATA_URI, caption: XSS }],
      }),
    );

    expect(screen.getByText(XSS)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    // Only the single gated image element — the caption never minted another.
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('shows a loud malformed alert for a bad item while the question stays ANSWERABLE', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-bad-item',
        prompt: 'Your name?',
        // Missing url, an unknown kind, and a non-object — all malformed per item.
        media: [{ kind: 'image' }, { kind: 'video', url: 'x' }, 'not-an-object'],
      }),
    );

    expect(screen.getAllByTestId('media-item-malformed').length).toBe(3);
    // The regression pin: a malformed media item never disables the answer control.
    await user.type(screen.getByLabelText('Your answer'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-bad-item', 'Ada');
    });
  });

  it('replaces the <img> with a visible notice when the image fails to load', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({ interaction_id: 'q-img-err', media: [{ kind: 'image', url: PNG_DATA_URI }] }),
    );

    const img = container.querySelector('img');
    if (img === null) throw new Error('expected the image to render before its load error');
    await act(async () => {
      fireEvent.error(img);
    });

    expect(container.querySelector('img')).toBeNull();
    const notice = screen.getByTestId('media-image-error');
    expect(notice).toHaveAttribute('role', 'alert');
  });

  it('renders NO media-gallery node when the frame carries no media', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q-no-media', format: 'text', prompt: 'Name?' }),
    );

    expect(screen.getByTestId('interaction-card')).toBeInTheDocument();
    expect(screen.queryByTestId('media-gallery')).not.toBeInTheDocument();
  });

  it('renders NO media-gallery node for an empty media array', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({ interaction_id: 'q-empty-media', media: [] }),
    );

    expect(screen.getByTestId('interaction-card')).toBeInTheDocument();
    expect(screen.queryByTestId('media-gallery')).not.toBeInTheDocument();
  });

  it('keeps the media visible after the question is answered (media is context)', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-answered-media',
        media: [{ kind: 'image', url: PNG_DATA_URI }],
      }),
    );
    await emitFrame(channel, 'interaction.answered', idJson('q-answered-media'));

    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    expect(screen.getByTestId('media-gallery')).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('reloads a fresh image url at the same position after a prior url failed', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({ interaction_id: 'q-reload', media: [{ kind: 'image', url: PNG_DATA_URI }] }),
    );
    const first = container.querySelector('img');
    if (first === null) throw new Error('expected the first image to render before its load error');
    await act(async () => {
      fireEvent.error(first);
    });
    expect(screen.getByTestId('media-image-error')).toBeInTheDocument();

    // A redelivered add carries a DIFFERENT image url at the same array position.
    // The load-failure state keys on the failed url, so the stale error notice
    // clears and the new url gets a fresh <img> load attempt.
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-reload',
        media: [{ kind: 'image', url: 'https://images.example.com/fresh.png' }],
      }),
    );

    expect(screen.queryByTestId('media-image-error')).not.toBeInTheDocument();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://images.example.com/fresh.png',
    );
  });
});
