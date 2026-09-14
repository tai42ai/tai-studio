/**
 * The runs table's Load-more control and its own retry: a next-page fetch, plus a
 * loud inline error when a Load-more fails (kept separate from a background-refresh
 * error so each retries the right fetch).
 */
import type { ReactNode } from 'react';
import { Button, errorMessage } from '@tai42/studio-sdk';

export interface RunsPaginationProps {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isFetchNextPageError: boolean;
  readonly error: unknown;
  readonly onFetchNext: () => void;
}

export function RunsPagination({
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  error,
  onFetchNext,
}: RunsPaginationProps): ReactNode {
  return (
    <>
      {hasNextPage ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--tai-space-3)' }}>
          <Button onClick={onFetchNext} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
      {isFetchNextPageError ? (
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
            Could not load more runs: {errorMessage(error)}
          </span>
          <Button onClick={onFetchNext}>Retry</Button>
        </div>
      ) : null}
    </>
  );
}
