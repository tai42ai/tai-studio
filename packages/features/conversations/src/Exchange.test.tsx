/**
 * One exchange rendered directly: the two bubbles, the status meta, the loud
 * failure treatment, the admin-only disclosure, and the SAFETY PIN — a visitor's
 * message and an agent's answer both reach the screen as escaped text, never as
 * live markup.
 */
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';

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
});
