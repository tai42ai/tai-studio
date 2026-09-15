import { type ApiClient, ApiError } from '@tai42/api-client';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InteractionsPage } from './interactions';
import { InteractionsBadge } from './InteractionsBadge';
import {
  deferredProjection,
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
  scopedProjection,
  settle,
  stubClient,
} from './test-utils';

describe('InteractionsPage — inbox lifecycle', () => {
  it('shows the loading placeholder before the first page loads', async () => {
    renderInbox();
    expect(screen.getByTestId('interactions-loading')).toBeInTheDocument();
    expect(screen.queryByText('No pending questions')).not.toBeInTheDocument();
    await settle();
  });

  it('shows the empty state once the first page loads with no questions', async () => {
    renderInbox();
    await settle();
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
    await settle();

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
    await settle();

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

  it('de-duplicates a re-delivered add (an at-least-once replay does not duplicate)', async () => {
    const { channel } = renderInbox();
    const base = { interaction_id: 'q1', format: 'text', prompt: 'Name?' };
    await emitFrame(channel, 'interaction.add', interactionJson(base));
    // The live tail re-delivers the same add at-least-once.
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
      // The paged base door is OFF on the same deployment.
      listInteractions: () =>
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

describe('InteractionsPage — paged pending base + Load more', () => {
  it('seeds the inbox cards from the paged base door', async () => {
    const channel = makeChannel();
    const client = stubClient({
      channel,
      listInteractions: vi
        .fn()
        .mockResolvedValue(
          interactionsPage(
            [
              pendingItem('a', { question: 'First question?' }),
              pendingItem('b', { question: 'Second question?' }),
            ],
            { total: 2 },
          ),
        ),
    });
    renderWithProviders(<InteractionsPage search={{}} />, { client, projection: fullProjection() });

    expect(await screen.findByText('First question?')).toBeInTheDocument();
    expect(screen.getByText('Second question?')).toBeInTheDocument();
    // A single exhaustive page → no Load more control.
    expect(screen.queryByTestId('interactions-load-more')).not.toBeInTheDocument();
  });

  it('pages the rest in when the base door has a next page', async () => {
    const user = userEvent.setup();
    const channel = makeChannel();
    const listInteractions = vi.fn((page: number) =>
      Promise.resolve(
        page === 1
          ? interactionsPage([pendingItem('a', { question: 'First question?' })], {
              total: 2,
              next_page: 2,
            })
          : interactionsPage([pendingItem('b', { question: 'Second question?' })], {
              total: 2,
              page: 2,
              next_page: null,
            }),
      ),
    );
    const client = stubClient({ channel, listInteractions });
    renderWithProviders(<InteractionsPage search={{}} />, { client, projection: fullProjection() });

    expect(await screen.findByText('First question?')).toBeInTheDocument();
    expect(screen.queryByText('Second question?')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('interactions-load-more'));
    expect(await screen.findByText('Second question?')).toBeInTheDocument();
  });

  it('surfaces a next-page failure inline and stays retryable', async () => {
    const user = userEvent.setup();
    const channel = makeChannel();
    let page2Calls = 0;
    const listInteractions = vi.fn((page: number) => {
      if (page === 1) {
        return Promise.resolve(
          interactionsPage([pendingItem('a', { question: 'First question?' })], {
            total: 2,
            next_page: 2,
          }),
        );
      }
      page2Calls += 1;
      // The first page-2 fetch 500s; the retry (a second click) succeeds.
      if (page2Calls === 1) {
        return Promise.reject(Object.assign(new Error('page 2 down'), { status: 500 }));
      }
      return Promise.resolve(
        interactionsPage([pendingItem('b', { question: 'Second question?' })], {
          total: 2,
          page: 2,
          next_page: null,
        }),
      );
    });
    const client = stubClient({ channel, listInteractions });
    renderWithProviders(
      <>
        <InteractionsBadge />
        <InteractionsPage search={{}} />
      </>,
      { client, projection: fullProjection() },
    );

    expect(await screen.findByText('First question?')).toBeInTheDocument();
    expect(await screen.findByTestId('interactions-badge')).toHaveTextContent('2');

    // The next-page fetch fails: an inline error appears, the page keeps its cards,
    // the badge count is untouched, and the control stays usable.
    await user.click(screen.getByTestId('interactions-load-more'));
    expect(await screen.findByTestId('interactions-load-more-error')).toBeInTheDocument();
    expect(screen.queryByText('Second question?')).not.toBeInTheDocument();
    expect(screen.getByTestId('interactions-badge')).toHaveTextContent('2');
    expect(screen.getByTestId('interactions-load-more')).toBeEnabled();

    // Clicking again retries and clears the inline error.
    await user.click(screen.getByTestId('interactions-load-more'));
    expect(await screen.findByText('Second question?')).toBeInTheDocument();
    expect(screen.queryByTestId('interactions-load-more-error')).not.toBeInTheDocument();
  });
});
