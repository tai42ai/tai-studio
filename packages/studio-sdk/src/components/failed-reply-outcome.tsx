/**
 * `FailedReplyOutcome` — the recycle roll a failed write's reply carries, read through the
 * client that raised it and shown beside the failure's message. A reply without a roll renders
 * nothing. It never mounts a reload's success headline: a reply without a fleet report folds to
 * a `converged` summary, which beside an error would be false.
 */
import type { ReactNode } from 'react';

import { useApi } from '../hooks/useApi';
import { FleetOutcomeReport } from './fleet-outcome-report';

export interface FailedReplyOutcomeProps {
  /** The rejected value of the write. */
  readonly error: unknown;
  /** The name of the write that failed. */
  readonly scope: string;
}

export function FailedReplyOutcome({ error, scope }: FailedReplyOutcomeProps): ReactNode {
  const roll = useApi().failedReplyRoll(error);
  if (roll === null) return null;
  return (
    <FleetOutcomeReport
      summary={roll.summary}
      recycle={roll.recycle}
      action="failed"
      scope={scope}
    />
  );
}
