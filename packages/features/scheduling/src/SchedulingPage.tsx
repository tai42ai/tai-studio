/**
 * Scheduling page. Lists the backend's schedules (`listSchedules`) in a table —
 * Name, Tool, Schedule, Status — with an add dialog, a per-row delete-with-confirm
 * flow, and a refresh action. The server clock (`getServerDateTime`) is shown so
 * operators can reason about cron timing.
 *
 * Two independent honesty states:
 *  - the LIST is served by a backend plugin; when none is installed the endpoint
 *    answers 501, which renders a dedicated "needs a backend plugin" empty state
 *    (NOT a loud error) — detected as `ApiError` with `status === 501`.
 *  - the server clock comes from a separate tool; its own 501 renders a small
 *    "server time unavailable" note, independent of the scheduling backend.
 * Every other failure surfaces loudly through `ErrorState`.
 *
 * SAFETY: a schedule can originate from an untrusted imported backup and carry
 * arbitrary tool names / kwargs, so every cell renders server strings as ESCAPED
 * text through the DS components (React escapes them) — never an HTML sink.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type ScheduleItem } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  errorMessage,
  useApi,
  type PageProps,
} from '@tai42/studio-sdk';

import { AddScheduleDialog } from './AddScheduleDialog';
import { schedulesKey, serverDateTimeKey } from './keys';

/** Render an opaque JSON scalar as text; objects/arrays fall back to compact JSON. */
function display(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** The tool a schedule runs: `kwargs.backend_tool_name` if present, else the entry's target. */
function toolIdentity(item: ScheduleItem): string {
  const backendName = item.kwargs?.backend_tool_name;
  if (typeof backendName === 'string' && backendName !== '') return backendName;
  const target = item.target;
  if (typeof target === 'string' && target !== '') return target;
  if (target !== undefined && target !== null) return JSON.stringify(target);
  return '—';
}

/** A compact human summary of a schedule's cron/interval spec (opaque backend shape). */
function scheduleSummary(schedule: ScheduleItem['schedule']): string {
  if (schedule === undefined || schedule === null) return '—';
  if (typeof schedule === 'string') return schedule;
  if (typeof schedule === 'object' && !Array.isArray(schedule)) {
    const spec = schedule as Record<string, unknown>;
    if (spec.__type === 'interval' && spec.every !== undefined) {
      return `Every ${display(spec.every)}s`;
    }
    if (spec.__type === 'crontab') {
      const cell = (value: unknown): string =>
        value === undefined || value === null ? '*' : display(value);
      const parts = [
        cell(spec.minute),
        cell(spec.hour),
        cell(spec.dayOfMonth ?? spec.day_of_month),
        cell(spec.monthOfYear ?? spec.month_of_year),
        cell(spec.dayOfWeek ?? spec.day_of_week),
      ];
      return `Cron: ${parts.join(' ')}`;
    }
  }
  return JSON.stringify(schedule);
}

/** The utc reading of the server clock as a display string, however the tool shaped it. */
function serverClockText(utc: unknown): string {
  if (typeof utc === 'string') return utc;
  if (utc !== null && typeof utc === 'object' && !Array.isArray(utc)) {
    const parts = utc as Record<string, unknown>;
    if (parts.date !== undefined || parts.time !== undefined) {
      return `${display(parts.date)} ${display(parts.time)}`.trim();
    }
  }
  return JSON.stringify(utc);
}

function ServerClock(): ReactNode {
  const api = useApi();
  const query = useQuery({ queryKey: serverDateTimeKey, queryFn: () => api.getServerDateTime() });

  if (query.isPending) return <Skeleton height={20} width={220} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 501) {
      return (
        <span style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
          Server time unavailable.
        </span>
      );
    }
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return (
    <span style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
      Server time (UTC):{' '}
      <code style={{ fontFamily: 'var(--tai-font-mono)' }}>{serverClockText(query.data.utc)}</code>
    </span>
  );
}

function DeleteScheduleDialog({ name, onClose }: { name: string; onClose: () => void }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => api.deleteSchedule(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: schedulesKey });
      onClose();
    },
  });

  return (
    <Dialog
      title="Delete schedule"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <p style={{ margin: 0 }}>
          Delete the schedule <strong>{name}</strong>? This cannot be undone.
        </p>
        {remove.isError ? <ErrorState message={errorMessage(remove.error)} /> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              remove.mutate();
            }}
            disabled={remove.isPending}
          >
            {remove.isPending ? <Spinner label="Deleting schedule" /> : null}
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ScheduleTable({ schedules }: { schedules: readonly ScheduleItem[] }): ReactNode {
  const [deleting, setDeleting] = useState<string | null>(null);

  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Tool</TH>
            <TH>Schedule</TH>
            <TH>Status</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <TBody>
          {schedules.map((item) => (
            <TR key={item.name}>
              <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{item.name}</TD>
              <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{toolIdentity(item)}</TD>
              <TD>{scheduleSummary(item.schedule)}</TD>
              <TD>
                <Badge variant={item.enabled ? 'success' : 'neutral'}>
                  {item.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </TD>
              <TD>
                <Button
                  variant="danger"
                  aria-label={`Delete schedule ${item.name}`}
                  onClick={() => {
                    setDeleting(item.name);
                  }}
                >
                  Delete
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {deleting !== null ? (
        <DeleteScheduleDialog
          name={deleting}
          onClose={() => {
            setDeleting(null);
          }}
        />
      ) : null}
    </Card>
  );
}

export function SchedulingPage(_props: PageProps<'scheduling'>): ReactNode {
  const api = useApi();
  const query = useQuery({ queryKey: schedulesKey, queryFn: () => api.listSchedules() });
  const [addOpen, setAddOpen] = useState(false);

  const noBackend = query.isError && query.error instanceof ApiError && query.error.status === 501;

  return (
    <div
      data-testid="scheduling-page"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-4)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--tai-text-xl)' }}>Scheduling</h1>
          <ServerClock />
        </div>
        <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
          <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? <Spinner label="Refreshing" /> : null}
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setAddOpen(true);
            }}
          >
            Add schedule
          </Button>
        </div>
      </header>

      {query.isPending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      ) : noBackend ? (
        <Card>
          <EmptyState
            title="Scheduling needs a backend plugin"
            description="No installed backend exposes scheduling tools. Install a scheduling backend plugin to create and manage schedules."
          />
        </Card>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <Card>
          <EmptyState
            title="No schedules yet"
            description="Add a schedule to run a tool on an interval or a cron expression."
          />
        </Card>
      ) : (
        <ScheduleTable schedules={query.data} />
      )}

      {addOpen ? (
        <AddScheduleDialog
          onClose={() => {
            setAddOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
