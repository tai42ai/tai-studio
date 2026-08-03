/**
 * SpanMessages rendered directly: the per-role bubble tint (including the
 * neutral default for an unknown role), and MessageContent's three content
 * shapes — prose string, a multimodal parts array (text parts as prose, every
 * other part as escaped JSON), and a bare structured object — plus the
 * tool_calls code block. Covers the role/content rendering variants the shell
 * shows for an LLM span payload.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { SpanMessages } from './SpanMessages';
import { renderWithProviders } from './test-utils';

/** The bubble div is the role Badge's parent; it carries the tint style. */
function bubbleFor(role: string): HTMLElement {
  const badge = screen.getByText(role);
  const bubble = badge.parentElement;
  if (bubble === null) throw new Error(`no bubble for role ${role}`);
  return bubble;
}

describe('SpanMessages', () => {
  it('tints each known role and leaves an unknown role on the neutral base', () => {
    renderWithProviders(
      <SpanMessages
        messages={[
          { role: 'user', content: 'u' },
          { role: 'assistant', content: 'a' },
          { role: 'tool', content: 't' },
          { role: 'system', content: 's' },
        ]}
      />,
      { client: {} },
    );

    expect(bubbleFor('user').style.background).toBe('var(--tai-color-accent-tint)');
    expect(bubbleFor('assistant').style.background).toBe('var(--tai-color-ok-tint)');
    expect(bubbleFor('tool').style.background).toBe('var(--tai-color-warn-tint)');
    // Unknown role: roleTint returns no override, so the bubble keeps the base.
    expect(bubbleFor('system').style.background).toBe('var(--tai-color-surface-raised)');
  });

  it('matches the role case-insensitively when choosing the tint', () => {
    renderWithProviders(<SpanMessages messages={[{ role: 'USER', content: 'x' }]} />, {
      client: {},
    });

    expect(bubbleFor('USER').style.background).toBe('var(--tai-color-accent-tint)');
  });

  it('renders a prose string through Markdown and drops an empty string', () => {
    const { rerender } = renderWithProviders(
      <SpanMessages messages={[{ role: 'assistant', content: '**bold** answer' }]} />,
      { client: {} },
    );

    // Markdown resolves the inline emphasis to a real <strong>.
    expect(screen.getByText('bold').tagName).toBe('STRONG');

    // A blank string contributes no content node next to the role badge.
    rerender(<SpanMessages messages={[{ role: 'assistant', content: '   ' }]} />);
    const bubble = bubbleFor('assistant');
    expect(bubble.querySelector('.tai-prose')).toBeNull();
    expect(bubble.querySelector('pre')).toBeNull();
  });

  it('renders null and undefined content as nothing', () => {
    renderWithProviders(
      <SpanMessages
        messages={[
          { role: 'user', content: null },
          { role: 'assistant', content: undefined },
        ]}
      />,
      { client: {} },
    );

    expect(bubbleFor('user').querySelector('.tai-prose')).toBeNull();
    expect(bubbleFor('assistant').querySelector('pre')).toBeNull();
  });

  it('splits a multimodal parts array: text parts as prose, other parts as escaped JSON', () => {
    renderWithProviders(
      <SpanMessages
        messages={[
          {
            role: 'user',
            content: [{ text: 'describe this' }, { type: 'image_url', url: 'https://x/y.png' }],
          },
        ]}
      />,
      { client: {} },
    );

    // The text part renders as prose.
    expect(screen.getByText('describe this')).toBeInTheDocument();
    // The non-text part renders as a CodeBlock captioned "part", carrying its JSON.
    expect(screen.getByText('part')).toBeInTheDocument();
    const code = screen.getByText(/image_url/);
    expect(code.tagName).toBe('CODE');
    expect(code.textContent).toContain('https://x/y.png');
  });

  it('renders a bare structured object as an escaped "content" code block', () => {
    renderWithProviders(
      <SpanMessages messages={[{ role: 'tool', content: { status: 'ok', rows: 3 } }]} />,
      { client: {} },
    );

    expect(screen.getByText('content')).toBeInTheDocument();
    const code = screen.getByText(/status/);
    expect(code.tagName).toBe('CODE');
    expect(code.textContent).toContain('"ok"');
  });

  it('falls back to String() when the content is not JSON-representable', () => {
    renderWithProviders(
      // A function has no JSON representation: JSON.stringify yields undefined and
      // toJson falls back to String().
      <SpanMessages messages={[{ role: 'tool', content: () => undefined }]} />,
      { client: {} },
    );

    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByText(/=>/).tagName).toBe('CODE');
  });

  it('renders a tool_calls array as its own escaped code block', () => {
    renderWithProviders(
      <SpanMessages
        messages={[
          {
            role: 'assistant',
            content: 'calling a tool',
            tool_calls: [{ id: 'call_1', function: { name: 'search' } }],
          },
        ]}
      />,
      { client: {} },
    );

    expect(screen.getByText('tool_calls')).toBeInTheDocument();
    const code = screen.getByText(/search/);
    expect(code.tagName).toBe('CODE');
    expect(code.textContent).toContain('call_1');
  });

  it('renders the optional section label, and omits it when absent', () => {
    const { rerender } = renderWithProviders(
      <SpanMessages messages={[{ role: 'user', content: 'hi' }]} label="Messages" />,
      { client: {} },
    );
    expect(screen.getByText('Messages')).toBeInTheDocument();

    rerender(<SpanMessages messages={[{ role: 'user', content: 'hi' }]} />);
    expect(screen.queryByText('Messages')).not.toBeInTheDocument();
  });
});
