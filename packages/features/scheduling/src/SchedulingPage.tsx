/**
 * Scheduling page. Lists the backend's schedules (`listSchedules`, typed
 * `ScheduleListRow` rows) in a table — Name, Schedule, Status, Tool — with an add
 * dialog, a per-row delete-with-confirm flow, and a refresh action. A row carrying the
 * backend's last scheduling failure shows a warning `Error` badge whose tooltip names it. The server clock (`getServerDateTime`) is shown so
 * operators can reason about cron timing. A deep link's `schedule` marks that row, or
 * says above the table that no schedule has the name.
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
 * arbitrary names / tool names / error text, so every cell renders server strings as
 * ESCAPED text through the DS components (React escapes them) — never an HTML sink.
 */
import { ApiError, type ScheduleListRow } from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  errorMessage,
  ErrorState,
  PageHeader,
  type PageProps,
  ScrollRegion,
  Skeleton,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Tooltip,
  TR,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { AddScheduleDialog } from './AddScheduleDialog';
import { schedulesKey, serverDateTimeKey } from './keys';

/** Render an opaque JSON scalar as text; objects/arrays fall back to compact JSON. */
function display(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** A compact human summary of a schedule's typed cadence. */
function scheduleSummary(cadence: ScheduleListRow['cadence']): string {
  if (cadence.kind === 'interval') {
    return `Every ${String(cadence.every)}s${cadence.relative ? ' (relative)' : ''}`;
  }
  return `Cron: ${cadence.minute} ${cadence.hour} ${cadence.day_of_month} ${cadence.month_of_year} ${cadence.day_of_week}`;
}

/** The trigger a status badge's tooltip hangs off: a bare button, so it opens on focus too. */
const badgeTriggerStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  marginLeft: 'var(--tai-space-2)',
  cursor: 'help',
} as const;

/** The warning badge of a row carrying the backend's last scheduling failure. */
function ScheduleErrorBadge({
  error,
}: {
  error: NonNullable<ScheduleListRow['error']>;
}): ReactNode {
  const content = error.at_iso !== null ? `${error.message} — ${error.at_iso}` : error.message;
  return (
    <Tooltip content={content}>
      <button type="button" style={badgeTriggerStyle} data-testid="schedule-error-badge">
        <Badge variant="warning">Error</Badge>
      </button>
    </Tooltip>
  );
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

function ScheduleRow({
  item,
  highlighted,
  onDelete,
}: {
  readonly item: ScheduleListRow;
  readonly highlighted: boolean;
  readonly onDelete: (name: string) => void;
}): ReactNode {
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);
  return (
    <TR
      ref={rowRef}
      aria-current={highlighted ? 'true' : undefined}
      style={highlighted ? { background: 'var(--tai-color-accent-tint)' } : undefined}
    >
      <TD className="tai-table-id">{item.name}</TD>
      <TD className="tai-mono">{scheduleSummary(item.cadence)}</TD>
      <TD>
        <Badge variant={item.enabled ? 'success' : 'neutral'}>
          {item.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
        {item.error !== null ? <ScheduleErrorBadge error={item.error} /> : null}
      </TD>
      <TD className="tai-mono">{item.tool}</TD>
      <TD>
        <Button
          variant="ghost"
          aria-label={`Delete schedule ${item.name}`}
          onClick={() => {
            onDelete(item.name);
          }}
        >
          Delete
        </Button>
      </TD>
    </TR>
  );
}

function ScheduleTable({
  schedules,
  highlight,
}: {
  readonly schedules: readonly ScheduleListRow[];
  readonly highlight: string | undefined;
}): ReactNode {
  const [deleting, setDeleting] = useState<string | null>(null);

  return (
    <Card>
      <ScrollRegion label="Schedules">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Schedule</TH>
              <TH>Status</TH>
              <TH>Tool</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {schedules.map((item) => (
              <ScheduleRow
                key={item.name}
                item={item}
                highlighted={item.name === highlight}
                onDelete={setDeleting}
              />
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
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

export function SchedulingPage({ search }: PageProps<'scheduling'>): ReactNode {
  const api = useApi();
  const query = useQuery({ queryKey: schedulesKey, queryFn: () => api.listSchedules() });
  const [addOpen, setAddOpen] = useState(false);
  const linkedSchedule = search.schedule;
  const linkedMissing =
    linkedSchedule !== undefined &&
    query.isSuccess &&
    !query.data.some((item) => item.name === linkedSchedule);

  const noBackend = query.isError && query.error instanceof ApiError && query.error.status === 501;

  return (
    <div className="tai-stack tai-stack-6" data-testid="scheduling-page">
      <PageHeader
        eyebrow="Doors"
        title="Scheduling"
        actions={
          <>
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
          </>
        }
      />
      <ServerClock />

      {linkedMissing ? (
        <p role="status" style={{ margin: 0 }}>
          {`No schedule named '${linkedSchedule}'.`}
        </p>
      ) : null}

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
            action={
              <AppLink
                to="marketplace"
                search={{ kind: 'backend' }}
                className="tai-btn tai-btn-secondary"
              >
                Browse marketplace
              </AppLink>
            }
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
        <ScheduleTable schedules={query.data} highlight={linkedSchedule} />
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
