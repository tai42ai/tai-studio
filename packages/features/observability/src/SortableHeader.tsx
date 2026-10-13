/**
 * A runs-table column header that toggles the URL's sort key and direction on click.
 * It is a sort button only once the backend's served capabilities say the key is a
 * served sort; while they load, or when they could not be loaded, it is plain text.
 * A served sort is disabled while a filter it cannot combine with is set (the mirror
 * guard disables those filters under the active sort in the filter bar).
 */
import type { ObservabilityCapabilities } from '@tai42/api-client';
import { SortAscIcon, SortDescIcon, TH, useAppNavigate } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import {
  hasIncompatibleFilter,
  isSortServed,
  mergeSearch,
  type ObservabilitySearch,
  type SortKey,
} from './filters';

/** Why a served sort header is disabled. */
export const SORT_COMBINATION_NOTE =
  'Not available with the current filters — the monitoring backend cannot combine them.';

export interface SortableHeaderProps {
  readonly columnKey: SortKey;
  readonly label: string;
  readonly search: ObservabilitySearch;
  /** The backend's served capabilities; `undefined` while loading or after a load failure. */
  readonly capabilities: ObservabilityCapabilities | undefined;
  readonly numeric?: boolean;
}

export function SortableHeader({
  columnKey,
  label,
  search,
  capabilities,
  numeric = false,
}: SortableHeaderProps): ReactNode {
  const navigate = useAppNavigate();
  const active = search.sort === columnKey;
  const dir = active ? (search.dir ?? 'desc') : undefined;
  const ariaSort = active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';

  if (capabilities === undefined || !isSortServed(capabilities, columnKey)) {
    return (
      <TH numeric={numeric} aria-sort={ariaSort}>
        {label}
      </TH>
    );
  }

  const disabled = hasIncompatibleFilter(search, capabilities, columnKey);
  const onClick = (): void => {
    if (disabled) return;
    const nextDir: 'asc' | 'desc' = active && dir === 'desc' ? 'asc' : 'desc';
    navigate('observability', mergeSearch(search, { sort: columnKey, dir: nextDir }));
  };
  return (
    <TH numeric={numeric} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabled ? SORT_COMBINATION_NOTE : undefined}
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
