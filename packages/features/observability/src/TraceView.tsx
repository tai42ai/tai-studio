/**
 * Per-run trace view — the observation/span tree for one trace, fetched via
 * `getRunTrace`. Spans nest by `parentId`; each row shows a kind badge (from
 * `span.type`), level-driven coloring (from `span.level`), and start/end timing.
 * Every span/trace string — names, status messages, tool input/output — renders
 * as ESCAPED text through DS components (`JsonTree` / plain React children), so a
 * payload containing markup can never become an HTML sink. A missing trace (404)
 * and any other failure surface as a loud, visible error.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RunSpan, RunTrace } from '@tai42/api-client';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  ErrorState,
  JsonTree,
  Skeleton,
  downloadBlob,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { formatLatencyMs, formatTimestamp } from './format';
import { traceKey } from './keys';
import { isReadNotSupported, ReadNotSupported } from './read-support';

interface FlatSpan {
  readonly span: RunSpan;
  readonly depth: number;
}

/** Depth-first flatten of the span forest, nesting by `parentId`. */
function flattenSpans(spans: readonly RunSpan[]): FlatSpan[] {
  const childrenOf = new Map<string | null, RunSpan[]>();
  const ids = new Set(spans.map((s) => s.id));
  for (const span of spans) {
    // A span whose parent is absent from this trace is treated as a root.
    const parent = span.parentId !== null && ids.has(span.parentId) ? span.parentId : null;
    const bucket = childrenOf.get(parent) ?? [];
    bucket.push(span);
    childrenOf.set(parent, bucket);
  }

  const out: FlatSpan[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const span of childrenOf.get(parentId) ?? []) {
      out.push({ span, depth });
      walk(span.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function spanDurationMs(span: RunSpan): number | null {
  if (span.start === null || span.end === null) return null;
  const start = new Date(span.start).getTime();
  const end = new Date(span.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return end - start;
}

/** Map a monitoring level string onto a text color token; unknown → default. */
function levelColor(level: string | null): string {
  switch ((level ?? '').toUpperCase()) {
    case 'ERROR':
      return 'var(--tai-color-err-text)';
    case 'WARNING':
      return 'var(--tai-color-warn-text)';
    case 'DEBUG':
      return 'var(--tai-color-text-muted)';
    default:
      return 'var(--tai-color-text)';
  }
}

const disclosureStyle: CSSProperties = {
  fontFamily: 'var(--tai-font-sans)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
  cursor: 'pointer',
  marginTop: 'var(--tai-space-1)',
};

function SpanRow({ span, depth }: FlatSpan): ReactNode {
  const duration = spanDurationMs(span);
  const spanName = span.name ?? '(unnamed span)';
  return (
    <div
      style={{
        paddingLeft: `calc(${String(depth)} * var(--tai-space-4))`,
        borderLeft: depth > 0 ? '1px solid var(--tai-color-border)' : undefined,
        marginLeft: depth > 0 ? 'var(--tai-space-1)' : undefined,
        padding: 'var(--tai-space-2) 0 var(--tai-space-2) var(--tai-space-3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--tai-space-2)',
          flexWrap: 'wrap',
        }}
      >
        {span.type !== null ? <Badge>{span.type}</Badge> : null}
        <span style={{ fontWeight: 600, color: levelColor(span.level) }}>{spanName}</span>
        {span.level !== null ? (
          <span style={{ fontSize: 'var(--tai-text-sm)', color: levelColor(span.level) }}>
            {span.level}
          </span>
        ) : null}
        {duration !== null ? (
          <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
            {formatLatencyMs(duration)}
          </span>
        ) : null}
        {span.model !== null ? (
          <span
            className="tai-mono"
            style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}
          >
            {span.model}
          </span>
        ) : null}
      </div>
      {span.statusMessage !== null ? (
        <p
          style={{
            margin: 'var(--tai-space-1) 0 0',
            fontSize: 'var(--tai-text-sm)',
            color: levelColor(span.level),
            whiteSpace: 'pre-wrap',
          }}
        >
          {span.statusMessage}
        </p>
      ) : null}
      <details style={{ marginTop: 'var(--tai-space-1)' }}>
        <summary style={disclosureStyle}>Input / output</summary>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--tai-space-2)',
            marginTop: 'var(--tai-space-2)',
          }}
        >
          <div>
            <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
              Input
            </span>
            <JsonTree data={span.input} label={`${spanName} input`} />
          </div>
          <div>
            <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
              Output
            </span>
            <JsonTree data={span.output} label={`${spanName} output`} />
          </div>
        </div>
      </details>
    </div>
  );
}

function Loaded({
  trace,
  traceId,
}: {
  readonly trace: RunTrace;
  readonly traceId: string;
}): ReactNode {
  const api = useApi();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const flat = flattenSpans(trace.spans);

  const onExport = (): void => {
    setExporting(true);
    setExportError(null);
    api
      .exportTrace(traceId)
      .then((blob) => {
        downloadBlob(blob, `trace-${traceId}.json`);
      })
      .catch((error: unknown) => {
        setExportError(errorMessage(error));
      })
      .finally(() => {
        setExporting(false);
      });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-3)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: 'var(--tai-space-2)', flexWrap: 'wrap' }}>
            {trace.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <p
            style={{
              margin: 'var(--tai-space-1) 0 0',
              color: 'var(--tai-color-text-muted)',
              fontSize: 'var(--tai-text-sm)',
            }}
          >
            {formatTimestamp(trace.timestamp)}
            {trace.availability !== 'full' ? ` · ${trace.availability}` : ''}
          </p>
        </div>
        <Button onClick={onExport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export trace'}
        </Button>
      </div>

      {exportError !== null ? <ErrorState message={exportError} /> : null}
      {trace.fetchError !== null ? <ErrorState message={trace.fetchError} /> : null}

      <Card>
        {flat.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
            This trace has no recorded spans.
          </p>
        ) : (
          <div>
            {flat.map(({ span, depth }) => (
              <SpanRow key={span.id} span={span} depth={depth} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function TraceView({
  traceId,
  onBack,
}: {
  readonly traceId: string;
  readonly onBack: () => void;
}): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: traceKey(traceId),
    queryFn: ({ signal }) => api.getRunTrace(traceId, signal),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeftIcon />
          Back to runs
        </Button>
      </div>
      {query.isPending ? (
        <Skeleton height={160} />
      ) : query.isError ? (
        isReadNotSupported(query.error) ? (
          <ReadNotSupported />
        ) : (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        )
      ) : (
        <Loaded trace={query.data} traceId={traceId} />
      )}
    </div>
  );
}
