/**
 * The transcript foot: what its tail is doing, never claiming more than the pane
 * keeps — live, paused this far back (with the Jump-to-latest that resumes it), or
 * stopped because the read itself is failing. Paused wins over stopped; the one
 * control clears both. Neither notice is a live region of its own.
 */
import type { ReactNode, RefObject } from 'react';

import { Button } from '@tai42/studio-sdk';

import { StaleRead } from './read-states';

export function TranscriptTailStatus({
  hasData,
  paused,
  pausedNotice,
  isRefetchError,
  error,
  onRetry,
  jumpRef,
  onJump,
}: {
  readonly hasData: boolean;
  readonly paused: boolean;
  readonly pausedNotice: string;
  readonly isRefetchError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly jumpRef: RefObject<HTMLButtonElement | null>;
  readonly onJump: () => void;
}): ReactNode {
  if (!hasData) return null;
  if (paused) {
    return (
      <div className="tai-row" data-testid="conversation-transcript-paused">
        <span className="tai-muted" style={{ fontSize: 'var(--tai-text-xs)' }}>
          {pausedNotice}
        </span>
        <Button ref={jumpRef} onClick={onJump}>
          Jump to latest
        </Button>
      </div>
    );
  }
  if (isRefetchError) return <StaleRead error={error} onRetry={onRetry} />;
  return (
    <p className="tai-muted" style={{ margin: 0, fontSize: 'var(--tai-text-xs)' }}>
      New messages appear here on their own.
    </p>
  );
}
