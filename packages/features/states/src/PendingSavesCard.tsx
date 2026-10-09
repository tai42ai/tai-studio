/**
 * Pending saves — the writes and deferred calls runs saved before their reply that have not
 * applied yet. A failed save holds its subjects (every read and run on them is refused) until an
 * operator retries it, after repairing its cause, or discards it. The card lists the outstanding
 * saves newest first (opening on the failed ones when there are any), refreshes every 10 s, and
 * offers Retry and Discard on a failed row.
 */
import type { PendingSave, PendingSaveRetried } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  errorMessage,
  ErrorState,
  Skeleton,
  Spinner,
  Table,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useApi,
} from '@tai42/studio-sdk';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';

import { formatAge } from './formatAge';
import { statePendingSavesKey, STATES_KEY_ROOT } from './keys';

/** The element id the Records tab's held-subjects line scrolls to. */
export const PENDING_SAVES_CARD_ID = 'state-pending-saves';

const PAGE_SIZE = 50;
const REFRESH_MS = 10_000;
const ERROR_PREVIEW = 80;
const RUN_PREVIEW = 12;

type Filter = 'failed' | 'outstanding';

const STATUS_BADGE: Record<
  PendingSave['status'],
  { readonly label: string; readonly variant: string }
> = {
  pending: { label: 'Pending', variant: 'neutral' },
  calls: { label: 'Calls queued', variant: 'primary' },
  running: { label: 'Calling', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
};

const MONO = { fontFamily: 'var(--tai-font-mono)' } as const;
const MUTED = { margin: 0, color: 'var(--tai-color-text-muted)' } as const;

function subjectLabel(row: PendingSave['subjects'][number]): string {
  return `${row.state} · ${row.subject.kind}/${row.subject.key}`;
}

function preview(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** The outcome line a retry leaves under its row: what the operator reads after the answer. */
function retryOutcome(result: PendingSaveRetried): { readonly ok: boolean; readonly text: string } {
  if (result.status === 'applied') return { ok: true, text: `Save ${result.id} applied.` };
  if (result.status === 'failed') {
    return {
      ok: false,
      text:
        result.last_error === null
          ? `Save ${result.id} failed again.`
          : `Save ${result.id} failed again: ${result.last_error}`,
    };
  }
  return { ok: true, text: `Save ${result.id} is queued again.` };
}

export function PendingSavesCard(): ReactNode {
  const api = useApi();
  const [chosen, setChosen] = useState<Filter | null>(null);
  // The card opens on the failed saves; with none failed it shows every outstanding save instead.
  const [fallback, setFallback] = useState<Filter>('failed');
  const filter: Filter = chosen ?? fallback;

  const query = useInfiniteQuery({
    queryKey: statePendingSavesKey(filter),
    queryFn: ({ pageParam, signal }) =>
      api.listPendingSaves({ status: filter, limit: PAGE_SIZE, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: REFRESH_MS,
  });

  const firstPage = query.data?.pages[0];
  const noneFailed = firstPage?.failed === 0 && firstPage.outstanding > 0;
  useEffect(() => {
    if (chosen === null && noneFailed) setFallback('outstanding');
  }, [chosen, noneFailed]);

  const header = <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Pending saves</h3>;
  let body: ReactNode;
  if (query.isPending) {
    body = <Skeleton height={72} />;
  } else if (query.isError) {
    body = <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  } else if (firstPage === undefined || firstPage.outstanding === 0) {
    body = <p style={MUTED}>No pending saves. Every state write has been applied.</p>;
  } else {
    const rows = query.data.pages.flatMap((page) => page.items);
    const list = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <PendingSavesTable rows={rows} filter={filter} />
        {query.hasNextPage ? (
          <div>
            <Button
              type="button"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? <Spinner label="Loading" /> : null}
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    );
    body = (
      <>
        <p style={MUTED} data-testid="pending-saves-summary">
          {firstPage.outstanding} outstanding · {firstPage.failed} failed
        </p>
        <Tabs
          value={filter}
          onValueChange={(next) => {
            setChosen(next as Filter);
          }}
          items={[
            { value: 'failed', label: 'Failed', content: filter === 'failed' ? list : null },
            {
              value: 'outstanding',
              label: 'All outstanding',
              content: filter === 'outstanding' ? list : null,
            },
          ]}
        />
      </>
    );
  }

  return (
    <div id={PENDING_SAVES_CARD_ID}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          {header}
          {body}
        </div>
      </Card>
    </div>
  );
}

/** What an empty tab reads: the Failed tab lists failed saves only, All outstanding every one. */
const EMPTY_TAB: Record<Filter, string> = {
  failed: 'No failed saves. Every outstanding save is still being applied.',
  outstanding: 'No pending saves. Every state write has been applied.',
};

function PendingSavesTable({
  rows,
  filter,
}: {
  readonly rows: readonly PendingSave[];
  readonly filter: Filter;
}): ReactNode {
  if (rows.length === 0) {
    return <p style={MUTED}>{EMPTY_TAB[filter]}</p>;
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Save</TH>
          <TH>Status</TH>
          <TH>Subjects</TH>
          <TH>Calls</TH>
          <TH>Run</TH>
          <TH>Age</TH>
          <TH>Attempts</TH>
          <TH>Last error</TH>
          <TH>Actions</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <PendingSaveRow key={row.id} row={row} />
        ))}
      </TBody>
    </Table>
  );
}

function PendingSaveRow({ row }: { readonly row: PendingSave }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [line, setLine] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: [STATES_KEY_ROOT] });
  };

  const retry = useMutation({
    mutationFn: () => api.retryPendingSave(row.id),
    onSuccess: async (result) => {
      setLine(retryOutcome(result));
      await refresh();
    },
    onError: (error) => {
      setLine({ ok: false, text: errorMessage(error) });
    },
  });

  const discard = useMutation({
    mutationFn: () => api.discardPendingSave(row.id),
    onSuccess: async () => {
      setConfirming(false);
      await refresh();
    },
  });

  const badge = STATUS_BADGE[row.status];
  const [first, ...more] = row.subjects;
  const calls = row.calls.map((call) => call.target).join(', ');
  return (
    <>
      <TR>
        <TD style={MONO}>{row.id}</TD>
        <TD>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </TD>
        <TD title={row.subjects.map(subjectLabel).join('\n')}>
          {first === undefined ? '—' : subjectLabel(first)}
          {more.length > 0 ? (
            <span style={{ color: 'var(--tai-color-text-muted)' }}> +{more.length} more</span>
          ) : null}
        </TD>
        <TD>{calls === '' ? '—' : calls}</TD>
        <TD style={MONO} title={row.run_id ?? undefined}>
          {row.run_id === null ? '—' : preview(row.run_id, RUN_PREVIEW)}
        </TD>
        <TD style={{ whiteSpace: 'nowrap' }} title={row.created_at}>
          {formatAge(row.created_at)}
        </TD>
        <TD>{row.attempts}</TD>
        <TD title={row.last_error ?? undefined}>
          {row.last_error === null ? '—' : preview(row.last_error, ERROR_PREVIEW)}
        </TD>
        <TD>
          {row.status === 'failed' ? (
            <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
              <Button
                type="button"
                variant="secondary"
                disabled={retry.isPending}
                onClick={() => {
                  setLine(null);
                  retry.mutate();
                }}
              >
                {retry.isPending ? 'Retrying…' : 'Retry'}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  discard.reset();
                  setConfirming(true);
                }}
              >
                Discard
              </Button>
            </div>
          ) : null}
        </TD>
      </TR>
      {line === null ? null : (
        <TR>
          <TD colSpan={9}>
            <span
              role={line.ok ? 'status' : 'alert'}
              style={{ color: line.ok ? 'var(--tai-color-ok-text)' : 'var(--tai-color-err-text)' }}
            >
              {line.text}
            </span>
          </TD>
        </TR>
      )}
      {confirming ? (
        <ConfirmDialog
          title={`Discard pending save ${row.id}?`}
          confirmLabel="Discard save"
          pendingLabel="Discarding"
          confirmVariant="danger"
          isPending={discard.isPending}
          error={discard.error}
          onConfirm={() => {
            discard.mutate();
          }}
          onClose={() => {
            setConfirming(false);
          }}
        >
          Its record writes and deferred calls are dropped and will never be applied. The held
          subjects are released.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
