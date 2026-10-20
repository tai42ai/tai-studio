/**
 * The write audit trail: a paged table of every write to this subject's document, newest first.
 * One infinite query holds every loaded page, so an invalidation after a write refetches the
 * trail from its first page and a new row shows on top however many pages are loaded.
 */
import type { StateSubjectRef } from '@tai42/api-client';
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
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { stateWritesKey } from './keys';

export interface WritesCardProps {
  readonly stateName: string;
  readonly subject: StateSubjectRef;
}

export function WritesCard({ stateName, subject }: WritesCardProps): ReactNode {
  const api = useApi();

  const query = useInfiniteQuery({
    queryKey: stateWritesKey(stateName, subject),
    queryFn: ({ pageParam, signal }) =>
      api.listStateWrites(
        stateName,
        subject,
        pageParam === undefined ? undefined : { cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  // The pages are disjoint keyset slices (each strictly older than the last row before it), so
  // no row repeats. A row carries no unique field (`seq` is shared, e.g. every erase row reads
  // 0), so its place in the trail is its identity.
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Writes</h3>
        {query.isPending ? (
          <Skeleton height={120} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
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
                {rows.map((entry, index) => (
                  <TR key={index}>
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
            {query.hasNextPage ? (
              <div>
                <Button
                  type="button"
                  onClick={() => {
                    void query.fetchNextPage();
                  }}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? <Spinner label="Loading" /> : null}
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
