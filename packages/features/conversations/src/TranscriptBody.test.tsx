/**
 * The transcript body's grouping: a send made during a turn is drawn inside that turn's
 * exchange when the turn is on the page, and as an exchange of its own otherwise.
 */
import type { ConversationMessage } from '@tai42/api-client';
import { screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { makeMessage, renderWithProviders } from './test-utils';
import { TranscriptBody } from './TranscriptBody';

function renderBody(items: ConversationMessage[]): void {
  renderWithProviders(
    <TranscriptBody
      isPending={false}
      isLoadingError={false}
      error={null}
      onRetry={() => undefined}
      items={items}
      q={undefined}
      now={1_800_000_100_000}
      hasOlder={false}
      loadingOlder={false}
      pageFailed={false}
      loadOlderRef={createRef<HTMLButtonElement>()}
      onLoadOlder={() => undefined}
      onRetryOlder={() => undefined}
    />,
    { client: {} },
  );
}

const midTurnSend = makeMessage({
  message_id: 's-mid',
  origin: 'send',
  inbound_text: '',
  answer: 'Looking now.',
  answer_status: null,
  sent_by: 'notify',
  turn_message_id: 'm1',
  created_at: 1_800_000_000.5,
});

describe('TranscriptBody — sends made during a turn', () => {
  it('draws a mid-turn send inside its turn, not as an exchange of its own', () => {
    renderBody([makeMessage(), midTurnSend]);

    // `getByTestId` throws unless exactly one exchange is drawn.
    const exchange = screen.getByTestId('conversation-exchange');
    expect(within(exchange).getByText('Looking now.')).toBeInTheDocument();
  });

  it('draws the sends made during a turn in the order they were sent', () => {
    const laterSend = makeMessage({
      ...midTurnSend,
      message_id: 's-mid-2',
      answer: 'Found it.',
      created_at: 1_800_000_000.9,
    });
    renderBody([makeMessage(), laterSend, midTurnSend]);

    const sends = screen.getAllByTestId('exchange-mid-turn-send');
    expect(sends.map((send) => send.textContent)).toEqual([
      expect.stringContaining('Looking now.'),
      expect.stringContaining('Found it.'),
    ]);
  });

  it('draws a mid-turn send as its own exchange when its turn is not on the page', () => {
    renderBody([midTurnSend]);

    // `getByTestId` throws unless exactly one exchange is drawn.
    const exchange = screen.getByTestId('conversation-exchange');
    expect(within(exchange).getByText('Agent')).toBeInTheDocument();
    expect(within(exchange).getByText('Looking now.')).toBeInTheDocument();
  });

  it('keeps a send outside any turn as its own exchange', () => {
    const outOfTurn = makeMessage({
      message_id: 's-out',
      origin: 'send',
      inbound_text: '',
      answer: 'Reminder.',
      answer_status: null,
      sent_by: 'notify',
    });
    renderBody([makeMessage(), outOfTurn]);

    expect(screen.getAllByTestId('conversation-exchange')).toHaveLength(2);
  });
});
