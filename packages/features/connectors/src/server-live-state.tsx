/**
 * How the Connectors screens show an MCP server that is not bound: a start still in
 * progress (the Starting line, and the block that carries the start's message with a way
 * to check again), a failure (the Failed line, and the block that carries the platform's
 * message), and a server the worker that answered has not loaded.
 */
import { Button } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { StatusLine } from './status-line';
import type { UnboundServer } from './use-directory';

/** The Starting line: the pending tone with its icon, announced as a status. */
export function StartingLine(): ReactNode {
  return (
    <StatusLine tone="pending" role="status">
      Starting
    </StatusLine>
  );
}

/**
 * A server start still in progress: the Starting line, the platform's message about the
 * start, an optional note on what waits for it, and Check again.
 */
export function ServerStarting({
  message,
  note,
  onCheckAgain,
}: {
  readonly message: string;
  readonly note?: string;
  readonly onCheckAgain: () => void;
}): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <StartingLine />
      <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{message}</p>
      {note === undefined ? null : (
        <p className="tai-status" style={{ margin: 0 }}>
          {note}
        </p>
      )}
      <div>
        <Button onClick={onCheckAgain}>Check again</Button>
      </div>
    </div>
  );
}

/** The Failed line: the error tone with its icon and the failure's category. */
export function FailedLine({ failure }: { readonly failure: UnboundServer }): ReactNode {
  return <StatusLine tone="err">{`Failed: ${failure.category}`}</StatusLine>;
}

/** A failed server: the Failed line and the platform's message about the failure. */
export function ServerFailed({ failure }: { readonly failure: UnboundServer }): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <FailedLine failure={failure} />
      <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{failure.message}</p>
    </div>
  );
}

/** A configured server the worker that answered the status read has not loaded. */
export function NotLoadedLine({ title }: { readonly title: string }): ReactNode {
  return (
    <StatusLine tone="warn">
      {`${title} is configured, but the worker that answered has not loaded it.`}
    </StatusLine>
  );
}
