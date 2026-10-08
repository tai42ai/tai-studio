/**
 * SpanMessages rendered directly over GenAI-convention messages (`{ role, parts }`):
 * the per-role bubble tint (including the neutral default for an unknown role), each
 * part type — text, tool_call, tool_call_response and any other part — and the output
 * message's finish reason; plus `asMessages`, which accepts only that shape.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { asMessages, SpanMessages } from './SpanMessages';
import { renderWithProviders } from './test-utils';

/** The bubble div is the role Badge's parent; it carries the tint style. */
function bubbleFor(role: string): HTMLElement {
  const badge = screen.getByText(role);
  const bubble = badge.parentElement;
  if (bubble === null) throw new Error(`no bubble for role ${role}`);
  return bubble;
}

const text = (content: string) => ({ type: 'text', content });

describe('asMessages', () => {
  it('accepts a list whose every item has a string role and a parts array', () => {
    const messages = [
      { role: 'user', parts: [text('hi')] },
      { role: 'assistant', parts: [], finish_reason: 'stop' },
    ];
    expect(asMessages(messages)).toBe(messages);
  });

  it('refuses anything else, so the value falls to the JSON tree', () => {
    expect(asMessages([{ role: 'user', content: 'hi' }])).toBeNull();
    expect(asMessages([{ role: 1, parts: [] }])).toBeNull();
    expect(asMessages([{ role: 'user', parts: 'hi' }])).toBeNull();
    expect(asMessages([{ role: 'user', parts: [] }, 'x'])).toBeNull();
    expect(asMessages({ messages: [{ role: 'user', parts: [] }] })).toBeNull();
    expect(asMessages([])).toBeNull();
    expect(asMessages('hi')).toBeNull();
    expect(asMessages(null)).toBeNull();
  });
});

describe('SpanMessages', () => {
  it('tints each known role and leaves an unknown role on the neutral base', () => {
    renderWithProviders(
      <SpanMessages
        messages={[
          { role: 'user', parts: [text('u')] },
          { role: 'assistant', parts: [text('a')] },
          { role: 'tool', parts: [text('t')] },
          { role: 'system', parts: [text('s')] },
        ]}
      />,
      { client: {} },
    );

    expect(bubbleFor('user').style.background).toBe('var(--tai-color-accent-tint)');
    expect(bubbleFor('assistant').style.background).toBe('var(--tai-color-ok-tint)');
    expect(bubbleFor('tool').style.background).toBe('var(--tai-color-warn-tint)');
    expect(bubbleFor('system').style.background).toBe('var(--tai-color-surface-raised)');
  });

  it('renders a text part as its literal text, line breaks kept, never as markup', () => {
    renderWithProviders(
      <SpanMessages messages={[{ role: 'assistant', parts: [text('**not bold**\nline 2')] }]} />,
      { client: {} },
    );

    const node = screen.getByText(/not bold/);
    expect(node.textContent).toBe('**not bold**\nline 2');
    expect(node.style.whiteSpace).toBe('pre-wrap');
    expect(document.querySelector('strong')).toBeNull();
  });

  it('renders a tool call as "Call · <name>", its id in mono, and a tree of its arguments', () => {
    renderWithProviders(
      <SpanMessages
        messages={[
          {
            role: 'assistant',
            parts: [{ type: 'tool_call', id: 'call_1', name: 'lookup', arguments: { q: 'x' } }],
          },
        ]}
      />,
      { client: {} },
    );

    const bubble = bubbleFor('assistant');
    expect(within(bubble).getByText('Call · lookup')).toBeInTheDocument();
    expect(within(bubble).getByText('call_1')).toHaveClass('tai-mono');
    expect(within(bubble).getByText(/"x"/)).toBeInTheDocument();
  });

  it('renders a tool call response as "Result · <id>" and a tree of its response', () => {
    renderWithProviders(
      <SpanMessages
        messages={[
          {
            role: 'tool',
            parts: [{ type: 'tool_call_response', id: 'call_1', response: { rows: 3 } }],
          },
        ]}
      />,
      { client: {} },
    );

    const bubble = bubbleFor('tool');
    expect(within(bubble).getByText('Result · call_1')).toBeInTheDocument();
    expect(within(bubble).getByText(/rows/)).toBeInTheDocument();
  });

  it('renders any other part as a tree under a muted label of its type', () => {
    renderWithProviders(
      <SpanMessages
        messages={[
          {
            role: 'user',
            parts: [{ type: 'image', uri: 'https://x/y.png' }],
          },
        ]}
      />,
      { client: {} },
    );

    const bubble = bubbleFor('user');
    expect(within(bubble).getByText('image')).toHaveClass('tai-muted');
    expect(within(bubble).getByText(/y\.png/)).toBeInTheDocument();
  });

  it("shows an output message's finish reason as a muted footer", () => {
    renderWithProviders(
      <SpanMessages
        messages={[{ role: 'assistant', parts: [text('done')], finish_reason: 'length' }]}
      />,
      { client: {} },
    );

    expect(screen.getByText('finish: length')).toHaveClass('tai-muted');
  });

  it('renders the optional section label, and omits it when absent', () => {
    const { rerender } = renderWithProviders(
      <SpanMessages messages={[{ role: 'user', parts: [text('hi')] }]} label="Messages" />,
      { client: {} },
    );
    expect(screen.getByText('Messages')).toBeInTheDocument();

    rerender(<SpanMessages messages={[{ role: 'user', parts: [text('hi')] }]} />);
    expect(screen.queryByText('Messages')).not.toBeInTheDocument();
  });
});
