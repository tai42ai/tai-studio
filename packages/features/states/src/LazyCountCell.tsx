/**
 * A table cell that loads a per-row count LAZILY: one read per visible row, a `Skeleton`
 * inline until it lands, and a failure rendered as `—` with the error on `title` — so a
 * slow or failing per-row read never walls the list. The caller supplies the query and a
 * selector that derives the count from its data.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton, errorMessage, useApi } from '@tai42/studio-sdk';

export interface LazyCountCellProps<T> {
  readonly queryKey: readonly unknown[];
  readonly queryFn: (api: ReturnType<typeof useApi>, signal: AbortSignal) => Promise<T>;
  readonly count: (data: T) => number;
}

export function LazyCountCell<T>({ queryKey, queryFn, count }: LazyCountCellProps<T>): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => queryFn(api, signal),
  });
  if (query.isPending) return <Skeleton height={16} />;
  if (query.isError) {
    return <span title={errorMessage(query.error)}>—</span>;
  }
  return <>{count(query.data)}</>;
}
