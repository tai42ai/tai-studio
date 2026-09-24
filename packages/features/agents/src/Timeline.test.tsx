import type { ParsedAgentEvent } from '@tai42/api-client';
import { fireEvent, type RenderResult, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ERROR_TRANSCRIPT,
  FULL_TRANSCRIPT,
  INTERRUPT_TRANSCRIPT,
  NO_DATA_TRANSCRIPT,
  OPEN_TRANSCRIPT,
  parse,
  RECURSION_LIMIT_TRANSCRIPT,
  STRUCTURED_UNRESOLVED_TRANSCRIPT,
  UNKNOWN_TRANSCRIPT,
  XSS_TRANSCRIPT,
} from './fixtures';
import { renderWithProviders, stubClient } from './test-utils';
import { isAtBottom, Timeline } from './Timeline';

function renderTimeline(transcript: string): void {
  renderWithProviders(<Timeline events={parse(transcript)} />, stubClient({}));
}

function renderTimelineEvents(events: ParsedAgentEvent[]): RenderResult {
  return renderWithProviders(<Timeline events={events} />, stubClient({}));
}

// Force a scroll box's geometry under jsdom, which lays nothing out. `scrollTop`
// stays writable so the follow effect's programmatic scroll actually lands.
function setGeometry(
  el: HTMLElement,
  geometry: { scrollHeight: number; clientHeight: number; scrollTop: number },
): void {
  let scrollTop = geometry.scrollTop;
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => geometry.scrollHeight,
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => geometry.clientHeight,
  });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
}

describe('Timeline rendering', () => {
  it('renders every event type in the full sequence', () => {
    renderTimeline(FULL_TRANSCRIPT);
    expect(screen.getByTestId('timeline-reasoning')).toBeInTheDocument();
    const tool = screen.getByTestId('timeline-tool');
    expect(tool).toHaveTextContent('search');
    expect(tool).toHaveTextContent('hits');
    expect(screen.getByTestId('timeline-message')).toHaveTextContent('Here you go');
    expect(screen.getByTestId('timeline-usage')).toHaveTextContent('total 14');
    expect(screen.getByTestId('timeline-structured')).toHaveTextContent('ok');
  });

  it('renders the interrupt as a card linking to the interactions inbox', () => {
    renderTimeline(INTERRUPT_TRANSCRIPT);
    const card = screen.getByTestId('timeline-interrupt');
    expect(card).toHaveTextContent('needs input');
    expect(within(card).getByRole('link', { name: /interactions inbox/i })).toBeInTheDocument();
  });

  it('renders an unknown event as a labeled raw-JSON row', () => {
    renderTimeline(UNKNOWN_TRANSCRIPT);
    const row = screen.getByTestId('timeline-unknown');
    expect(row).toHaveAttribute('data-event-type', 'future_thing');
    expect(row).toHaveTextContent('future_thing');
  });

  it('renders a stream.error as a loud inline error', () => {
    renderTimeline(ERROR_TRANSCRIPT);
    expect(screen.getByTestId('timeline-error')).toHaveTextContent('boom');
  });

  it('renders a structured-output-unresolved terminal as an outcome, not an error', () => {
    renderTimeline(STRUCTURED_UNRESOLVED_TRANSCRIPT);
    const card = screen.getByTestId('timeline-structured-unresolved');
    expect(card).toHaveTextContent('Answer');
    expect(card).toHaveTextContent('4 attempts');
    expect(card).toHaveTextContent('not valid');
    // A non-fatal typed terminal is never surfaced as a stream error.
    expect(screen.queryByTestId('timeline-error')).toBeNull();
  });

  it('renders a recursion-limit terminal as an outcome, not an error', () => {
    renderTimeline(RECURSION_LIMIT_TRANSCRIPT);
    const card = screen.getByTestId('timeline-recursion-limit');
    expect(card).toHaveTextContent('Step limit reached');
    expect(card).toHaveTextContent('25');
    expect(screen.queryByTestId('timeline-error')).toBeNull();
  });

  it('renders a printable token when structured data / tool result is absent', () => {
    renderTimeline(NO_DATA_TRANSCRIPT);
    // Absent `data` / `result` (undefined) coerces to the literal 'undefined'
    // rather than passing a non-string into CodeBlock.
    expect(screen.getByTestId('timeline-structured')).toHaveTextContent('undefined');
    const tool = screen.getByTestId('timeline-tool');
    expect(tool).toHaveTextContent('undefined');
  });

  it('renders agent text ESCAPED, never as HTML (XSS pin)', () => {
    renderTimeline(XSS_TRANSCRIPT);
    const message = screen.getByTestId('timeline-message');
    // The script text is present as literal text, and no real <script> element
    // was injected into the DOM — the markdown renderer is escaped-by-construction.
    expect(message).toHaveTextContent('<script>alert(1)</script>');
    expect(message.querySelector('script')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('renders agent markdown as formatted prose, not raw markers', () => {
    renderTimeline('data: {"type":"message_final","text":"**bold** and `code`"}\n\n');
    const message = screen.getByTestId('timeline-message');
    // `**bold**` becomes real emphasis and the backtick span becomes inline code,
    // rather than leaking the literal markers.
    expect(message.querySelector('strong')).toHaveTextContent('bold');
    expect(message.querySelector('code')).toHaveTextContent('code');
    expect(message.textContent).not.toContain('**');
  });
});

describe('Timeline copy affordance', () => {
  it('exposes a copy control on each JSON call site', () => {
    renderTimeline(FULL_TRANSCRIPT);
    const tool = screen.getByTestId('timeline-tool');
    // The args block and the result block each carry the CodeBlock copy button.
    const copies = within(tool).getAllByRole('button', { name: 'Copy code' });
    expect(copies.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Timeline autoscroll', () => {
  it('is at bottom within the slack and detached beyond it', () => {
    expect(isAtBottom({ scrollHeight: 100, scrollTop: 68, clientHeight: 0 })).toBe(true);
    expect(isAtBottom({ scrollHeight: 100, scrollTop: 60, clientHeight: 0 })).toBe(false);
    // A wider slack still counts the same position as at-bottom.
    expect(isAtBottom({ scrollHeight: 100, scrollTop: 60, clientHeight: 0 }, 40)).toBe(true);
  });

  it('hides the jump affordance while pinned to the tail', () => {
    renderTimeline(FULL_TRANSCRIPT);
    expect(screen.queryByTestId('timeline-jump')).toBeNull();
  });

  it('reveals the jump affordance on a scroll-up and re-pins on click', () => {
    renderTimeline(FULL_TRANSCRIPT);
    const region = screen.getByTestId('agent-timeline');

    // Scroll up, away from the tail: the affordance appears.
    setGeometry(region, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
    fireEvent.scroll(region);
    const jump = screen.getByRole('button', { name: 'Jump to latest' });

    fireEvent.click(jump);
    // The click scrolls the region to its exact bottom and re-pins, so the
    // affordance withdraws.
    expect(region.scrollTop).toBe(1000);
    expect(screen.queryByTestId('timeline-jump')).toBeNull();
  });

  it('follows the tail on new content while pinned, and stops once detached', () => {
    const view = renderTimelineEvents(parse(OPEN_TRANSCRIPT));
    const region = screen.getByTestId('agent-timeline');

    // Pinned: new content scrolls the region straight to its bottom edge.
    setGeometry(region, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
    view.rerender(<Timeline events={parse(FULL_TRANSCRIPT)} />);
    expect(region.scrollTop).toBe(1000);

    // Detach by scrolling up, then add more content: the viewport is left put.
    setGeometry(region, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
    fireEvent.scroll(region);
    view.rerender(<Timeline events={parse(FULL_TRANSCRIPT).concat(parse(UNKNOWN_TRANSCRIPT))} />);
    expect(region.scrollTop).toBe(0);
  });

  it('follows to the exact bottom, so a scroll event mid-stream never unpins', () => {
    const view = renderTimelineEvents(parse(OPEN_TRANSCRIPT));
    const region = screen.getByTestId('agent-timeline');

    // The follow lands at the exact bottom (an instant container scroll), not an
    // intermediate position a smooth animation would pass through.
    setGeometry(region, { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 });
    view.rerender(<Timeline events={parse(FULL_TRANSCRIPT)} />);
    expect(region.scrollTop).toBe(1000);

    // A scroll event now reads that bottom position: pinned holds, no affordance.
    fireEvent.scroll(region);
    expect(screen.queryByTestId('timeline-jump')).toBeNull();
  });
});
