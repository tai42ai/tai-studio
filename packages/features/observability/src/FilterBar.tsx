/**
 * The tracing filter bar: the time-range picker plus {@link MetricFilterFields}, with
 * Apply / Clear. The draft is re-seeded from the URL filter set DURING RENDER (React's
 * adjust-state-on-prop-change pattern) rather than by remounting on a `key`, so the
 * focused control keeps its keyboard caret the instant Apply commits (WCAG 2.4.3).
 */
import { useState, type ReactNode } from 'react';
import { Button, Card, DateRangePicker, useAppNavigate } from '@tai42/studio-sdk';

import {
  ADVANCED_FILTER_KEYS,
  draftFromSearch,
  draftToPatch,
  type FilterDraft,
} from './filterDraft';
import { MetricFilterFields } from './MetricFilterFields';
import {
  isMetricSort,
  mergeSearch,
  rangeToPatch,
  searchToRange,
  type ObservabilitySearch,
} from './filters';

export interface FilterBarProps {
  readonly search: ObservabilitySearch;
  readonly disabled: boolean;
}

export function FilterBar({ search, disabled }: FilterBarProps): ReactNode {
  const navigate = useAppNavigate();
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromSearch(search));
  const seed = JSON.stringify(draftFromSearch(search));
  const [seededFrom, setSeededFrom] = useState(seed);
  if (seededFrom !== seed) {
    setSeededFrom(seed);
    setDraft(draftFromSearch(search));
  }

  // A metric sort cannot carry a level/cost/token/latency filter; while one is active
  // those fields are disabled so the incompatible combo is never composed.
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
        <MetricFilterFields draft={draft} metricSortActive={metricSortActive} onChange={set} />
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
