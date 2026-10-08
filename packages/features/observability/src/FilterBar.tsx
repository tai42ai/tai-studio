/**
 * The tracing filter bar: the time-range picker plus {@link MetricFilterFields}, with
 * Apply / Clear. The draft is re-seeded from the URL filter set DURING RENDER (React's
 * adjust-state-on-prop-change pattern) rather than by remounting on a `key`, so the
 * focused control keeps its keyboard caret the instant Apply commits (WCAG 2.4.3).
 *
 * The filters the active sort cannot be combined with come from the backend's served
 * capabilities and are disabled; when the capabilities could not be loaded, a warning
 * badge with a Retry says sorting is unavailable.
 */
import type { ObservabilityCapabilities } from '@tai42/api-client';
import { Badge, Button, Card, DateRangePicker, useAppNavigate } from '@tai42/studio-sdk';
import { type ReactNode, useState } from 'react';

import {
  ADVANCED_FILTER_KEYS,
  draftFromSearch,
  draftToPatch,
  type FilterDraft,
} from './filterDraft';
import {
  incompatibleFilters,
  mergeSearch,
  type ObservabilitySearch,
  rangeToPatch,
  searchToRange,
} from './filters';
import { MetricFilterFields } from './MetricFilterFields';

/** What the bar says when the backend's capabilities could not be loaded. */
export const CAPABILITIES_UNAVAILABLE =
  "Sorting unavailable — could not load the monitoring backend's capabilities.";

export interface FilterBarProps {
  readonly search: ObservabilitySearch;
  readonly disabled: boolean;
  /** The backend's served capabilities; `undefined` while loading or after a load failure. */
  readonly capabilities: ObservabilityCapabilities | undefined;
  readonly capabilitiesError: boolean;
  readonly onRetryCapabilities: () => void;
}

export function FilterBar({
  search,
  disabled,
  capabilities,
  capabilitiesError,
  onRetryCapabilities,
}: FilterBarProps): ReactNode {
  const navigate = useAppNavigate();
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromSearch(search));
  const seed = JSON.stringify(draftFromSearch(search));
  const [seededFrom, setSeededFrom] = useState(seed);
  if (seededFrom !== seed) {
    setSeededFrom(seed);
    setDraft(draftFromSearch(search));
  }

  // The filters the active sort cannot carry are disabled, so the unserved
  // combination is never composed.
  const unavailable = new Set(
    capabilities !== undefined ? incompatibleFilters(capabilities, search.sort) : [],
  );

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
        <MetricFilterFields draft={draft} unavailable={unavailable} onChange={set} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--tai-space-2)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
            <Button variant="primary" onClick={apply} disabled={disabled}>
              Apply filters
            </Button>
            <Button onClick={clear} disabled={disabled}>
              Clear
            </Button>
          </div>
          {capabilitiesError ? (
            <div
              data-testid="capabilities-unavailable"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}
            >
              <Badge variant="warning">{CAPABILITIES_UNAVAILABLE}</Badge>
              <Button variant="ghost" onClick={onRetryCapabilities}>
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
