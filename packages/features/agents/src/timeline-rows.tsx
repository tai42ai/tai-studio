/**
 * The per-item timeline renderers and their dispatcher.
 *
 * SAFETY: every payload — reasoning text, tool args/result, message text,
 * structured data, an unknown frame — reaches the DOM as TEXT (React escapes it),
 * inside `CodeBlock`, or through `Markdown`; each is escaped-by-construction and no
 * HTML sink ever touches an agent-supplied string. `Markdown` renders its source as
 * React elements and text children (no `dangerouslySetInnerHTML`), so the message
 * row honours the same no-HTML-sink contract as the raw-text rows.
 */
import { AppLink, Badge, Card, CodeBlock, ErrorState, Markdown } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import type { TimelineItem } from './timeline-model';

function pretty(value: unknown): string {
  // `JSON.stringify(undefined)` returns `undefined` (not a string), and an
  // omitted `structured_final.data` / `tool_result.result` (both `z.unknown()`
  // with no default) is exactly that. Coerce to a printable token so a string
  // always reaches `CodeBlock`.
  return value === undefined ? 'undefined' : JSON.stringify(value, null, 2);
}

// Layout only: preserve newlines and break long unbroken runs. Colour and face
// inherit from the body text and surrounding classes.
const messageStyle: CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

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

/** Render one timeline item as its typed row. */
export function TimelineRow({ item }: { readonly item: TimelineItem }): ReactNode {
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
