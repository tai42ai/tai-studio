/**
 * One runs-table row. Clicking or pressing Enter/Space drills into the run's trace,
 * except when the gesture started inside a {@link RunPreview} (its expand button or
 * the JSON tree it opens) — that is the preview's own interaction.
 */
import type { ReactNode } from 'react';
import { Badge, TD, TR } from '@tai42/studio-sdk';
import type { Run } from '@tai42/api-client';

import { formatCost, formatLatencyMs, formatTimestamp, formatTokenCount } from './format';
import { RunPreview } from './RunPreview';

export interface RunRowProps {
  readonly run: Run;
  readonly onOpen: (traceId: string) => void;
}

/** Whether an event started inside a run preview (never a request to drill into the run). */
function fromPreview(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-run-preview]') !== null;
}

export function RunRow({ run, onOpen }: RunRowProps): ReactNode {
  const open = (): void => {
    onOpen(run.traceId);
  };
  return (
    <TR
      data-testid={`run-row-${run.id}`}
      tabIndex={0}
      onClick={(e) => {
        if (fromPreview(e.target)) return;
        open();
      }}
      onKeyDown={(e) => {
        if (fromPreview(e.target)) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <TD>{formatTimestamp(run.createdAt)}</TD>
      <TD>
        <div
          style={{
            display: 'flex',
            gap: 'var(--tai-space-1)',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Badge variant={run.status === 'error' ? 'danger' : 'success'}>{run.status}</Badge>
        </div>
      </TD>
      <TD>
        <RunPreview value={run.inputPreview} label={`${run.id} input`} />
      </TD>
      <TD>
        <RunPreview value={run.outputPreview} label={`${run.id} output`} />
      </TD>
      <TD>
        <div style={{ display: 'flex', gap: 'var(--tai-space-1)', flexWrap: 'wrap' }}>
          {run.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </TD>
      <TD numeric>{formatCost(run.cost)}</TD>
      <TD numeric>{formatLatencyMs(run.latencyMs)}</TD>
      <TD numeric>{formatTokenCount(run.totalTokens)}</TD>
    </TR>
  );
}
