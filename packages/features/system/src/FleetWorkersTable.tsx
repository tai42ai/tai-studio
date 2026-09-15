/**
 * The live-worker census table: one selectable row per worker with its kind, generation
 * (a plain monotonic life counter), state badge, relative seen-since (absolute in the
 * tooltip), and last op. Every server-supplied string renders as escaped React text.
 */
import type { FleetWorker } from '@tai42/api-client';
import {
  Badge,
  Checkbox,
  ScrollRegion,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Tooltip,
  TR,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { monoStyle } from './cardChrome';
import { formatAbsoluteInstant, formatRelativeInstant } from './relativeTime';
import { workerStateBadge } from './workerStateBadge';

export interface FleetWorkersTableProps {
  readonly workers: readonly FleetWorker[];
  readonly selected: ReadonlySet<string>;
  readonly allSelected: boolean;
  readonly onToggle: (name: string, next: boolean) => void;
  readonly onToggleAll: (next: boolean) => void;
}

export function FleetWorkersTable({
  workers,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
}: FleetWorkersTableProps): ReactNode {
  return (
    <ScrollRegion label="Live workers">
      <Table>
        <THead>
          <TR>
            <TH style={{ width: '1px' }}>
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label="Select all workers"
              />
            </TH>
            <TH>Name</TH>
            <TH>Kind</TH>
            <TH>Life</TH>
            <TH>State</TH>
            <TH>Seen</TH>
            <TH>Last op</TH>
          </TR>
        </THead>
        <TBody>
          {workers.map((worker) => {
            const stateBadge = workerStateBadge(worker);
            return (
              <TR key={worker.name}>
                <TD>
                  <Checkbox
                    checked={selected.has(worker.name)}
                    onCheckedChange={(next) => {
                      onToggle(worker.name, next);
                    }}
                    aria-label={`Select ${worker.name}`}
                  />
                </TD>
                <TD style={monoStyle}>{worker.name}</TD>
                <TD>
                  <Badge variant={worker.kind === 'backend' ? 'primary' : 'neutral'}>
                    {worker.kind}
                  </Badge>
                </TD>
                {/* Life = the worker's generation, a plain monotonic life counter. */}
                <TD style={monoStyle}>{worker.generation}</TD>
                <TD>
                  <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>
                </TD>
                {/* Seen-since = the relative last-beat time; the tooltip carries the
                    absolute last beat and the join instant. */}
                <TD>
                  <Tooltip
                    content={`Last beat ${formatAbsoluteInstant(worker.beat_at)} · joined ${formatAbsoluteInstant(worker.joined_at)}`}
                  >
                    <span>{formatRelativeInstant(worker.beat_at)}</span>
                  </Tooltip>
                </TD>
                <TD>
                  {worker.last_op !== null ? (
                    <Tooltip content={formatAbsoluteInstant(worker.last_op.at)}>
                      <span>
                        {worker.last_op.op} · {worker.last_op.outcome}
                      </span>
                    </Tooltip>
                  ) : (
                    '—'
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}
