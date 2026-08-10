/**
 * Per-run trace explorer — the two-pane master/detail over one trace fetched
 * via `getRunTrace`. A summary bar (status, duration, cost, tokens, span count)
 * sits above the {@link TraceWaterfall} (span tree + timeline, left) and the
 * {@link SpanDetail} (the selected span, right); the first error span — else the
 * first root — is auto-selected on open.
 *
 * Every span/trace string renders as ESCAPED text through DS components, so a
 * payload containing markup can never become an HTML sink. The availability states
 * are driven off the wire's own `availability` enum and `fetchError`: a missing
 * trace (404) and an `unavailable` trace render a dedicated "not available" state
 * — never a retry-forever error — while a `partial` trace shows its spans with the
 * fetch error surfaced loudly above them.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, type RunTrace } from '@tai42/api-client';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  downloadBlob,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { formatCost, formatLatencyMs, formatTokenCount } from './format';
import { traceKey } from './keys';
import { isReadNotSupported, ReadNotSupported } from './read-support';
import { buildTree, defaultSelectedId, traceTotals } from './trace-tree';
import { TraceWaterfall } from './TraceWaterfall';
import { SpanDetail } from './SpanDetail';

/** True when the failure is a 404 — a trace that does not exist. Retrying is futile. */
function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

const summaryBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  flexWrap: 'wrap',
  padding: 'var(--tai-space-3) var(--tai-space-4)',
  borderBottom: '1px solid var(--tai-color-border)',
};

const paneRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'stretch',
  minHeight: '24rem',
};

const leftPaneStyle: CSSProperties = {
  flex: '1 1 22rem',
  minWidth: '18rem',
  borderRight: '1px solid var(--tai-color-border)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

const rightPaneStyle: CSSProperties = {
  flex: '1 1 20rem',
  minWidth: '16rem',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

function SummaryStat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: 'var(--tai-text-xs)', color: 'var(--tai-color-text-muted)' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text)' }}>
        {value}
      </span>
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

  const tree = useMemo(() => buildTree(trace.spans), [trace.spans]);
  const totals = useMemo(() => traceTotals(trace, tree), [trace, tree]);

  // Default selection (first error, else first root), re-applied whenever the
  // trace changes — derived during render, keyed by traceId — so switching runs
  // resets the selection instead of stranding the previous trace's span id.
  const [seenTrace, setSeenTrace] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (seenTrace !== traceId) {
    setSeenTrace(traceId);
    setSelectedId(defaultSelectedId(tree));
  }

  const selectedSpan = selectedId !== null ? (tree.byId.get(selectedId)?.span ?? null) : null;

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      {trace.fetchError !== null ? (
        <ErrorState message={`This trace is partial: ${trace.fetchError}`} />
      ) : null}
      {exportError !== null ? <ErrorState message={exportError} /> : null}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={summaryBarStyle} data-testid="trace-summary">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--tai-space-4)',
              flexWrap: 'wrap',
            }}
          >
            <Badge variant={totals.status === 'error' ? 'danger' : 'success'}>
              {totals.status}
            </Badge>
            <SummaryStat label="Duration" value={formatLatencyMs(totals.durationMs)} />
            <SummaryStat label="Cost" value={formatCost(totals.totalCost)} />
            <SummaryStat label="Tokens" value={formatTokenCount(totals.totalTokens)} />
            <SummaryStat label="Spans" value={String(totals.spanCount)} />
            {trace.tags.length > 0 ? (
              <div style={{ display: 'flex', gap: 'var(--tai-space-1)', flexWrap: 'wrap' }}>
                {trace.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            ) : null}
          </div>
          <Button onClick={onExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export trace'}
          </Button>
        </div>

        {tree.roots.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: 'var(--tai-space-4)',
              color: 'var(--tai-color-text-muted)',
            }}
          >
            This trace has no recorded spans.
          </p>
        ) : (
          <div style={paneRowStyle}>
            <div style={leftPaneStyle}>
              <TraceWaterfall tree={tree} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <div style={rightPaneStyle}>
              <SpanDetail span={selectedSpan} />
            </div>
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

  const notAvailable = query.data?.availability === 'unavailable';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeftIcon />
          Back to runs
        </Button>
      </div>
      {query.isPending ? (
        <Skeleton height={320} />
      ) : query.isError ? (
        isReadNotSupported(query.error) ? (
          <ReadNotSupported />
        ) : isNotFound(query.error) ? (
          <EmptyState
            title="Trace not available"
            description="This run has no trace to show. It may have expired, or no monitoring detail was recorded for it."
          />
        ) : (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        )
      ) : notAvailable ? (
        <EmptyState
          title="Trace not available"
          description={query.data.fetchError ?? 'No monitoring detail was recorded for this run.'}
        />
      ) : (
        <Loaded trace={query.data} traceId={traceId} />
      )}
    </div>
  );
}
