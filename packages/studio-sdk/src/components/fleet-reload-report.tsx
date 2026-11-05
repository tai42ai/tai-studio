/**
 * The outcome of a fleet soft restart, the one report both reload doors mount: a headline read
 * from the reply on top of the fleet outcome report.
 *
 * The headline appears only when no worker's broadcast row reports a failure, the failure panel
 * speaking otherwise. It calls the fleet converged only when no worker is left behind and every
 * worker is known to run the stored configuration. Otherwise it states each fact the reply holds:
 * a worker the stored configuration did not build on, a roll that stopped, a worker that needs a
 * restart, a worker the reply says neither about, a restart the reply cannot confirm, a worker
 * that only confirmed it needs no restart. It says the reload was applied only when the reply
 * names no worker that may not have applied it.
 */
import type { AwaitingRestartReading, FleetReportSummary, RecycleRoll } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { FleetOutcomeReport } from './fleet-outcome-report';
import { AlertTriangleIcon } from './icons';

/** The sentence one reading of the awaiting workers adds to the headline, by their count. */
const AWAITING_FACT: Record<AwaitingRestartReading, (count: number) => string> = {
  withheld: (count) =>
    count === 1
      ? 'The stored configuration did not build on 1 worker, which keeps its current configuration.'
      : `The stored configuration did not build on ${String(count)} workers, which keep their current configuration.`,
  restartable: (count) =>
    count === 1
      ? '1 worker still needs a restart.'
      : `${String(count)} workers still need a restart.`,
  unstated: (count) =>
    count === 1
      ? '1 worker has settings it has not applied.'
      : `${String(count)} workers have settings they have not applied.`,
};

/** The sentence the workers whose restart waits on their own change add, by their count. */
const pendingRestartFact = (count: number): string =>
  count === 1
    ? '1 worker restarts once its own in-flight change has replied, which this report cannot confirm.'
    : `${String(count)} workers restart once their own in-flight changes have replied, which this report cannot confirm.`;

/** The sentence the workers the roll confirmed clean after an unconfirmed reload add. */
const confirmedCleanFact = (count: number): string =>
  count === 1
    ? '1 worker did not confirm the reload at first, then confirmed it needs no restart.'
    : `${String(count)} workers did not confirm the reload at first, then confirmed they need no restart.`;

/** The warning an unfailed reload still owes the operator, or `null` for none. */
function appliedReloadWarning(
  summary: FleetReportSummary,
  recycle: RecycleRoll | null,
): string | null {
  const stopped = recycle?.recycle_stopped != null;
  const { restartsPending, reloadsUnconfirmed } = summary;
  if (
    !stopped &&
    summary.awaiting.length === 0 &&
    restartsPending.length === 0 &&
    reloadsUnconfirmed.length === 0
  ) {
    return null;
  }
  const confirmedClean = reloadsUnconfirmed.filter((name) => !restartsPending.includes(name));
  const count = (reading: AwaitingRestartReading): number =>
    summary.awaiting.filter((worker) => worker.reading === reading).length;
  const fact = (reading: AwaitingRestartReading): string[] =>
    count(reading) > 0 ? [AWAITING_FACT[reading](count(reading))] : [];
  return [
    ...(count('withheld') === 0 && count('unstated') === 0 && reloadsUnconfirmed.length === 0
      ? ['The reload was applied.']
      : []),
    ...fact('withheld'),
    ...(stopped ? ['The worker restarts stopped before they finished.'] : []),
    ...fact('restartable'),
    ...fact('unstated'),
    ...(restartsPending.length > 0 ? [pendingRestartFact(restartsPending.length)] : []),
    ...(confirmedClean.length > 0 ? [confirmedCleanFact(confirmedClean.length)] : []),
  ].join(' ');
}

function AppliedReloadHeadline({ warning }: { readonly warning: string | null }): ReactNode {
  if (warning !== null) {
    return (
      <p role="status" className="tai-status tai-status-warn" style={{ margin: 0 }}>
        <AlertTriangleIcon />
        {warning}
      </p>
    );
  }
  return (
    <p role="status" style={{ margin: 0, color: 'var(--tai-color-ok-text)' }}>
      Reload converged across the fleet.
    </p>
  );
}

export interface FleetReloadReportProps {
  /** The reply folded by `summarizeFleetReload`. */
  readonly summary: FleetReportSummary;
  /** The reply's `recycle`: the roll the reload ran. */
  readonly recycle: RecycleRoll | null;
}

export function FleetReloadReport({ summary, recycle }: FleetReloadReportProps): ReactNode {
  return (
    <div className="tai-stack tai-stack-3">
      {summary.status === 'converged' ? (
        <AppliedReloadHeadline warning={appliedReloadWarning(summary, recycle)} />
      ) : null}
      <FleetOutcomeReport summary={summary} recycle={recycle} action="reload" />
    </div>
  );
}
