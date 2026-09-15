/**
 * A runs-table column header that toggles the URL's sort key and direction on click.
 * A metric-sort header is disabled while an incompatible filter is set — switching to
 * it would send the one combo the reader answers 501 to (the mirror guard disables
 * those filters under a metric sort in the filter bar).
 */
import { SortAscIcon, SortDescIcon, TH, useAppNavigate } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import {
  hasMetricIncompatibleFilter,
  isMetricSort,
  mergeSearch,
  type ObservabilitySearch,
  type SortKey,
} from './filters';

export interface SortableHeaderProps {
  readonly columnKey: SortKey;
  readonly label: string;
  readonly search: ObservabilitySearch;
  readonly numeric?: boolean;
}

export function SortableHeader({
  columnKey,
  label,
  search,
  numeric = false,
}: SortableHeaderProps): ReactNode {
  const navigate = useAppNavigate();
  const active = search.sort === columnKey;
  const dir = active ? (search.dir ?? 'desc') : undefined;
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
