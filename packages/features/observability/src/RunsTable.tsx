/**
 * The filterable, sortable, paginated runs table. The full-page marketplace pitch is
 * shown only BEFORE any runs have loaded; a 501 arriving on a refetch of an
 * already-loaded table renders inline instead of blanking the tab. A row click drills
 * into the run's trace via the URL. The sort headers and the filter guard read the
 * backend's served capabilities, passed in by the tracing tab.
 *
 * No runs read is sent until the capabilities read settles, and none for a search
 * whose sort the backend does not serve: that search shows the not-served notice
 * with a "Sort newest first" control, and Refresh and Export CSV stay disabled.
 */
import type { ObservabilityCapabilities } from '@tai42/api-client';
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
import type { UseQueryResult } from '@tanstack/react-query';
import { type ReactNode, useRef, useState } from 'react';

import { FilterBar } from './FilterBar';
import {
  type BlockedSort,
  blockedSort,
  blockedSortMessage,
  mergeSearch,
  type ObservabilitySearch,
  SORT_LABELS,
} from './filters';
import {
  isReadNotServed,
  isReadNotSupported,
  isReadTooBroad,
  ReadNotServedNotice,
  ReadNotSupported,
  ReadTooBroadNotice,
} from './read-support';
import { RunRow } from './RunRow';
import { RunsPagination } from './RunsPagination';
import { SortableHeader } from './SortableHeader';
import { useFocusRangeOnTooBroad } from './time-range-focus';
import { type RunsQuery, useRunsQuery } from './useRunsQuery';

function LoadingRows(): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <Skeleton height={32} />
      <Skeleton height={32} />
      <Skeleton height={32} />
    </div>
  );
}

function LoadedRuns({
  search,
  served,
  runs,
  onOpen,
}: {
  readonly search: ObservabilitySearch;
  readonly served: ObservabilityCapabilities | undefined;
  readonly runs: RunsQuery;
  readonly onOpen: (traceId: string) => void;
}): ReactNode {
  const { query, items } = runs;
  return (
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
                  <SortableHeader
                    columnKey="createdAt"
                    label={SORT_LABELS.createdAt}
                    search={search}
                    capabilities={served}
                  />
                  <TH>Status</TH>
                  <TH>Input</TH>
                  <TH>Output</TH>
                  <TH>Tags</TH>
                  <SortableHeader
                    columnKey="cost"
                    label={SORT_LABELS.cost}
                    search={search}
                    capabilities={served}
                    numeric
                  />
                  <SortableHeader
                    columnKey="latencyMs"
                    label={SORT_LABELS.latencyMs}
                    search={search}
                    capabilities={served}
                    numeric
                  />
                  <SortableHeader
                    columnKey="totalTokens"
                    label={SORT_LABELS.totalTokens}
                    search={search}
                    capabilities={served}
                    numeric
                  />
                </TR>
              </THead>
              <TBody>
                {items.map((run) => (
                  <RunRow key={run.id} run={run} onOpen={onOpen} />
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
  );
}

function RunsResult({
  search,
  served,
  settled,
  blocked,
  tooBroad,
  runs,
  onOpen,
}: {
  readonly search: ObservabilitySearch;
  readonly served: ObservabilityCapabilities | undefined;
  readonly settled: boolean;
  readonly blocked: BlockedSort | null;
  readonly tooBroad: boolean;
  readonly runs: RunsQuery;
  readonly onOpen: (traceId: string) => void;
}): ReactNode {
  const navigate = useAppNavigate();
  const { query } = runs;
  if (!settled) return <LoadingRows />;
  if (blocked !== null) {
    // A link whose sort the backend does not serve: no read is sent, and the
    // notice replaces the table (and its sort header) with the way out.
    return (
      <ReadNotServedNotice
        message={blockedSortMessage(blocked)}
        action={
          <Button
            onClick={() => {
              navigate('observability', mergeSearch(search, { sort: undefined, dir: undefined }));
            }}
          >
            Sort newest first
          </Button>
        }
      />
    );
  }
  if (query.isPending) return <LoadingRows />;
  if (tooBroad) {
    // A considered "too broad" refusal: the backend can read, the filters just
    // ask for too wide a window. Show its exact guidance inline with the filters
    // still above — never the marketplace pitch, never an empty "No runs".
    return <ReadTooBroadNotice message={errorMessage(query.error)} />;
  }
  if (isReadNotServed(query.error)) {
    return <ReadNotServedNotice message={errorMessage(query.error)} />;
  }
  if (query.isLoadingError) {
    // Only the INITIAL-load failure (no pages retained) blanks the table.
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <LoadedRuns search={search} served={served} runs={runs} onOpen={onOpen} />;
}

export function RunsTable({
  search,
  capabilities,
}: {
  readonly search: ObservabilitySearch;
  readonly capabilities: UseQueryResult<ObservabilityCapabilities>;
}): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const [exportError, setExportError] = useState<string | null>(null);
  const served = capabilities.data;
  // A failed capabilities read settles too: the runs read is sent and the backend answers.
  const settled = !capabilities.isPending;
  const blocked = served !== undefined ? blockedSort(search, served) : null;
  // A runs read is sent only for a search the backend serves, once that is known.
  const readable = settled && blocked === null;
  const runs = useRunsQuery(search, { enabled: readable });
  const { query, params } = runs;
  const rangeRef = useRef<HTMLDivElement>(null);
  const tooBroad = readable && !query.isPending && isReadTooBroad(query.error);
  useFocusRangeOnTooBroad({
    tooBroad,
    hasResult: query.data !== undefined,
    requestKey: JSON.stringify(params),
    rangeRef,
  });

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
      <FilterBar
        search={search}
        disabled={!settled || (blocked === null && query.isPending)}
        capabilities={served}
        capabilitiesError={capabilities.isError}
        onRetryCapabilities={() => void capabilities.refetch()}
        rangeRef={rangeRef}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
        <Button onClick={() => void query.refetch()} disabled={!readable || query.isFetching}>
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Button onClick={onExport} disabled={!readable}>
          Export CSV
        </Button>
      </div>
      {exportError !== null ? <ErrorState message={exportError} /> : null}

      <RunsResult
        search={search}
        served={served}
        settled={settled}
        blocked={blocked}
        tooBroad={tooBroad}
        runs={runs}
        onOpen={openTrace}
      />
    </div>
  );
}
