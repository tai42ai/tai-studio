/**
 * Right pane of the trace explorer: the full detail for the selected span. A
 * header (name / kind / status / duration / model / tokens) over a body chosen by
 * the span's neutral kind:
 *   - an LLM span whose value is a GenAI message list → chat bubbles;
 *   - a tool → Arguments / Result;
 *   - anything else → a scale-guarded JSON tree.
 * Input / output trees offer the resolved view when they hold references to other
 * steps; `metadata` renders as its own guarded tree. Every payload is escaped — this
 * pane is never an HTML sink.
 */
import type { RunSpan } from '@tai42/api-client';
import { Badge, JsonTree } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { formatLatencyMs, formatTokenCount } from './format';
import { asMessages, SpanMessages } from './SpanMessages';
import { SpanValueSection } from './SpanReferences';
import { isErrorSpan, spanDurationMs, spanTokens } from './trace-tree';

const emptyStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  minHeight: '12rem',
  padding: 'var(--tai-space-6)',
  textAlign: 'center',
  color: 'var(--tai-color-text-muted)',
};

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
  padding: 'var(--tai-space-4)',
  height: '100%',
  overflow: 'auto',
};

/** Whether a JSON value carries anything worth rendering (skips `{}`/`[]`/null). */
function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function metadataIsMeaningful(metadata: unknown): boolean {
  return metadata !== null && typeof metadata === 'object' && Object.keys(metadata).length > 0;
}

/** The header's token cell: in and out when both are reported, else the total, else a dash. */
function tokenCell(span: RunSpan): string {
  if (span.inputTokens !== null && span.outputTokens !== null) {
    return `${formatTokenCount(span.inputTokens)} in · ${formatTokenCount(span.outputTokens)} out`;
  }
  const total = spanTokens(span);
  return span.totalTokens !== null || total > 0 ? `${formatTokenCount(total)} tokens` : '—';
}

function DetailSection({
  label,
  data,
  spanName,
}: {
  readonly label: string;
  readonly data: unknown;
  readonly spanName: string;
}): ReactNode {
  return (
    <div className="tai-stack tai-stack-2">
      <span className="tai-label">{label}</span>
      <JsonTree data={data} defaultExpanded={false} label={`${spanName} ${label.toLowerCase()}`} />
    </div>
  );
}

/** The detail header: name, type/error badges, the duration/model/token meta row, and
 * the error message when the span failed. */
function SpanHeader({
  span,
  spanName,
}: {
  readonly span: RunSpan;
  readonly spanName: string;
}): ReactNode {
  const duration = spanDurationMs(span);
  const error = isErrorSpan(span);
  return (
    <div className="tai-stack tai-stack-2">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--tai-space-2)',
          flexWrap: 'wrap',
        }}
      >
        <h3
          style={{ margin: 0, fontSize: 'var(--tai-text-md)', color: 'var(--tai-color-heading)' }}
        >
          {spanName}
        </h3>
        {span.kind !== null ? <Badge>{span.kind}</Badge> : null}
        {error ? <Badge variant="danger">error</Badge> : null}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--tai-space-1) var(--tai-space-4)',
          fontSize: 'var(--tai-text-sm)',
          color: 'var(--tai-color-text-muted)',
        }}
      >
        {duration !== null ? <span>{formatLatencyMs(duration)}</span> : null}
        {span.model !== null ? <span className="tai-mono">{span.model}</span> : null}
        <span>{tokenCell(span)}</span>
      </div>
      {error && span.statusMessage !== null ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--tai-text-sm)',
            color: 'var(--tai-color-err-text)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {span.statusMessage}
        </p>
      ) : null}
    </div>
  );
}

/** The kind-chosen payload body: chat bubbles for an LLM span's message list, Arguments/
 * Result for a tool, else guarded JSON — plus the metadata tree. */
function SpanBody({
  span,
  spanName,
  traceId,
}: {
  readonly span: RunSpan;
  readonly spanName: string;
  readonly traceId: string;
}): ReactNode {
  const isLlm = span.kind === 'LLM';
  const isTool = span.kind === 'TOOL';
  const inputMessages = isLlm ? asMessages(span.input) : null;
  const outputMessages = isLlm ? asMessages(span.output) : null;
  const inputLabel = isTool ? 'Arguments' : 'Input';
  const outputLabel = isTool ? 'Result' : 'Output';
  return (
    <>
      {inputMessages !== null ? (
        <SpanMessages messages={inputMessages} label="Messages" />
      ) : hasContent(span.input) ? (
        <SpanValueSection
          traceId={traceId}
          spanId={span.id}
          field="input"
          label={inputLabel}
          value={span.input}
          treeLabel={`${spanName} ${inputLabel.toLowerCase()}`}
        />
      ) : null}

      {outputMessages !== null ? (
        <SpanMessages messages={outputMessages} label="Output" />
      ) : hasContent(span.output) ? (
        <SpanValueSection
          traceId={traceId}
          spanId={span.id}
          field="output"
          label={outputLabel}
          value={span.output}
          treeLabel={`${spanName} ${outputLabel.toLowerCase()}`}
        />
      ) : null}

      {metadataIsMeaningful(span.metadata) ? (
        <DetailSection label="Metadata" data={span.metadata} spanName={spanName} />
      ) : null}
    </>
  );
}

export function SpanDetail({
  span,
  traceId,
}: {
  readonly span: RunSpan | null;
  readonly traceId: string;
}): ReactNode {
  if (span === null) {
    return (
      <div style={emptyStyle} data-testid="span-detail-empty">
        <p style={{ margin: 0 }}>Select a span to see its detail.</p>
      </div>
    );
  }

  const spanName = span.name ?? '(unnamed span)';

  return (
    <div style={panelStyle} data-testid="span-detail">
      <SpanHeader span={span} spanName={spanName} />
      {/* Keyed by span: every view choice inside the body (each tree's expansion, the
          As recorded | Resolved switch) starts at its default for each selected span. */}
      <SpanBody key={span.id} span={span} spanName={spanName} traceId={traceId} />
    </div>
  );
}
