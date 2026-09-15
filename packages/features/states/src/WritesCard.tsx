/** The write audit trail: a paged table of every write to this subject's document. */
import type { StateSubjectRef, WriteEntry } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  Skeleton,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';

import { stateWritesKey } from './keys';

export interface WritesCardProps {
  readonly stateName: string;
  readonly subject: StateSubjectRef;
}

export function WritesCard({ stateName, subject }: WritesCardProps): ReactNode {
  const api = useApi();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<WriteEntry[]>([]);

  const query = useQuery({
    queryKey: [...stateWritesKey(stateName, subject), cursor ?? 'first'],
    queryFn: ({ signal }) =>
      api.listStateWrites(
        stateName,
        subject,
        cursor === undefined ? undefined : { cursor },
        signal,
      ),
  });

  const page = query.data;
  const merged = useMemo(() => {
    if (page === undefined) return rows;
    const seen = new Set(rows.map((r) => r.seq));
    return [...rows, ...page.items.filter((item) => !seen.has(item.seq))];
  }, [page, rows]);

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Writes</h3>
        {query.isPending && rows.length === 0 ? (
          <Skeleton height={120} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : merged.length === 0 ? (
          <EmptyState title="No writes yet" description="No door has written this document." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>At</TH>
                  <TH>Door</TH>
                  <TH>Actor</TH>
                  <TH>Consumer</TH>
                  <TH>Run</TH>
                  <TH>Paths</TH>
                </TR>
              </THead>
              <TBody>
                {merged.map((entry) => (
                  <TR key={entry.seq}>
                    <TD>{entry.at}</TD>
                    <TD>
                      <Badge variant="neutral">{entry.origin.door}</Badge>
                    </TD>
                    <TD>{entry.origin.actor ?? '—'}</TD>
                    <TD>
                      <div>{entry.origin.consumer ?? '—'}</div>
                      {entry.origin.meta !== null ? (
                        <div
                          title={JSON.stringify(entry.origin.meta)}
                          style={{
                            fontFamily: 'var(--tai-font-mono)',
                            fontSize: 'var(--tai-text-xs)',
                            color: 'var(--tai-color-text-muted)',
                            display: 'block',
                            maxWidth: '24ch',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {JSON.stringify(entry.origin.meta)}
                        </div>
                      ) : null}
                    </TD>
                    <TD>
                      {entry.origin.run_id !== null ? (
                        <span
                          title={entry.origin.run_id}
                          style={{
                            fontFamily: 'var(--tai-font-mono)',
                            display: 'inline-block',
                            maxWidth: '10ch',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'bottom',
                          }}
                        >
                          {entry.origin.run_id}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD>{entry.paths.map((path) => path.join(' / ')).join(', ') || '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {page?.next_cursor != null ? (
              <div>
                <Button
                  type="button"
                  onClick={() => {
                    setRows(merged);
                    setCursor(page.next_cursor ?? undefined);
                  }}
                  disabled={query.isFetching}
                >
                  {query.isFetching ? <Spinner label="Loading" /> : null}
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
