/**
 * Behavioural tests for the read-only caller-ask list: each row's prompt and copyable ask
 * id; the no-prompt placeholder; the empty "no open asks" note; and the bounded, scrolling,
 * truncated presentation of many/long asks.
 */
import type { ParkedCallerAsk } from '@tai42/api-client';
import { flushResizeObservers, setElementOverflow } from '@tai42/studio-sdk/testing';
import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AsksList } from './AsksList';
import { renderWithProviders } from './test-utils';

/** Flips the list's measured vertical overflow and lets its observer see the change. */
function setListOverflowing(list: HTMLElement, overflowing: boolean): void {
  setElementOverflow(list, overflowing, 'vertical');
  act(() => {
    flushResizeObservers();
  });
}

const ONE_ASK: ParkedCallerAsk[] = [
  { id: 'ask-1', status: 'asking', question: 'Approve the deploy?' },
];

function renderList(props: Partial<Parameters<typeof AsksList>[0]> = {}) {
  return renderWithProviders(<AsksList asks={ONE_ASK} {...props} />, { client: {} });
}

describe('AsksList', () => {
  it('renders the prompt and the copyable ask id', () => {
    renderList();
    expect(screen.getByText('Approve the deploy?')).toBeInTheDocument();
    // The id is what an operator copies into a resume_parked run: it carries an
    // accessible label and selects whole in one gesture.
    const id = screen.getByLabelText('Ask id ask-1');
    expect(id).toHaveTextContent('ask-1');
    expect(id.style.userSelect).toBe('all');
  });

  it('renders a no-prompt placeholder for an ask with no question text', () => {
    const noPrompt: ParkedCallerAsk[] = [{ id: 'ask-2', status: 'asking' }];
    renderList({ asks: noPrompt });
    expect(screen.getByText('(no prompt)')).toBeInTheDocument();
  });

  it('states the empty case rather than a blank box', () => {
    renderList({ asks: [] });
    expect(screen.getByTestId('asks-empty')).toHaveTextContent(
      'This run parked with no open asks.',
    );
  });

  it('truncates each prompt with a full-text title tooltip inside a bounded scroll region', () => {
    const long = 'A very long caller-ask prompt '.repeat(20).trim();
    const many: ParkedCallerAsk[] = Array.from({ length: 12 }, (_, i) => ({
      id: `ask-${String(i)}`,
      status: 'asking',
      question: long,
    }));
    renderList({ asks: many });

    const list = screen.getByTestId('asks-list');
    // Bounded height + its own scroll, so many asks never grow the panel unbounded.
    expect(list.style.maxHeight).not.toBe('');
    expect(list.style.overflowY).toBe('auto');

    expect(within(list).getAllByTestId('ask-row')).toHaveLength(12);
    // Every prompt keeps its full text as a title tooltip while clipping to one line.
    for (const prompt of within(list).getAllByText(long)) {
      expect(prompt).toHaveAttribute('title', long);
      expect(prompt.style.textOverflow).toBe('ellipsis');
    }
  });

  it('is not a tab stop while the list fits its bounded height', () => {
    renderList({ asks: ONE_ASK });
    const list = screen.getByTestId('asks-list');
    setListOverflowing(list, false);
    expect(list).not.toHaveAttribute('tabindex');
    expect(list).not.toHaveAttribute('role');
    expect(list).not.toHaveAttribute('aria-label');
  });

  it('becomes a focusable, labelled scroll region once the asks overflow it', () => {
    const many: ParkedCallerAsk[] = Array.from({ length: 40 }, (_, i) => ({
      id: `ask-${String(i)}`,
      status: 'asking',
      question: `Ask ${String(i)}`,
    }));
    renderList({ asks: many });
    const list = screen.getByTestId('asks-list');
    setListOverflowing(list, true);
    // Keyboard-reachable (a tab stop) and named, so a screen reader announces the region.
    expect(screen.getByRole('region', { name: 'Caller asks' })).toBe(list);
    expect(list).toHaveAttribute('tabindex', '0');
  });
});
