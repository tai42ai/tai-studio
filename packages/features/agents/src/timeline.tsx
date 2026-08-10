/**
 * The streaming run timeline: it folds the flat parsed-event stream into ordered
 * display items and renders one control per event type.
 *
 * FOLD (`buildTimeline`): `message_delta`s accumulate into one growing assistant
 * bubble that `message_final` settles; a `tool_result_step` pairs onto its
 * `tool_call_step` by `call_id` (an unmatched result renders standalone, never
 * dropped); every other event maps to its own item, and an UNKNOWN `type` is kept
 * as a labeled raw-JSON row (forward-compat, visible, never silently skipped).
 *
 * SAFETY: every payload — reasoning text, tool args/result, message text,
 * structured data, an unknown frame — reaches the DOM as TEXT (React escapes it),
 * inside `CodeBlock`, or through `Markdown`; each is escaped-by-construction and
 * no HTML sink ever touches an agent-supplied string. `Markdown` renders its
 * source as React elements and text children (no `dangerouslySetInnerHTML`, no
 * raw-HTML passthrough), so the message row honours the same no-HTML-sink
 * contract as the raw-text rows. Pinned by a test.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ParsedAgentEvent } from '@tai42/api-client';
import {
  AppLink,
  ArrowDownIcon,
  Badge,
  Button,
  Card,
  CodeBlock,
  ErrorState,
  Markdown,
} from '@tai42/studio-sdk';

// -- item model --------------------------------------------------------------

export type TimelineItem =
  | { readonly kind: 'reasoning'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'tool';
      readonly id: string;
      readonly tool: string;
      readonly args: Record<string, unknown>;
      readonly callId: string;
      readonly hasResult: boolean;
      readonly result: unknown;
      readonly isError: boolean;
    }
  | {
      readonly kind: 'message';
      readonly id: string;
      readonly text: string;
      readonly settled: boolean;
    }
  | {
      readonly kind: 'usage';
      readonly id: string;
      readonly inputTokens: number | null;
      readonly outputTokens: number | null;
      readonly totalTokens: number | null;
      readonly model: string | null;
    }
  | { readonly kind: 'structured'; readonly id: string; readonly data: unknown }
  | {
      readonly kind: 'interrupt';
      readonly id: string;
      readonly interruptId: string;
      readonly reason: string | null;
      readonly payload: unknown;
    }
  | { readonly kind: 'error'; readonly id: string; readonly message: string }
  | { readonly kind: 'unknown'; readonly id: string; readonly type: string; readonly raw: unknown };

/** Whether the folded stream has reached a terminal frame (`stream.end`/`.error`). */
export interface TimelineFold {
  readonly items: TimelineItem[];
  readonly finished: boolean;
  readonly errored: boolean;
}

// The two variants patched in place during the fold: the growing message bubble
// (`text`/`settled`) and the tool call awaiting its paired result
// (`hasResult`/`result`/`isError`). They are the mutable twins of the readonly
// `TimelineItem` members of the same `kind` — mutable is assignable to readonly,
// so the built array narrows to `TimelineItem[]` with no cast.
interface MutableMessage {
  kind: 'message';
  id: string;
  text: string;
  settled: boolean;
}

interface MutableTool {
  kind: 'tool';
  id: string;
  tool: string;
  args: Record<string, unknown>;
  callId: string;
  hasResult: boolean;
  result: unknown;
  isError: boolean;
}

// Every fold item: the two mutable twins above plus the remaining `TimelineItem`
// variants, which are pushed once and never patched.
type MutableItem =
  | MutableMessage
  | MutableTool
  | Extract<
      TimelineItem,
      { kind: 'reasoning' | 'usage' | 'structured' | 'interrupt' | 'error' | 'unknown' }
    >;

function pretty(value: unknown): string {
  // `JSON.stringify(undefined)` returns `undefined` (not a string), and an
  // omitted `structured_final.data` / `tool_result.result` (both `z.unknown()`
  // with no default) is exactly that. Coerce to a printable token so a string
  // always reaches `CodeBlock`.
  return value === undefined ? 'undefined' : JSON.stringify(value, null, 2);
}

/**
 * Fold the ordered parsed events into display items. Pure — the same input
 * always yields the same items, so it is trivially testable against a fixture.
 */
export function buildTimeline(events: ParsedAgentEvent[]): TimelineFold {
  const items: MutableItem[] = [];
  const toolByCall = new Map<string, MutableTool>();
  let message: MutableMessage | null = null;
  // Set when a non-message event folds while a bubble is open: the next
  // `message_delta` then settles that bubble and starts a fresh one, so an
  // interleaved event does not merge later deltas out of order. `message_final`
  // still reconciles the open bubble regardless (it carries the full text).
  let interleavedSinceDelta = false;
  let finished = false;
  let errored = false;

  const settleOpenMessage = (): void => {
    if (message) {
      message.settled = true;
      message = null;
    }
    interleavedSinceDelta = false;
  };

  events.forEach((parsed, index) => {
    const id = `evt-${String(index)}`;
    if (!parsed.known) {
      if (message) interleavedSinceDelta = true;
      items.push({ kind: 'unknown', id, type: parsed.unknown.type, raw: parsed.unknown.raw });
      return;
    }
    const event = parsed.event;
    if (message && event.type !== 'message_delta' && event.type !== 'message_final') {
      interleavedSinceDelta = true;
    }
    switch (event.type) {
      case 'reasoning_step':
        items.push({ kind: 'reasoning', id, text: event.text });
        break;
      case 'tool_call_step': {
        const item: MutableTool = {
          kind: 'tool',
          id,
          tool: event.tool,
          args: event.args,
          callId: event.call_id,
          hasResult: false,
          result: undefined,
          isError: false,
        };
        items.push(item);
        toolByCall.set(event.call_id, item);
        break;
      }
      case 'tool_result_step': {
        const call = toolByCall.get(event.call_id);
        if (call) {
          call.hasResult = true;
          call.result = event.result;
          call.isError = event.is_error;
          toolByCall.delete(event.call_id);
        } else {
          // An unmatched result still renders — as a standalone tool item with no
          // preceding call — rather than being dropped.
          items.push({
            kind: 'tool',
            id,
            tool: event.tool,
            args: {},
            callId: event.call_id,
            hasResult: true,
            result: event.result,
            isError: event.is_error,
          });
        }
        break;
      }
      case 'message_delta':
        if (message && !interleavedSinceDelta) {
          message.text += event.text;
        } else {
          // No open bubble, or an event interleaved since the last delta: settle
          // the prior bubble (if any) in order and start a fresh one.
          settleOpenMessage();
          message = { kind: 'message', id, text: event.text, settled: false };
          items.push(message);
        }
        break;
      case 'message_final':
        if (message) {
          message.text = event.text;
          message.settled = true;
        } else {
          items.push({ kind: 'message', id, text: event.text, settled: true });
        }
        message = null;
        interleavedSinceDelta = false;
        break;
      case 'run_usage':
        items.push({
          kind: 'usage',
          id,
          inputTokens: event.input_tokens,
          outputTokens: event.output_tokens,
          totalTokens: event.total_tokens,
          model: event.model,
        });
        break;
      case 'structured_final':
        items.push({ kind: 'structured', id, data: event.data });
        break;
      case 'interrupt_final':
        items.push({
          kind: 'interrupt',
          id,
          interruptId: event.interrupt_id,
          reason: event.reason,
          payload: event.payload,
        });
        break;
      case 'stream.end':
        finished = true;
        break;
      case 'stream.error':
        items.push({ kind: 'error', id, message: event.message });
        errored = true;
        finished = true;
        break;
    }
  });

  return { items, finished, errored };
}

// -- styles ------------------------------------------------------------------

// Layout only: preserve newlines and break long unbroken runs. Colour and face
// inherit from the body text and surrounding classes.
const messageStyle: CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

// -- per-item renderers ------------------------------------------------------

function ReasoningRow({
  item,
}: {
  readonly item: Extract<TimelineItem, { kind: 'reasoning' }>;
}): ReactNode {
  return (
    <Card>
      <details data-testid="timeline-reasoning" className="tai-stack tai-stack-2">
        <summary style={{ cursor: 'pointer' }}>
          <span className="tai-muted">Reasoning</span>
        </summary>
        <p style={messageStyle}>{item.text}</p>
      </details>
    </Card>
  );
}

function ToolRow({ item }: { readonly item: Extract<TimelineItem, { kind: 'tool' }> }): ReactNode {
  return (
    <Card>
      <div className="tai-stack-2" data-testid="timeline-tool" data-call-id={item.callId}>
        <div className="tai-row">
          <Badge variant={item.isError ? 'danger' : 'primary'}>Tool</Badge>
          <span className="tai-mono">{item.tool}</span>
        </div>
        <CodeBlock code={pretty(item.args)} language="args" />
        {item.hasResult ? (
          <CodeBlock code={pretty(item.result)} language={item.isError ? 'error' : 'result'} />
        ) : (
          <span className="tai-muted" data-testid="timeline-tool-pending">
            Running…
          </span>
        )}
      </div>
    </Card>
  );
}

function MessageRow({
  item,
}: {
  readonly item: Extract<TimelineItem, { kind: 'message' }>;
}): ReactNode {
  return (
    <Card>
      <div data-testid="timeline-message" data-settled={item.settled ? 'true' : 'false'}>
        {/* Agent text is markdown: render it through the SDK's safe renderer,
            which escapes every author-supplied string (no HTML sink) — raw
            `**`/`#`/backtick noise becomes real prose. */}
        <Markdown markdown={item.text} />
      </div>
    </Card>
  );
}

function UsageRow({
  item,
}: {
  readonly item: Extract<TimelineItem, { kind: 'usage' }>;
}): ReactNode {
  const chips: string[] = [];
  if (item.model !== null) chips.push(item.model);
  if (item.inputTokens !== null) chips.push(`in ${String(item.inputTokens)}`);
  if (item.outputTokens !== null) chips.push(`out ${String(item.outputTokens)}`);
  if (item.totalTokens !== null) chips.push(`total ${String(item.totalTokens)}`);
  return (
    <div className="tai-row" data-testid="timeline-usage">
      {chips.map((chip) => (
        <Badge key={chip} variant="neutral">
          {chip}
        </Badge>
      ))}
    </div>
  );
}

function StructuredRow({
  item,
}: {
  readonly item: Extract<TimelineItem, { kind: 'structured' }>;
}): ReactNode {
  return (
    <Card>
      <div className="tai-stack-2" data-testid="timeline-structured">
        <span className="tai-muted">Structured output</span>
        <CodeBlock code={pretty(item.data)} language="json" />
      </div>
    </Card>
  );
}

function InterruptRow({
  item,
}: {
  readonly item: Extract<TimelineItem, { kind: 'interrupt' }>;
}): ReactNode {
  return (
    <Card>
      <div className="tai-stack-2" data-testid="timeline-interrupt">
        <div className="tai-row">
          <Badge variant="warning">Waiting on you</Badge>
          {item.reason !== null ? <span>{item.reason}</span> : null}
        </div>
        <span className="tai-muted">
          The agent is asking a question. Answer it in the{' '}
          <AppLink to="interactions" aria-label="Open the interactions inbox">
            interactions inbox
          </AppLink>
          .
        </span>
        {item.payload !== undefined && item.payload !== null ? (
          <CodeBlock code={pretty(item.payload)} language="question" />
        ) : null}
      </div>
    </Card>
  );
}

function ErrorRow({
  item,
}: {
  readonly item: Extract<TimelineItem, { kind: 'error' }>;
}): ReactNode {
  return (
    <div data-testid="timeline-error">
      <ErrorState message={item.message} />
    </div>
  );
}

function UnknownRow({
  item,
}: {
  readonly item: Extract<TimelineItem, { kind: 'unknown' }>;
}): ReactNode {
  return (
    <Card>
      <div className="tai-stack-2" data-testid="timeline-unknown" data-event-type={item.type}>
        <div className="tai-row">
          <Badge variant="neutral">Unknown event</Badge>
          <span className="tai-mono">{item.type}</span>
        </div>
        <CodeBlock code={pretty(item.raw)} language="json" />
      </div>
    </Card>
  );
}

function TimelineRow({ item }: { readonly item: TimelineItem }): ReactNode {
  switch (item.kind) {
    case 'reasoning':
      return <ReasoningRow item={item} />;
    case 'tool':
      return <ToolRow item={item} />;
    case 'message':
      return <MessageRow item={item} />;
    case 'usage':
      return <UsageRow item={item} />;
    case 'structured':
      return <StructuredRow item={item} />;
    case 'interrupt':
      return <InterruptRow item={item} />;
    case 'error':
      return <ErrorRow item={item} />;
    case 'unknown':
      return <UnknownRow item={item} />;
  }
}

// -- autoscroll --------------------------------------------------------------

/** How close to the bottom edge (px) still counts as "pinned to the tail". */
const BOTTOM_SLACK_PX = 32;

// The timeline is its OWN scroll region so following the tail never drags the
// input form above it off-screen: the form stays put and the transcript scrolls
// beneath it. Bounded by the viewport so it never grows without limit.
const timelineFrameStyle: CSSProperties = { position: 'relative' };
const timelineScrollStyle: CSSProperties = { maxHeight: '60vh', overflowY: 'auto' };

// The jump affordance floats over the bottom of the scroll region. The wrapper
// lets clicks fall through to the transcript behind it; only the button itself
// is a target.
const jumpWrapStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 'var(--tai-space-3)',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
};
const jumpButtonStyle: CSSProperties = { pointerEvents: 'auto' };

/**
 * Whether a scroll box sits within `slack` pixels of its bottom edge — the test
 * that gates tail-following. Pure over the three geometry reads, so the decision
 * is unit-testable without a live layout.
 */
export function isAtBottom(
  el: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
  slack: number = BOTTOM_SLACK_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= slack;
}

/**
 * Render the folded event stream as an ordered timeline with smart autoscroll:
 * while the viewport is pinned to the bottom, new content pulls the tail into
 * view; scrolling up detaches the follow, and a "Jump to latest" affordance
 * appears so the reader can re-pin. The transcript is its own scroll region, so
 * following never moves the input form above it.
 */
export function Timeline({ events }: { readonly events: ParsedAgentEvent[] }): ReactNode {
  const { items } = buildTimeline(events);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  // A manual scroll re-decides whether we are still at the tail: scrolling up
  // detaches the follow (and reveals the jump affordance); scrolling back down
  // re-arms it.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    setPinned(isAtBottom(el));
  }, []);

  // Jump the scroll region straight to its bottom. Instant and container-only: a
  // smooth or window-level scroll would emit intermediate non-bottom scroll
  // events that flip `pinned` off and drag the input form out of the region.
  const scrollToTail = useCallback(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, []);

  // Follow the tail on new content while pinned. The event count is the growth
  // signal: it advances on a fresh item AND on a delta that folds into the open
  // bubble (item count unchanged). Detached, the viewport stays put.
  const eventCount = events.length;
  useEffect(() => {
    if (pinned) scrollToTail();
  }, [eventCount, pinned, scrollToTail]);

  const jumpToLatest = useCallback(() => {
    scrollToTail();
    setPinned(true);
  }, [scrollToTail]);

  return (
    <div style={timelineFrameStyle}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="tai-stack tai-stack-3"
        data-testid="agent-timeline"
        style={timelineScrollStyle}
      >
        {items.map((item) => (
          <TimelineRow key={item.id} item={item} />
        ))}
      </div>
      {!pinned ? (
        <div style={jumpWrapStyle}>
          <Button
            type="button"
            variant="secondary"
            onClick={jumpToLatest}
            style={jumpButtonStyle}
            data-testid="timeline-jump"
            aria-label="Jump to latest"
          >
            <ArrowDownIcon />
            Jump to latest
          </Button>
        </div>
      ) : null}
    </div>
  );
}
