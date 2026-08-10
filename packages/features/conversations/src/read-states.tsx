/**
 * The three honest answers a conversation read can give that are NOT "it broke",
 * plus the loud error state for everything that is — and, for a read that has
 * already succeeded once, the note that says its refreshing has stopped.
 *
 * - 501: the deployment configured no conversations backend. OFF is a state, not
 *   an error — the shared `FeatureDisabled` note, carrying the server's own
 *   remediation line.
 * - 403: the read needs an authority this session may legitimately not hold. It
 *   arrives from EITHER of two layers, and means the same thing from both. The
 *   ACCESS GATE sits ahead of every conversations door and refuses all of them to
 *   a session without the grant, so no door here is one a 403 cannot reach — the
 *   transcript included, whose own operation declares none. Above that, the thread
 *   listing refuses a scoped caller on its own account, because a listing spans
 *   every caller on the route. Both are capability boundaries rather than
 *   failures, so EVERY read passes the copy for its own 403 and reads as an empty
 *   state; none of them shows the gate's raw refusal in a red error.
 * - 404: the record is gone, or was never the reader's to see — one answer for
 *   both, because the door deliberately gives one. Retrying is futile, so it
 *   never gets a retry button.
 *
 * Anything else is a real failure and lands in a loud, retryable `ErrorState`.
 */
import type { CSSProperties, ReactNode } from 'react';
import { ApiError } from '@tai42/api-client';
import {
  Button,
  EmptyState,
  ErrorState,
  FeatureDisabled,
  errorMessage,
  featureDisabledMessage,
  isFeatureDisabled,
} from '@tai42/studio-sdk';

/** The Studio-facing name of this feature, used in the OFF note. */
const FEATURE_NAME = 'Conversations';

/** True when the read was refused for lack of authority (never a transport failure). */
function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

/** True when the resource does not exist — an unknown route, or a thread the index lost. */
function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export interface ReadFailureProps {
  readonly error: unknown;
  readonly onRetry: () => void;
  /**
   * The copy for a 403 on this particular read. Required, not optional: the access
   * gate can refuse any of these doors, so there is no door here that a 403 cannot
   * legitimately reach and none that may fall through to the loud error state.
   */
  readonly forbiddenDescription: string;
  /** The copy for a 404 on this particular read. */
  readonly notFoundDescription: string;
}

export function ReadFailure({
  error,
  onRetry,
  forbiddenDescription,
  notFoundDescription,
}: ReadFailureProps): ReactNode {
  if (isFeatureDisabled(error)) {
    return <FeatureDisabled feature={FEATURE_NAME} message={featureDisabledMessage(error)} />;
  }
  if (isForbidden(error)) {
    return <EmptyState title="Not available to this session" description={forbiddenDescription} />;
  }
  if (isNotFound(error)) {
    return <EmptyState title="No longer available" description={notFoundDescription} />;
  }
  return <ErrorState message={errorMessage(error)} onRetry={onRetry} />;
}

const staleRowStyle: CSSProperties = {
  color: 'var(--tai-color-warn-text)',
  fontSize: 'var(--tai-text-xs)',
};

export interface StaleReadProps {
  readonly error: unknown;
  readonly onRetry: () => void;
}

/**
 * What a pane says once its refreshing has stopped. Also what it ANNOUNCES: the
 * words are read out of the pane's standing live region, so they are needed before
 * the notice exists and cannot be owned by it.
 */
export function staleReadMessage(error: unknown): string {
  return isNotFound(error)
    ? 'Stopped updating: this read is no longer available. These are the last records read.'
    : `Stopped updating: ${errorMessage(error)}`;
}

/**
 * A pane whose REFRESH failed while its pages are still on screen. What it shows
 * is a last reading, not a live one — it stays up, because blanking a monitor
 * over one bad tick is worse, but it must never keep passing for live. A 404 is
 * the records themselves going (retention, or authority lost), which no retry
 * undoes, so that one offers none.
 *
 * It carries NO live-region role of its own. It mounts with its text already in
 * it, and a region inserted complete announces nothing; the pane's standing region
 * speaks {@link staleReadMessage} instead, which is a change inside a region that
 * was already there.
 */
export function StaleRead({ error, onRetry }: StaleReadProps): ReactNode {
  return (
    <div className="tai-row" data-testid="conversation-stale-read">
      <span style={staleRowStyle}>{staleReadMessage(error)}</span>
      {isNotFound(error) ? null : <Button onClick={onRetry}>Retry</Button>}
    </div>
  );
}
