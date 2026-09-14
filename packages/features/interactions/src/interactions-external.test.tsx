import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  XSS,
  emitFrame,
  encodeInteraction,
  idJson,
  interactionJson,
  renderInbox,
} from './test-utils';

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
