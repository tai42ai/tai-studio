/**
 * The thread-list foot: what the list is doing when that is not "quietly keeping
 * itself current" — paused this far down (with the Back-to-the-newest that resumes
 * it), or refreshing and failing. Paused wins; the one control clears both.
 */
import { Button } from '@tai42/studio-sdk';
import type { ReactNode, RefObject } from 'react';

import { StaleRead } from './read-states';

export function ThreadRefreshNotice({
  paused,
  pausedNotice,
  isRefetchError,
  error,
  onRetry,
  resumeRef,
  onResume,
}: {
  readonly paused: boolean;
  readonly pausedNotice: string;
  readonly isRefetchError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly resumeRef: RefObject<HTMLButtonElement | null>;
  readonly onResume: () => void;
}): ReactNode {
  if (paused) {
    return (
      <div className="tai-row" data-testid="conversation-threads-paused">
        <span className="tai-muted" style={{ fontSize: 'var(--tai-text-xs)' }}>
          {pausedNotice}
        </span>
        <Button ref={resumeRef} onClick={onResume}>
          Back to the newest
        </Button>
      </div>
    );
  }
  if (isRefetchError) return <StaleRead error={error} onRetry={onRetry} />;
  return null;
}
