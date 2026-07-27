/**
 * Tracing tab — a filterable, sortable, paginated runs table over
 * `listRuns(filters)`. The filter set, sort key/direction, and the drilled-in
 * trace id all live in the URL (written via `navigate`), so a view is linkable
 * and survives the stats→tracing drill-through. A row click sets `trace` in the
 * URL, switching this tab to the per-run {@link TraceView}. A 501 from the reader
 * renders the dedicated read-not-supported state; other failures are loud.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Run } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  NumberInput,
  ScrollRegion,
  Select,
  Skeleton,
  SortAscIcon,
  SortDescIcon,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  downloadBlob,
  errorMessage,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';

import {
  formatCost,
  formatLatencyMs,
  formatTimestamp,
  formatTokenCount,
  previewValue,
} from './format';
import { mergeSearch, runsParams, type ObservabilitySearch } from './filters';
import { runsKey } from './keys';
import { isReadNotSupported, ReadNotSupported } from './read-support';
import { TraceView } from './TraceView';

type SortKey = NonNullable<ObservabilitySearch['sort']>;

const STATUS_ANY = 'any';

function num(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function parseNum(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

interface FilterDraft {
  from: string;
  to: string;
  status: string;
  tags: string;
  minCost: string;
  maxCost: string;
  minTokens: string;
  maxTokens: string;
  minLatencyMs: string;
  maxLatencyMs: string;
}

function draftFromSearch(search: ObservabilitySearch): FilterDraft {
  return {
    from: search.from ?? '',
    to: search.to ?? '',
    status: search.status ?? STATUS_ANY,
    tags: (search.tags ?? []).join(', '),
    minCost: num(search.minCost),
    maxCost: num(search.maxCost),
    minTokens: num(search.minTokens),
    maxTokens: num(search.maxTokens),
    minLatencyMs: num(search.minLatencyMs),
    maxLatencyMs: num(search.maxLatencyMs),
  };
}

function draftToPatch(draft: FilterDraft): Partial<ObservabilitySearch> {
  const tags = draft.tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return {
    from: draft.from.trim() === '' ? undefined : draft.from.trim(),
    to: draft.to.trim() === '' ? undefined : draft.to.trim(),
    status: draft.status === STATUS_ANY ? undefined : (draft.status as 'error' | 'success'),
    tags: tags.length === 0 ? undefined : tags,
    minCost: parseNum(draft.minCost),
    maxCost: parseNum(draft.maxCost),
    minTokens: parseNum(draft.minTokens),
    maxTokens: parseNum(draft.maxTokens),
    minLatencyMs: parseNum(draft.minLatencyMs),
    maxLatencyMs: parseNum(draft.maxLatencyMs),
  };
}

const fieldRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  gap: 'var(--tai-space-3)',
  alignItems: 'end',
};

function FilterBar({
  search,
  disabled,
}: {
  readonly search: ObservabilitySearch;
  readonly disabled: boolean;
}): ReactNode {
  const navigate = useAppNavigate();
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromSearch(search));

  const set = (patch: Partial<FilterDraft>): void => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const apply = (): void => {
    navigate('observability', mergeSearch(search, draftToPatch(draft)));
  };

  const clear = (): void => {
    setDraft(draftFromSearch({ tab: search.tab }));
    navigate(
      'observability',
      mergeSearch(search, draftToPatch(draftFromSearch({ tab: search.tab }))),
    );
  };

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <div style={fieldRowStyle}>
          <Field label="From (ISO)">
            <TextInput
              value={draft.from}
              placeholder="2026-01-01T00:00:00Z"
              onChange={(e) => {
                set({ from: e.target.value });
              }}
            />
          </Field>
          <Field label="To (ISO)">
            <TextInput
              value={draft.to}
              placeholder="2026-02-01T00:00:00Z"
              onChange={(e) => {
                set({ to: e.target.value });
              }}
            />
          </Field>
          <Field label="Status">
            <Select
              options={[
                { value: STATUS_ANY, label: 'Any status' },
                { value: 'success', label: 'Success' },
                { value: 'error', label: 'Error' },
              ]}
              value={draft.status}
              onValueChange={(value) => {
                set({ status: value });
              }}
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <TextInput
              value={draft.tags}
              onChange={(e) => {
                set({ tags: e.target.value });
              }}
            />
          </Field>
        </div>
        <div style={fieldRowStyle}>
          <Field label="Min cost">
            <NumberInput
              value={draft.minCost}
              onChange={(e) => {
                set({ minCost: e.target.value });
              }}
            />
          </Field>
          <Field label="Max cost">
            <NumberInput
              value={draft.maxCost}
              onChange={(e) => {
                set({ maxCost: e.target.value });
              }}
            />
          </Field>
          <Field label="Min tokens">
            <NumberInput
              value={draft.minTokens}
              onChange={(e) => {
                set({ minTokens: e.target.value });
              }}
            />
          </Field>
          <Field label="Max tokens">
            <NumberInput
              value={draft.maxTokens}
              onChange={(e) => {
                set({ maxTokens: e.target.value });
              }}
            />
          </Field>
          <Field label="Min latency (ms)">
            <NumberInput
              value={draft.minLatencyMs}
              onChange={(e) => {
                set({ minLatencyMs: e.target.value });
              }}
            />
          </Field>
          <Field label="Max latency (ms)">
            <NumberInput
              value={draft.maxLatencyMs}
              onChange={(e) => {
                set({ maxLatencyMs: e.target.value });
              }}
            />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
          <Button variant="primary" onClick={apply} disabled={disabled}>
            Apply filters
          </Button>
          <Button onClick={clear} disabled={disabled}>
            Clear
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SortableHeader({
  columnKey,
  label,
  search,
}: {
  readonly columnKey: SortKey;
  readonly label: string;
  readonly search: ObservabilitySearch;
}): ReactNode {
  const navigate = useAppNavigate();
  const active = search.sort === columnKey;
  const dir = active ? (search.dir ?? 'desc') : undefined;
  const onClick = (): void => {
    const nextDir: 'asc' | 'desc' = active && dir === 'desc' ? 'asc' : 'desc';
    navigate('observability', mergeSearch(search, { sort: columnKey, dir: nextDir }));
  };
  return (
    <TH aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={onClick}
        style={{
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          padding: 0,
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
          display: 'inline-flex',
          gap: 'var(--tai-space-1)',
        }}
      >
        {label}
        {active ? dir === 'asc' ? <SortAscIcon /> : <SortDescIcon /> : null}
      </button>
    </TH>
  );
}

function RunRow({
  run,
  onOpen,
}: {
  readonly run: Run;
  readonly onOpen: (traceId: string) => void;
}): ReactNode {
  const open = (): void => {
    onOpen(run.traceId);
  };
  return (
    <TR
      data-testid={`run-row-${run.id}`}
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <TD>{formatTimestamp(run.createdAt)}</TD>
      <TD>
        <Badge variant={run.status === 'error' ? 'danger' : 'success'}>{run.status}</Badge>
      </TD>
      <TD>{previewValue(run.inputPreview)}</TD>
      <TD>{previewValue(run.outputPreview)}</TD>
      <TD>
        <div style={{ display: 'flex', gap: 'var(--tai-space-1)', flexWrap: 'wrap' }}>
          {run.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </TD>
      <TD>{formatCost(run.cost)}</TD>
      <TD>{formatLatencyMs(run.latencyMs)}</TD>
      <TD>{formatTokenCount(run.totalTokens)}</TD>
      <TD>{run.model ?? '—'}</TD>
    </TR>
  );
}

function RunsTable({ search }: { readonly search: ObservabilitySearch }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const [exportError, setExportError] = useState<string | null>(null);
  const params = runsParams(search);
  const query = useInfiniteQuery({
    queryKey: runsKey(params),
    queryFn: ({ pageParam, signal }) => api.listRuns({ ...params, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });

  if (query.isError && isReadNotSupported(query.error)) {
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

  const items: Run[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      {/* Re-seed the filter draft whenever the URL's filter set changes without a
          remount (e.g. browser back/forward) by keying the bar on the serialized
          draft — matching the data-derived remount used elsewhere in Studio. */}
      <FilterBar
        key={JSON.stringify(draftFromSearch(search))}
        search={search}
        disabled={query.isPending}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={onExport}>Export CSV</Button>
      </div>
      {exportError !== null ? <ErrorState message={exportError} /> : null}

      {query.isPending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
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
                  <SortableHeader columnKey="cost" label="Cost" search={search} />
                  <SortableHeader columnKey="latencyMs" label="Latency" search={search} />
                  <SortableHeader columnKey="totalTokens" label="Tokens" search={search} />
                  <TH>Model</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((run) => (
                  <RunRow key={run.id} run={run} onOpen={openTrace} />
                ))}
              </TBody>
            </Table>
          </ScrollRegion>
          {query.hasNextPage ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--tai-space-3)' }}
            >
              <Button
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}

export function TracingTab({ search }: { readonly search: ObservabilitySearch }): ReactNode {
  const navigate = useAppNavigate();

  if (search.trace !== undefined) {
    return (
      <TraceView
        traceId={search.trace}
        onBack={() => {
          navigate('observability', mergeSearch(search, { trace: undefined }));
        }}
      />
    );
  }

  return <RunsTable search={search} />;
}
