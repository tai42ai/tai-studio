/**
 * The three distinct ways a monitoring read can fail to return data, each with its
 * own surface.
 *
 * READ NOT SUPPORTED — the backend cannot read AT ALL. The default no-op backend
 * returns EMPTY data over HTTP 200 (rendered as normal empty tiles/tables); only a
 * write-only / read-incapable backend answers a read with the
 * `monitoring-read-not-supported` code (carried on an HTTP 501). The pinned `code`
 * is authoritative; the 501 status is the fallback signal. Either earns a dedicated
 * full-page explanation pointing at the marketplace — the backend will never read.
 *
 * READ TOO BROAD — the backend CAN read, but the request spans too wide a window or
 * too deep a page for its bounded walk to resolve. It answers with the
 * `monitoring-read-too-broad` code on an HTTP 400 and carries the backend's own
 * human guidance (e.g. "narrow the time range"). This is a considered refusal, not a
 * malfunction: it renders INLINE beside the filters as a warn notice carrying the
 * backend's exact words, so the reader narrows and retries — never the full-page
 * marketplace pitch, never a silent empty result.
 *
 * READ NOT SERVED — the backend CAN read, but not this request: a sort, a filter
 * with a sort, or a granularity it does not serve. It answers with the
 * `monitoring-read-not-served` code on an HTTP 400 and its own message. The notice
 * replaces the result area only; the filters and the time range stay with their
 * values. The runs table shows the same notice, without sending a read, for a link
 * whose sort the backend's declared capabilities do not serve.
 */
import { ApiError } from '@tai42/api-client';
import { AlertTriangleIcon, AppLink, EmptyState } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

/** True when `error` is the monitoring read-not-supported failure from the skeleton. */
export function isReadNotSupported(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.code === 'monitoring-read-not-supported' || error.status === 501;
}

/**
 * True when `error` is the monitoring read-too-broad refusal from the skeleton. Keyed
 * on the pinned `code` alone: the 400 status is shared by many unrelated client
 * faults, so only the code identifies this one.
 */
export function isReadTooBroad(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'monitoring-read-too-broad';
}

/**
 * True when `error` is the monitoring read-not-served refusal from the skeleton. Keyed
 * on the pinned `code` alone, as the 400 status is shared by unrelated client faults.
 */
export function isReadNotServed(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'monitoring-read-not-served';
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

/**
 * The inline warn notice shown when the current filters ask for too broad a read.
 * It carries the backend's exact guidance verbatim — a considered refusal takes the
 * design system's warn ground, never the error headline — and sits beside the
 * untouched filters so the reader narrows the window or page and retries.
 */
export function ReadTooBroadNotice({ message }: { readonly message: string }): ReactNode {
  return (
    <div
      role="alert"
      className="tai-warn-state tai-stack tai-stack-2"
      data-testid="observability-read-too-broad"
    >
      <strong className="tai-status tai-status-warn">
        <AlertTriangleIcon />
        This read is too broad
      </strong>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message}</p>
    </div>
  );
}

/**
 * The inline warn notice shown when the backend does not serve the request as it is.
 * It carries the message verbatim; `action`, when given, renders after the message
 * (the runs table passes the control that leaves the unserved sort).
 */
export function ReadNotServedNotice({
  message,
  action,
}: {
  readonly message: string;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <div
      role="alert"
      className="tai-warn-state tai-stack tai-stack-2"
      data-testid="observability-read-not-served"
    >
      <strong className="tai-status tai-status-warn">
        <AlertTriangleIcon />
        This request is not served by the monitoring backend
      </strong>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message}</p>
      {action === undefined ? null : <div>{action}</div>}
    </div>
  );
}
