/**
 * Right pane of the trace explorer: the full detail for the selected span. A
 * header (name / type / status / duration / model / tokens) over an adaptive body:
 *   - a generation whose input is message-shaped → chat bubbles;
 *   - a tool → Arguments / Result;
 *   - anything else → a scale-guarded JSON tree.
 * `usage` and `metadata` render as their own guarded trees. Every payload is
 * escaped — this pane is never an HTML sink.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { RunSpan } from '@tai42/api-client';
import { Badge, JsonTree } from '@tai42/studio-sdk';

import { formatLatencyMs, formatTokenCount } from './format';
import { spanDurationMs, isErrorSpan, spanTokens } from './trace-tree';
import { asMessages, SpanMessages } from './SpanMessages';

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

function usageIsMeaningful(usage: unknown): boolean {
  return usage !== null && typeof usage === 'object' && Object.keys(usage).length > 0;
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

export function SpanDetail({ span }: { readonly span: RunSpan | null }): ReactNode {
  if (span === null) {
    return (
      <div style={emptyStyle} data-testid="span-detail-empty">
        <p style={{ margin: 0 }}>Select a span to see its detail.</p>
      </div>
    );
  }

  const spanName = span.name ?? '(unnamed span)';
  const duration = spanDurationMs(span);
  const tokens = spanTokens(span.usage);
  const error = isErrorSpan(span);
  const type = (span.type ?? '').toUpperCase();
  const inputMessages = type === 'GENERATION' || type === 'LLM' ? asMessages(span.input) : null;
  const outputMessages = inputMessages !== null ? asMessages(span.output) : null;
  const isTool = type === 'TOOL';

  return (
    <div style={panelStyle} data-testid="span-detail">
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
          {span.type !== null ? <Badge>{span.type}</Badge> : null}
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
          {tokens > 0 ? <span>{formatTokenCount(tokens)} tokens</span> : null}
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

      {inputMessages !== null ? (
        <SpanMessages messages={inputMessages} label="Messages" />
      ) : hasContent(span.input) ? (
        <DetailSection
          label={isTool ? 'Arguments' : 'Input'}
          data={span.input}
          spanName={spanName}
        />
      ) : null}

      {outputMessages !== null ? (
        <SpanMessages messages={outputMessages} label="Output" />
      ) : hasContent(span.output) ? (
        <DetailSection
          label={isTool ? 'Result' : 'Output'}
          data={span.output}
          spanName={spanName}
        />
      ) : null}

      {usageIsMeaningful(span.usage) ? (
        <DetailSection label="Usage" data={span.usage} spanName={spanName} />
      ) : null}

      {usageIsMeaningful(span.metadata) ? (
        <DetailSection label="Metadata" data={span.metadata} spanName={spanName} />
      ) : null}
    </div>
  );
}
