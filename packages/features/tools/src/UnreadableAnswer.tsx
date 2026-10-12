/**
 * The loud panel for a run answer the studio cannot read: the fixed sentence in the SDK's
 * error surface, and a "Details" disclosure holding the first schema issue. The raw value
 * is never shown.
 */
import type { ApiSchemaError } from '@tai42/api-client';
import { ErrorState } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { unreadableIssue } from './run-asks';

/** What the sync run panel says for a run-tool answer it cannot read. */
export const UNREADABLE_RUN_ANSWER =
  'The run finished, but its answer is in a format this studio cannot read, so it is not shown.';

/** What a background run says for a parked record whose stored answer it cannot read. */
export const UNREADABLE_PARKED_ANSWER =
  "This parked run's stored answer is in an older format and cannot be shown. The record expires on its own.";

export function UnreadableAnswer({
  message,
  error,
  testId,
}: {
  readonly message: string;
  readonly error: ApiSchemaError;
  readonly testId: string;
}): ReactNode {
  return (
    <div className="tai-stack tai-stack-2" data-testid={testId}>
      <ErrorState message={message} />
      <details className="tai-stack tai-stack-2">
        <summary>Details</summary>
        <code className="tai-mono" style={{ wordBreak: 'break-word' }}>
          {unreadableIssue(error)}
        </code>
      </details>
    </div>
  );
}
