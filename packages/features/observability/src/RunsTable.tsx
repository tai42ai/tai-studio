/**
 * The filterable, sortable, paginated runs table. The full-page marketplace pitch is
 * shown only BEFORE any runs have loaded; a 501 arriving on a refetch of an
 * already-loaded table renders inline instead of blanking the tab. A row click drills
 * into the run's trace via the URL.
 */
import {
  Button,
  Card,
  downloadBlob,
  EmptyState,
  errorMessage,
  ErrorState,
  ScrollRegion,
  Skeleton,
  Table,
  TBody,
  TH,
  THead,
  TR,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import { type ReactNode, useState } from 'react';

import { FilterBar } from './FilterBar';
import { mergeSearch, type ObservabilitySearch } from './filters';
import { isReadNotSupported, ReadNotSupported } from './read-support';
import { RunRow } from './RunRow';
import { RunsPagination } from './RunsPagination';
import { SortableHeader } from './SortableHeader';
import { useRunsQuery } from './useRunsQuery';

export function RunsTable({ search }: { readonly search: ObservabilitySearch }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const [exportError, setExportError] = useState<string | null>(null);
  const { query, items, params } = useRunsQuery(search);

  // The full-page pitch is only right BEFORE any runs have loaded; a later 501 renders
  // inline. Both 501 sources share one error code, so this keys off load state.
  if (query.isError && isReadNotSupported(query.error) && query.data === undefined) {
    return <ReadNotSupported />;
  }

  const openTrace = (traceId: string): void => {
    navigate('observability', mergeSearch(search, { trace: traceId }));
  };

  const onExport = (): void => {
    setExportError(null);
    api
      .exportRuns({ ...params, format: 'csv' })
      .then((blob) => {
        downloadBlob(blob, 'runs.csv');
      })
      .catch((error: unknown) => {
        setExportError(errorMessage(error));
      });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <FilterBar search={search} disabled={query.isPending} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
        <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Button onClick={onExport}>Export CSV</Button>
      </div>
      {exportError !== null ? <ErrorState message={exportError} /> : null}

      {query.isPending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      ) : query.isLoadingError ? (
        // Only the INITIAL-load failure (no pages retained) blanks the table.
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          {query.isError && !query.isFetchNextPageError ? (
            // A background refetch failed while pages are retained (a Load-more failure
            // gets its own retry in RunsPagination, so it is excluded here).
            <div
              role="alert"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}
            >
              <span style={{ color: 'var(--tai-color-err-text)' }}>
                Could not refresh runs: {errorMessage(query.error)}
              </span>
              <Button onClick={() => void query.refetch()}>Retry</Button>
            </div>
          ) : null}
          {items.length === 0 ? (
            <EmptyState title="No runs" description="No runs match the current filters." />
          ) : (
            <Card>
              <ScrollRegion label="Runs">
                <Table>
                  <THead>
                    <TR>
                      <SortableHeader columnKey="createdAt" label="When" search={search} />
                      <TH>Status</TH>
                      <TH>Input</TH>
                      <TH>Output</TH>
                      <TH>Tags</TH>
                      <SortableHeader columnKey="cost" label="Cost" search={search} numeric />
                      <SortableHeader
                        columnKey="latencyMs"
                        label="Latency"
                        search={search}
                        numeric
                      />
                      <SortableHeader
                        columnKey="totalTokens"
                        label="Tokens"
                        search={search}
                        numeric
                      />
                    </TR>
                  </THead>
                  <TBody>
                    {items.map((run) => (
                      <RunRow key={run.id} run={run} onOpen={openTrace} />
                    ))}
                  </TBody>
                </Table>
              </ScrollRegion>
              <RunsPagination
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                isFetchNextPageError={query.isFetchNextPageError}
                error={query.error}
                onFetchNext={() => void query.fetchNextPage()}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
