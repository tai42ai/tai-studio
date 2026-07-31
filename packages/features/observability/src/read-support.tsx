/**
 * The "monitoring read not supported" state. The default no-op monitoring backend
 * returns EMPTY data over HTTP 200 (rendered as normal empty tiles/tables); only a
 * write-only / read-incapable backend answers a read with the
 * `monitoring-read-not-supported` code (carried on an HTTP 501). The pinned `code`
 * is authoritative; the 501 status is the fallback signal. Either earns a dedicated
 * full-page explanation, never a retry loop or an error toast.
 */
import type { ReactNode } from 'react';
import { ApiError } from '@tai42/api-client';
import { AppLink, EmptyState } from '@tai42/studio-sdk';

/** True when `error` is the monitoring read-not-supported failure from the skeleton. */
export function isReadNotSupported(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.code === 'monitoring-read-not-supported' || error.status === 501;
}

/** The dedicated full-page state shown when the backend cannot serve reads. */
export function ReadNotSupported(): ReactNode {
  return (
    <div
      data-testid="observability-read-not-supported"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}
    >
      <EmptyState
        title="Monitoring reads are not available"
        description="The installed monitoring backend does not support reading. Install a read-capable monitoring plugin to see runs, traces, and metrics here."
        action={
          <AppLink
            to="marketplace"
            search={{ kind: 'monitoring' }}
            className="tai-btn tai-btn-secondary"
          >
            Browse marketplace
          </AppLink>
        }
      />
    </div>
  );
}
