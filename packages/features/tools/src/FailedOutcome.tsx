/**
 * A failed tool run: the door's message, and — when the run reached a failed terminal — the
 * outcome the run delivered, shown in the same viewer a successful run's result uses.
 *
 * The sync run-tool door delivers a failed terminal as `{ error, outcome }` (read off the
 * `ApiError`'s parsed body by {@link failedOutcomeOf}); a background run's record carries the
 * same `outcome` beside its `error`. A plain raise carries no outcome and shows the message alone.
 */
import { ApiError } from '@tai42/api-client';
import { ErrorState } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { ResultViewer } from './ResultViewer';

/** The `outcome` a sync door's failed-terminal answer carried in its body, else `undefined`. */
export function failedOutcomeOf(error: unknown): unknown {
  if (!(error instanceof ApiError)) return undefined;
  const body = error.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  return 'outcome' in body ? (body as { readonly outcome: unknown }).outcome : undefined;
}

export function FailedOutcome({
  message,
  outcome,
}: {
  readonly message: string;
  /** The run's own outcome, present only when the run reached a failed terminal. */
  readonly outcome?: unknown;
}): ReactNode {
  return (
    <>
      <ErrorState message={message} />
      {outcome !== undefined ? (
        <section className="tai-stack" data-testid="tool-run-outcome">
          <h3 className="tai-card-title">Outcome</h3>
          <ResultViewer result={outcome} />
        </section>
      ) : null}
    </>
  );
}
