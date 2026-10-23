/**
 * One exchange rendered directly: the two bubbles, the status meta, the loud
 * failure treatment, the admin-only disclosure, and the SAFETY PIN — a visitor's
 * message and an agent's answer both reach the screen as escaped text, never as
 * live markup.
 */
import type { ConversationMessage } from '@tai42/api-client';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Exchange } from './Exchange';
import { makeMessage, renderWithProviders } from './test-utils';

function bubble(speaker: 'visitor' | 'agent' | 'operator' | 'send'): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-speaker="${speaker}"]`);
  if (node === null) throw new Error(`no ${speaker} bubble`);
  return node;
}

describe('Exchange', () => {
  it('renders the visitor message and the agent answer as two labelled bubbles', () => {
    renderWithProviders(<Exchange record={makeMessage()} />, { client: {} });

    expect(within(bubble('visitor')).getByText('where is my request')).toBeInTheDocument();
    expect(within(bubble('agent')).getByText('It completes tomorrow.')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText('Answered')).toBeInTheDocument();
  });

  it('renders the agent answer as formatted prose, not raw markdown markers', () => {
    renderWithProviders(<Exchange record={makeMessage({ answer: '**shipped** today' })} />, {
      client: {},
    });

    expect(bubble('agent').querySelector('strong')).toHaveTextContent('shipped');
    expect(bubble('agent').textContent).not.toContain('**');
  });

  it('renders a visitor message VERBATIM, never through the markdown renderer', () => {
    // The visitor is untrusted: their asterisks stay asterisks rather than
    // restyling the operator's screen.
    renderWithProviders(<Exchange record={makeMessage({ inbound_text: '**not bold**' })} />, {
      client: {},
    });

    expect(within(bubble('visitor')).getByText('**not bold**')).toBeInTheDocument();
    expect(bubble('visitor').querySelector('strong')).toBeNull();
  });

  it('escapes markup on both sides, injecting no element (XSS pin)', () => {
    const markup = '<script>alert(1)</script>';
    renderWithProviders(
      <Exchange record={makeMessage({ inbound_text: markup, answer: markup })} />,
      { client: {} },
    );

    const exchange = screen.getByTestId('conversation-exchange');
    expect(exchange).toHaveTextContent(markup);
    expect(exchange.querySelector('script')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('draws no quote block when the visitor message quotes nothing', () => {
    renderWithProviders(<Exchange record={makeMessage()} />, { client: {} });

    expect(screen.queryByTestId('exchange-quote')).toBeNull();
  });

  it('draws the quoted text in full above the visitor message, verbatim and escaped', () => {
    const quoted = '**Tuesday**\n  at <b>noon</b>';
    renderWithProviders(
      <Exchange
        record={makeMessage({
          inbound_text: 'that one please',
          inbound_reply_to: { message_id: 'wamid.7', status: 'found', text: quoted },
        })}
      />,
      { client: {} },
    );

    const quote = within(bubble('visitor')).getByTestId('exchange-quote');
    expect(quote).toHaveAttribute('data-status', 'found');
    expect(within(quote).getByText('Replying to')).toBeInTheDocument();
    const text = within(quote).getByText(
      (_, node) => node?.textContent === quoted && node.tagName === 'P',
    );
    expect(text.style.whiteSpace).toBe('pre-wrap');
    expect(quote.querySelector('strong')).toBeNull();
    expect(quote.querySelector('b')).toBeNull();
    // The quote sits above the message it belongs to.
    const message = within(bubble('visitor')).getByText('that one please');
    expect(quote.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says a quoted message the record does not hold is not shown, naming its id', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          inbound_reply_to: { message_id: 'wamid.gone', status: 'not_found', text: null },
        })}
      />,
      { client: {} },
    );

    const quote = screen.getByTestId('exchange-quote');
    expect(quote).toHaveTextContent(
      "Replying to a message this thread's record does not hold. It may be in an earlier thread of " +
        'this conversation, whose text is not shown here, or it expired, was forgotten or was never ' +
        'recorded.',
    );
    expect(within(quote).getByText('wamid.gone')).toHaveClass('tai-mono');
    expect(quote).toHaveTextContent('Message id: wamid.gone');
  });

  it.each([
    ['sensitive', 'Replying to an answer to a sensitive question. Its text is not kept.'],
    ['no_text', 'Replying to a message with no text.'],
  ] as const)('words a %s quote without any text', (status, copy) => {
    renderWithProviders(
      <Exchange
        record={makeMessage({ inbound_reply_to: { message_id: 'q1', status, text: null } })}
      />,
      { client: {} },
    );

    expect(screen.getByTestId('exchange-quote')).toHaveTextContent(copy);
    expect(screen.getByTestId('exchange-quote')).not.toHaveTextContent('q1');
  });

  it('marks a failed delivery loudly: the error rule plus the worded danger chip', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          delivery_status: 'failed',
          answer_status: 'error',
          answer: 'Could not reach the medium.',
        })}
      />,
      { client: {} },
    );

    const exchange = screen.getByTestId('conversation-exchange');
    expect(exchange).toHaveAttribute('data-failed');
    expect(exchange.style.borderInlineStart).toContain('var(--tai-color-err-text)');
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('omits the outcome chip while the record carries no outcome', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({ delivery_status: 'accepted', answer_status: null, answer: null })}
      />,
      { client: {} },
    );

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByText('Answered')).toBeNull();
    expect(document.querySelector('[data-speaker="agent"]')).toBeNull();
  });

  it('hides the delivery disclosure from a caller-scoped record', () => {
    renderWithProviders(<Exchange record={makeMessage()} />, { client: {} });
    expect(screen.queryByTestId('exchange-admin-detail')).toBeNull();
  });

  it('puts the admin-only bookkeeping behind a disclosure', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          delivery_status: 'failed',
          answer_status: 'error',
          error: 'ConnectionRefused: medium unreachable',
          attempts: 3,
          sends: [{ part: 0, chars: 22, provider_message_ids: ['wamid.1'] }],
        })}
      />,
      { client: {} },
    );

    const detail = screen.getByTestId('exchange-admin-detail');
    expect(within(detail).getByText('Attempts: 3')).toBeInTheDocument();
    expect(within(detail).getByText('Part 1 · 22 chars · wamid.1')).toBeInTheDocument();
    expect(detail).toHaveTextContent('ConnectionRefused: medium unreachable');
  });

  it('opens the disclosure for an admin record that recorded no error and no attempts', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({ sends: [{ part: 0, chars: 22, provider_message_ids: ['wamid.7'] }] })}
      />,
      { client: {} },
    );

    const detail = screen.getByTestId('exchange-admin-detail');
    expect(within(detail).getByText('Part 1 · 22 chars · wamid.7')).toBeInTheDocument();
    expect(within(detail).queryByText(/Attempts/)).toBeNull();
    expect(detail.querySelector('pre')).toBeNull();
  });

  it('states an empty provider-id list rather than rendering a blank cell', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          attempts: 0,
          error: null,
          sends: [{ part: 0, chars: 22, provider_message_ids: [] }],
        })}
      />,
      { client: {} },
    );

    expect(screen.getByText('Part 1 · 22 chars · No provider message id')).toBeInTheDocument();
  });

  it('renders an operator record as ONE labelled bubble on the agent side, no visitor bubble', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          origin: 'operator',
          inbound_text: '',
          answer: 'On it — checking now.',
        })}
      />,
      { client: {} },
    );

    expect(document.querySelector('[data-speaker="visitor"]')).toBeNull();
    const operatorBubble = bubble('operator');
    expect(within(operatorBubble).getByText('Operator')).toBeInTheDocument();
    expect(within(operatorBubble).getByText('On it — checking now.')).toBeInTheDocument();
    expect(document.querySelector('[data-speaker="agent"]')).toBeNull();
  });

  it('keeps the meta row on an operator record', () => {
    renderWithProviders(
      <Exchange record={makeMessage({ origin: 'operator', inbound_text: '', answer: 'Done.' })} />,
      { client: {} },
    );

    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText('Answered')).toBeInTheDocument();
  });

  it('labels a merged outcome with the successor turn it was folded into', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          delivery_status: 'merged',
          answer_status: 'merged',
          answer: null,
          successor_id: 'm-42',
        })}
      />,
      { client: {} },
    );

    expect(screen.getByText('Merged into')).toBeInTheDocument();
    expect(screen.getByText('m-42')).toBeInTheDocument();
    // Answerless: the outcome carries no agent bubble.
    expect(document.querySelector('[data-speaker="agent"]')).toBeNull();
  });

  it('labels a superseded outcome with the successor turn that took its place', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          delivery_status: 'superseded',
          answer_status: 'superseded',
          answer: null,
          successor_id: 'm-77',
        })}
      />,
      { client: {} },
    );

    expect(screen.getByText('Superseded by')).toBeInTheDocument();
    expect(screen.getByText('m-77')).toBeInTheDocument();
    expect(document.querySelector('[data-speaker="agent"]')).toBeNull();
  });

  it('shows no successor label on an ordinary record', () => {
    renderWithProviders(<Exchange record={makeMessage()} />, { client: {} });

    expect(screen.queryByText('Merged into')).toBeNull();
    expect(screen.queryByText('Superseded by')).toBeNull();
  });
});

/** A send record: the platform's own outgoing message, with no visitor side. */
function makeSend(overrides: Parameters<typeof makeMessage>[0] = {}): ConversationMessage {
  return makeMessage({
    message_id: 's1',
    origin: 'send',
    inbound_text: '',
    answer: 'Your report is ready.',
    answer_status: null,
    sent_by: 'notify',
    turn_message_id: null,
    ...overrides,
  });
}

describe('Exchange — send records', () => {
  it('labels a notify send made inside a turn as the agent', () => {
    renderWithProviders(<Exchange record={makeSend({ turn_message_id: 'm1' })} />, { client: {} });

    expect(document.querySelector('[data-speaker="visitor"]')).toBeNull();
    const agent = bubble('agent');
    expect(within(agent).getByText('Agent')).toBeInTheDocument();
    expect(within(agent).getByText('Your report is ready.')).toBeInTheDocument();
  });

  it('labels a notify send made outside any turn as a sent message, never as the agent', () => {
    renderWithProviders(<Exchange record={makeSend()} />, { client: {} });

    expect(document.querySelector('[data-speaker="agent"]')).toBeNull();
    const send = bubble('send');
    expect(within(send).getByText('Sent message')).toBeInTheDocument();
    expect(within(send).getByText('Your report is ready.')).toBeInTheDocument();
    expect(within(send).queryByText(/Agent/)).toBeNull();
  });

  it('labels an ask by whether it was asked inside a turn', () => {
    const ask = { interaction_id: 'int-1', answer_format: 'text', sensitive: false };
    const { unmount } = renderWithProviders(
      <Exchange record={makeSend({ sent_by: 'ask', turn_message_id: 'm1', ask })} />,
      { client: {} },
    );
    expect(within(bubble('agent')).getByText('Agent · question')).toBeInTheDocument();
    unmount();

    renderWithProviders(<Exchange record={makeSend({ sent_by: 'ask', ask })} />, { client: {} });
    expect(within(bubble('send')).getByText('Question')).toBeInTheDocument();
    expect(document.querySelector('[data-speaker="agent"]')).toBeNull();
  });

  it.each([
    ['notice', 'Platform notice'],
    ['channel', 'Channel notice'],
  ] as const)('labels a %s send as a neutral %s', (sentBy, label) => {
    renderWithProviders(
      <Exchange record={makeSend({ sent_by: sentBy, turn_message_id: 'm1' })} />,
      {
        client: {},
      },
    );

    expect(within(bubble('send')).getByText(label)).toBeInTheDocument();
    expect(document.querySelector('[data-speaker="agent"]')).toBeNull();
  });

  it('draws the reply that came over the channel after the question', () => {
    renderWithProviders(
      <Exchange
        record={makeSend({
          sent_by: 'ask',
          answer: 'Which day suits you?',
          ask: { interaction_id: 'int-1', answer_format: 'text', sensitive: false },
          ask_reply: { answer: '**Tuesday**', answered_at: '2027-01-15T08:00:00Z' },
        })}
      />,
      { client: {} },
    );

    const reply = bubble('visitor');
    expect(within(reply).getByText('Visitor · reply')).toBeInTheDocument();
    // The participant's reply is untrusted text: shown verbatim, never as markdown.
    expect(within(reply).getByText('**Tuesday**')).toBeInTheDocument();
    expect(reply.querySelector('strong')).toBeNull();
  });

  it('draws the message an ask reply quotes above the reply', () => {
    renderWithProviders(
      <Exchange
        record={makeSend({
          sent_by: 'ask',
          answer: 'Which day suits you?',
          ask: { interaction_id: 'int-1', answer_format: 'text', sensitive: false },
          ask_reply: {
            answer: 'Tuesday',
            answered_at: '2027-01-15T08:00:00Z',
            reply_to: { message_id: 'ts.1', status: 'found', text: 'Which day suits you?' },
          },
        })}
      />,
      { client: {} },
    );

    const quote = within(bubble('visitor')).getByTestId('exchange-quote');
    expect(within(quote).getByText('Which day suits you?')).toBeInTheDocument();
    expect(within(bubble('visitor')).getByText('Tuesday')).toBeInTheDocument();
  });

  it('draws a structured reply as its JSON', () => {
    renderWithProviders(
      <Exchange
        record={makeSend({
          sent_by: 'ask',
          ask: { interaction_id: 'int-1', answer_format: 'form', sensitive: false },
          ask_reply: { answer: { day: 'tuesday' }, answered_at: '2027-01-15T08:00:00Z' },
        })}
      />,
      { client: {} },
    );

    expect(bubble('visitor')).toHaveTextContent('"day": "tuesday"');
  });

  it('draws a reply to a sensitive ask as received and not stored, with no body', () => {
    renderWithProviders(
      <Exchange
        record={makeSend({
          sent_by: 'ask',
          ask: { interaction_id: 'int-1', answer_format: 'text', sensitive: true },
          ask_reply: { answer: null, answered_at: '2027-01-15T08:00:00Z' },
        })}
      />,
      { client: {} },
    );

    const reply = bubble('visitor');
    expect(within(reply).getByText('Reply received · not stored (sensitive)')).toBeInTheDocument();
    expect(reply.querySelector('pre')).toBeNull();
  });

  it('shows the question alone when no reply came over the channel', () => {
    renderWithProviders(
      <Exchange
        record={makeSend({
          sent_by: 'ask',
          ask: { interaction_id: 'int-1', answer_format: 'text', sensitive: false },
        })}
      />,
      { client: {} },
    );

    expect(document.querySelector('[data-speaker="visitor"]')).toBeNull();
    expect(within(bubble('send')).getByText('Question')).toBeInTheDocument();
  });

  it('marks a send whose outcome is unknown loudly, worded, with its error', () => {
    renderWithProviders(
      <Exchange
        record={makeSend({
          delivery_status: 'outcome_unknown',
          error: 'TimeoutError: the medium did not answer',
        })}
      />,
      { client: {} },
    );

    const exchange = screen.getByTestId('conversation-exchange');
    expect(exchange).toHaveAttribute('data-failed');
    expect(screen.getByText('Sent, outcome unknown')).toBeInTheDocument();
    expect(screen.getByTestId('exchange-admin-detail')).toHaveTextContent(
      'TimeoutError: the medium did not answer',
    );
  });

  it('lists each sent part with its provider ids in the delivery detail', () => {
    renderWithProviders(
      <Exchange
        record={makeSend({
          sends: [
            { part: 0, chars: 1600, provider_message_ids: ['wamid.1', 'wamid.2'] },
            { part: 1, chars: 12, provider_message_ids: ['wamid.3'] },
          ],
        })}
      />,
      { client: {} },
    );

    const detail = screen.getByTestId('exchange-admin-detail');
    const parts = within(detail).getAllByTestId('exchange-sent-part');
    expect(parts.map((part) => part.textContent)).toEqual([
      'Part 1 · 1600 chars · wamid.1, wamid.2',
      'Part 2 · 12 chars · wamid.3',
    ]);
  });

  it('draws the sends made during a turn inside it, between the message and the answer', () => {
    const midTurn = [
      makeSend({ message_id: 's-mid', turn_message_id: 'm1', answer: 'Looking now.' }),
    ];
    renderWithProviders(<Exchange record={makeMessage()} midTurn={midTurn} />, { client: {} });

    const speakers = [...document.querySelectorAll('[data-speaker]')].map((node) => [
      node.getAttribute('data-speaker'),
      node.textContent,
    ]);
    expect(speakers).toEqual([
      ['visitor', 'Visitorwhere is my request'],
      ['agent', 'AgentLooking now.'],
      ['agent', 'AgentIt completes tomorrow.'],
    ]);
  });
});

describe('Exchange — inbound attachments', () => {
  // The platform's own served-media reference: 43 urlsafe-base64 id chars after the
  // route prefix. Same-origin (baseUrl '') leaves it relative, unjoined.
  const SERVED = `/api/interactions/media/${'a'.repeat(43)}`;
  // A second, distinct served-media reference: a fresh url at the same position.
  const SERVED2 = `/api/interactions/media/${'b'.repeat(43)}`;

  it('renders an inbound image attachment in the visitor bubble', () => {
    renderWithProviders(
      <Exchange record={makeMessage({ inbound_attachments: [{ kind: 'image', url: SERVED }] })} />,
      { client: { baseUrl: '' } },
    );

    const visitor = document.querySelector<HTMLElement>('[data-speaker="visitor"]');
    if (visitor === null) throw new Error('no visitor bubble');
    const img = visitor.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(SERVED);
    expect(img?.getAttribute('alt')).toBe('Attached image');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('renders a document attachment as a labelled download chip with its filename', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          inbound_attachments: [{ kind: 'document', url: SERVED, filename: 'report.pdf' }],
        })}
      />,
      { client: { baseUrl: '' } },
    );

    const chip = screen.getByTestId('media-document');
    const link = within(chip).getByRole('link', { name: 'report.pdf' });
    expect(link).toHaveAttribute('href', SERVED);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('download');
  });

  it('renders audio and video attachments as native players', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          inbound_attachments: [
            { kind: 'audio', url: SERVED },
            { kind: 'video', url: SERVED },
          ],
        })}
      />,
      { client: { baseUrl: '' } },
    );

    const audio = screen.getByTestId('media-audio');
    expect(audio.tagName).toBe('AUDIO');
    expect(audio).toHaveAttribute('aria-label', 'Audio attachment');
    const video = screen.getByTestId('media-video');
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('aria-label', 'Video attachment');
  });

  it('shows the shared attachment notice when an image errors, without echoing the url', () => {
    renderWithProviders(
      <Exchange record={makeMessage({ inbound_attachments: [{ kind: 'image', url: SERVED }] })} />,
      { client: { baseUrl: '' } },
    );

    const img = document.querySelector('img');
    if (img === null) throw new Error('no image');
    fireEvent.error(img);
    const notice = screen.getByTestId('attachment-error');
    expect(within(notice).getByText('Attachment')).toBeInTheDocument();
    expect(within(notice).getByText('Attachment failed to load.')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.queryByText(SERVED)).toBeNull();
  });

  it('shows the shared attachment notice for a blocked image url, without echoing the url', () => {
    const BLOCKED = 'http://insecure/a.png';
    renderWithProviders(
      <Exchange record={makeMessage({ inbound_attachments: [{ kind: 'image', url: BLOCKED }] })} />,
      { client: { baseUrl: '' } },
    );

    const notice = screen.getByTestId('attachment-error');
    expect(within(notice).getByText('Attachment')).toBeInTheDocument();
    expect(within(notice).getByText('Attachment failed to load.')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.queryByText(BLOCKED)).toBeNull();
    expect(screen.queryByTestId('media-item-blocked')).toBeNull();
  });

  it('shows a malformed-attachment notice for an unparseable item', () => {
    renderWithProviders(
      <Exchange
        record={{
          ...makeMessage({ inbound_attachments: [{ kind: 'image', url: SERVED }] }),
          // An item past the record schema: the renderer still validates each one.
          inbound_attachments: [
            { kind: 'image', url: SERVED, caption: null, filename: null },
            { junk: true },
          ] as unknown as ConversationMessage['inbound_attachments'],
        }}
      />,
      { client: { baseUrl: '' } },
    );

    expect(screen.getByText('Attachment 2 is malformed and was not shown.')).toBeInTheDocument();
    // The good item still renders — one malformed item never vanishes the rest.
    expect(document.querySelector('img')).not.toBeNull();
  });

  it('renders a link attachment as a scheme-checked external link', () => {
    renderWithProviders(
      <Exchange
        record={makeMessage({
          inbound_attachments: [
            { kind: 'link', url: 'https://example.com/notes', caption: 'Notes' },
          ],
        })}
      />,
      { client: { baseUrl: '' } },
    );

    const link = screen.getByTestId('attachment-link');
    expect(within(link).getByText('Notes')).toBeInTheDocument();
  });

  it('shows the shared attachment notice for a blocked document url, with no live anchor', () => {
    const BLOCKED = 'http://insecure/report.pdf';
    renderWithProviders(
      <Exchange
        record={makeMessage({
          inbound_attachments: [{ kind: 'document', url: BLOCKED, filename: 'report.pdf' }],
        })}
      />,
      { client: { baseUrl: '' } },
    );

    const notice = screen.getByTestId('attachment-error');
    expect(notice).toHaveAttribute('role', 'alert');
    expect(within(notice).getByText('Attachment')).toBeInTheDocument();
    expect(within(notice).getByText('Attachment failed to load.')).toBeInTheDocument();
    expect(screen.queryByTestId('media-document')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(BLOCKED)).toBeNull();
  });

  it.each([
    ['audio', 'media-audio'],
    ['video', 'media-video'],
  ] as const)(
    'shows the shared attachment notice for a blocked %s url, with no player element',
    (kind, testId) => {
      const BLOCKED = 'http://insecure/clip';
      renderWithProviders(
        <Exchange record={makeMessage({ inbound_attachments: [{ kind, url: BLOCKED }] })} />,
        { client: { baseUrl: '' } },
      );

      const notice = screen.getByTestId('attachment-error');
      expect(within(notice).getByText('Attachment')).toBeInTheDocument();
      expect(within(notice).getByText('Attachment failed to load.')).toBeInTheDocument();
      expect(screen.queryByTestId(testId)).toBeNull();
      expect(screen.queryByText(BLOCKED)).toBeNull();
    },
  );

  it.each([
    ['audio', 'media-audio'],
    ['video', 'media-video'],
  ] as const)(
    'shows the shared attachment notice for a bare https %s url, with no player element',
    (kind, testId) => {
      // `<audio>`/`<video>` have no per-element referrer control, so a remote https url
      // is not admitted: only the platform's own served-media reference plays.
      const REMOTE = 'https://attacker.example/x';
      renderWithProviders(
        <Exchange record={makeMessage({ inbound_attachments: [{ kind, url: REMOTE }] })} />,
        { client: { baseUrl: '' } },
      );

      const notice = screen.getByTestId('attachment-error');
      expect(within(notice).getByText('Attachment')).toBeInTheDocument();
      expect(within(notice).getByText('Attachment failed to load.')).toBeInTheDocument();
      expect(screen.queryByTestId(testId)).toBeNull();
      expect(screen.queryByText(REMOTE)).toBeNull();
    },
  );

  it.each([
    ['audio', 'media-audio'],
    ['video', 'media-video'],
  ] as const)(
    'replaces the %s player with the notice on a load error, then retries a fresh url at the same position',
    (kind, testId) => {
      const { rerender } = renderWithProviders(
        <Exchange record={makeMessage({ inbound_attachments: [{ kind, url: SERVED }] })} />,
        { client: { baseUrl: '' } },
      );

      fireEvent.error(screen.getByTestId(testId));
      const notice = screen.getByTestId('attachment-error');
      expect(within(notice).getByText('Attachment')).toBeInTheDocument();
      expect(within(notice).getByText('Attachment failed to load.')).toBeInTheDocument();
      expect(screen.queryByTestId(testId)).toBeNull();

      // A NEW url at the same position keys off the url that failed, so the player
      // gets a fresh load attempt rather than inheriting the stale failure notice.
      rerender(
        <Exchange record={makeMessage({ inbound_attachments: [{ kind, url: SERVED2 }] })} />,
      );

      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(screen.queryByTestId('attachment-error')).toBeNull();
    },
  );

  it('renders only inbound_text when inbound_attachments is null (no attachments)', () => {
    renderWithProviders(<Exchange record={makeMessage({ inbound_attachments: null })} />, {
      client: {},
    });

    expect(screen.queryByTestId('attachment-gallery')).toBeNull();
    expect(within(bubble('visitor')).getByText('where is my request')).toBeInTheDocument();
  });
});
