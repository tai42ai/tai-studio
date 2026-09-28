/**
 * One exchange rendered directly: the two bubbles, the status meta, the loud
 * failure treatment, the admin-only disclosure, and the SAFETY PIN — a visitor's
 * message and an agent's answer both reach the screen as escaped text, never as
 * live markup.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Exchange } from './Exchange';
import { makeMessage, renderWithProviders } from './test-utils';

function bubble(speaker: 'visitor' | 'agent' | 'operator'): HTMLElement {
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
          outbound_message_ids: ['wamid.1'],
        })}
      />,
      { client: {} },
    );

    const detail = screen.getByTestId('exchange-admin-detail');
    expect(within(detail).getByText('Attempts: 3')).toBeInTheDocument();
    expect(within(detail).getByText('wamid.1')).toBeInTheDocument();
    expect(detail).toHaveTextContent('ConnectionRefused: medium unreachable');
  });

  it('opens the disclosure for an admin record that recorded no error and no attempts', () => {
    renderWithProviders(<Exchange record={makeMessage({ outbound_message_ids: ['wamid.7'] })} />, {
      client: {},
    });

    const detail = screen.getByTestId('exchange-admin-detail');
    expect(within(detail).getByText('wamid.7')).toBeInTheDocument();
    expect(within(detail).queryByText(/Attempts/)).toBeNull();
    expect(detail.querySelector('pre')).toBeNull();
  });

  it('states an empty provider-id list rather than rendering a blank cell', () => {
    renderWithProviders(
      <Exchange record={makeMessage({ attempts: 0, outbound_message_ids: [], error: null })} />,
      { client: {} },
    );

    expect(screen.getByText('No provider message id')).toBeInTheDocument();
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

    const chip = screen.getByTestId('attachment-document');
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

    const audio = screen.getByTestId('attachment-audio');
    expect(audio.tagName).toBe('AUDIO');
    expect(audio).toHaveAttribute('aria-label', 'Audio attachment');
    const video = screen.getByTestId('attachment-video');
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
        record={makeMessage({
          inbound_attachments: [{ kind: 'image', url: SERVED }, { junk: true }],
        })}
      />,
      { client: { baseUrl: '' } },
    );

    expect(screen.getByText('Attachment 2 is malformed and was not shown.')).toBeInTheDocument();
    // The good item still renders — one malformed item never vanishes the rest.
    expect(document.querySelector('img')).not.toBeNull();
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
    expect(screen.queryByTestId('attachment-document')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(BLOCKED)).toBeNull();
  });

  it.each([
    ['audio', 'attachment-audio'],
    ['video', 'attachment-video'],
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
    ['audio', 'attachment-audio'],
    ['video', 'attachment-video'],
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
    ['audio', 'attachment-audio'],
    ['video', 'attachment-video'],
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
