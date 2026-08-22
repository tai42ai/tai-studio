/**
 * Tracing tab — a filterable, sortable, paginated runs table over
 * `listRuns(filters)`. The filter set, sort key/direction, and the drilled-in
 * trace id all live in the URL (written via `navigate`), so a view is linkable
 * and survives the stats→tracing drill-through. A row click sets `trace` in the
 * URL, switching this tab to the per-run {@link TraceView}.
 *
 * The time window is a {@link DateRangePicker} (presets + custom), committed to the
 * URL immediately. A metric sort (cost/latency/tokens) cannot combine with a
 * level/cost/token/latency filter — the reader would answer 501 — so the widgets
 * that would create the combo are guarded on both sides, and a combo arriving from
 * the URL is repaired to a legal query before it is ever sent. A 501 that still
 * reaches an already-loaded table renders inline, not as the full-page marketplace
 * pitch (that pitch is only the right answer before any runs have loaded).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Run } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  DateRangePicker,
  EmptyState,
  ErrorState,
  Field,
  JsonTree,
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
  previewTree,
  previewValue,
} from './format';
import {
  hasMetricIncompatibleFilter,
  isMetricSort,
  mergeSearch,
  rangeToPatch,
  runsParams,
  sanitizeSearch,
  searchToRange,
  type ObservabilitySearch,
  type SortKey,
} from './filters';
import { runsKey } from './keys';
import { isReadNotSupported, ReadNotSupported } from './read-support';
import { TraceView } from './TraceView';

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

/** The advanced-filter keys the bar owns, so Clear drops exactly these. */
const ADVANCED_FILTER_KEYS: readonly (keyof ObservabilitySearch)[] = [
  'status',
  'tags',
  'minCost',
  'maxCost',
  'minTokens',
  'maxTokens',
  'minLatencyMs',
  'maxLatencyMs',
];

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
  const seed = JSON.stringify(draftFromSearch(search));
  const [seededFrom, setSeededFrom] = useState(seed);
  // Re-seed the draft from the URL's filter set DURING RENDER (React's documented
  // adjust-state-on-prop-change pattern) rather than by remounting on a `key`: this
  // bar is what writes the filter set, so a remount keyed on it detaches the focused
  // control the instant Apply commits and drops the keyboard caret on
  // `document.body` (WCAG 2.4.3). Render-phase re-seeding still tracks a URL change
  // that arrives without a remount, such as browser back/forward.
  if (seededFrom !== seed) {
    setSeededFrom(seed);
    setDraft(draftFromSearch(search));
  }

  // A metric sort cannot carry a level/cost/token/latency filter; while one is
  // active those fields are disabled so the incompatible combo is never composed
  // (the sort-header guard blocks the mirror case). Time range and tags stay live.
  const metricSortActive = isMetricSort(search.sort);

  const set = (patch: Partial<FilterDraft>): void => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const apply = (): void => {
    navigate('observability', mergeSearch(search, draftToPatch(draft)));
  };

  const clear = (): void => {
    const cleared: Partial<ObservabilitySearch> = {};
    for (const key of ADVANCED_FILTER_KEYS) cleared[key] = undefined;
    setDraft(draftFromSearch({ tab: search.tab }));
    navigate('observability', mergeSearch(search, cleared));
  };

  const onRangeChange = (value: Parameters<typeof rangeToPatch>[0]): void => {
    navigate('observability', mergeSearch(search, rangeToPatch(value)));
  };

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <DateRangePicker
          aria-label="Run time range"
          value={searchToRange(search)}
          onValueChange={onRangeChange}
          disabled={disabled}
        />
        <div style={fieldRowStyle}>
          <Field label="Status">
            <Select
              options={[
                { value: STATUS_ANY, label: 'Any status' },
                { value: 'success', label: 'Success' },
                { value: 'error', label: 'Error' },
              ]}
              value={draft.status}
              disabled={metricSortActive}
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
          <Field label="Min cost">
            <NumberInput
              value={draft.minCost}
              disabled={metricSortActive}
              onChange={(e) => {
                set({ minCost: e.target.value });
              }}
            />
          </Field>
          <Field label="Max cost">
            <NumberInput
              value={draft.maxCost}
              disabled={metricSortActive}
              onChange={(e) => {
                set({ maxCost: e.target.value });
              }}
            />
          </Field>
          <Field label="Min tokens">
            <NumberInput
              value={draft.minTokens}
              disabled={metricSortActive}
              onChange={(e) => {
                set({ minTokens: e.target.value });
              }}
            />
          </Field>
          <Field label="Max tokens">
            <NumberInput
              value={draft.maxTokens}
              disabled={metricSortActive}
              onChange={(e) => {
                set({ maxTokens: e.target.value });
              }}
            />
          </Field>
          <Field label="Min latency (ms)">
            <NumberInput
              value={draft.minLatencyMs}
              disabled={metricSortActive}
              onChange={(e) => {
                set({ minLatencyMs: e.target.value });
              }}
            />
          </Field>
          <Field label="Max latency (ms)">
            <NumberInput
              value={draft.maxLatencyMs}
              disabled={metricSortActive}
              onChange={(e) => {
                set({ maxLatencyMs: e.target.value });
              }}
            />
          </Field>
        </div>
        {metricSortActive ? (
          <p className="tai-muted" style={{ margin: 0, fontSize: 'var(--tai-text-sm)' }}>
            Status, cost, token, and latency filters are unavailable while sorting by a metric. Sort
            by When to use them.
          </p>
        ) : null}
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
  numeric = false,
}: {
  readonly columnKey: SortKey;
  readonly label: string;
  readonly search: ObservabilitySearch;
  readonly numeric?: boolean;
}): ReactNode {
  const navigate = useAppNavigate();
  const active = search.sort === columnKey;
  const dir = active ? (search.dir ?? 'desc') : undefined;
  // A metric-sort header is disabled while an incompatible filter is set: switching
  // to it would send the one combo the reader answers 501 to. The mirror guard
  // (disabling those filters under a metric sort) lives in the filter bar.
  const disabled = isMetricSort(columnKey) && hasMetricIncompatibleFilter(search);
  const onClick = (): void => {
    if (disabled) return;
    const nextDir: 'asc' | 'desc' = active && dir === 'desc' ? 'asc' : 'desc';
    navigate('observability', mergeSearch(search, { sort: columnKey, dir: nextDir }));
  };
  return (
    <TH
      numeric={numeric}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={
          disabled
            ? 'Clear the status, cost, token, and latency filters to sort by this metric.'
            : undefined
        }
        style={{
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          padding: 0,
          font: 'inherit',
          color: disabled ? 'var(--tai-color-text-disabled)' : 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
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

function RunPreview({
  value,
  label,
}: {
  readonly value: unknown;
  readonly label: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const inline = previewValue(value);
  const tree = previewTree(value);

  const truncStyle: CSSProperties = {
    display: 'block',
    maxWidth: '14rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--tai-text-xs)',
    color: 'var(--tai-color-text-muted)',
  };

  if (tree === null) {
    return (
      <span className="tai-mono" style={truncStyle}>
        {inline}
      </span>
    );
  }

  // The row drills into the trace on click/Enter; the row handler ignores events
  // that originate inside this marked subtree, so expanding the preview never
  // navigates. The JsonTree mounts only once open, so a long runs list never lays
  // out a tree per row.
  return (
    <div
      data-run-preview=""
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}
    >
      <button
        type="button"
        className="tai-btn tai-btn-ghost"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
        }}
        style={{ justifyContent: 'flex-start', padding: 'var(--tai-space-1)' }}
      >
        <span className="tai-mono" style={truncStyle}>
          {inline}
        </span>
      </button>
      {open ? <JsonTree data={tree} defaultExpanded={false} label={label} /> : null}
    </div>
  );
}

function RunRow({
  run,
  onOpen,
}: {
  readonly run: Run;
  readonly onOpen: (traceId: string) => void;
}): ReactNode {
  // A click or keypress that started inside a run preview (its expand button or the
  // JSON tree it opens) is the preview's own — never a request to drill into the run.
  const fromPreview = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('[data-run-preview]') !== null;
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

  // The full-page marketplace pitch is only the right answer BEFORE any runs have
  // loaded: a 501 that arrives on a refetch of an already-loaded table (or a
  // guarded query that slipped through) renders inline instead of blanking the
  // whole tab. Both 501 sources share one error code, so this keys off load state.
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

  const items: Run[] = query.data?.pages.flatMap((page) => page.items) ?? [];

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
        // Only the INITIAL-load failure (no pages retained) blanks the table;
        // query-core flags `status: 'error'` on any fetch error even with data
        // present, so this must key off `isLoadingError`, not `isError`.
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          {query.isError && !query.isFetchNextPageError ? (
            // A background refetch (window focus, a filter round-trip, a manual
            // Refresh) failed while pages are retained. A Load-more failure is also
            // an error with data present, so it is excluded here and gets its own
            // retry by the control.
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
              {query.hasNextPage ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginTop: 'var(--tai-space-3)',
                  }}
                >
                  <Button
                    onClick={() => void query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                  >
                    {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              ) : null}
              {query.isFetchNextPageError ? (
                <div
                  role="alert"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--tai-space-2)',
                    marginTop: 'var(--tai-space-2)',
                  }}
                >
                  <span style={{ color: 'var(--tai-color-err-text)' }}>
                    Could not load more runs: {errorMessage(query.error)}
                  </span>
                  <Button onClick={() => void query.fetchNextPage()}>Retry</Button>
                </div>
              ) : null}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export function TracingTab({ search }: { readonly search: ObservabilitySearch }): ReactNode {
  const navigate = useAppNavigate();
  const cleaned = sanitizeSearch(search);
  const repaired = cleaned !== search;

  // A metric-sort×filter combo can only reach here from the URL (a shared or
  // hand-edited link). Rewrite it to the repaired, legal search so the URL — the
  // source of truth — never states a query the backend cannot serve. `sanitizeSearch`
  // returns the same reference when nothing needs repair, so this fires at most once.
  useEffect(() => {
    if (repaired) navigate('observability', cleaned);
  }, [repaired, cleaned, navigate]);

  if (cleaned.trace !== undefined) {
    return (
      <TraceView
        traceId={cleaned.trace}
        onBack={() => {
          navigate('observability', mergeSearch(cleaned, { trace: undefined }));
        }}
      />
    );
  }

  return <RunsTable search={cleaned} />;
}
