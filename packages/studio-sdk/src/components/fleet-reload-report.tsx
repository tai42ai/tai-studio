/**
 * The outcome of a fleet soft restart, the one report both reload doors mount: a headline read
 * from the reply on top of the fleet outcome report.
 *
 * The headline appears only when no worker's broadcast row reports a failure, the failure panel
 * speaking otherwise. Its success line appears only when no worker is left behind, every
 * worker is known to run the stored configuration and no worker the reply names beyond its one row
 * has an open outcome, and states the workers the report covers: the fleet, the selected workers,
 * only this worker, or one row and what the reply says of the other workers it names.
 * Otherwise it states each fact the reply holds: a worker the stored configuration did not
 * build on, a roll that stopped, a worker that needs a restart, a worker the reply says neither
 * about, a restart the reply cannot confirm, a worker that only confirmed it needs no restart, then
 * the workers the reload covered unless that is the fleet. It says the reload was applied only when
 * the reply names no worker that may not have applied it and rules out any it does not name: a
 * single row that does not show the worker was alone says nothing of the others.
 */
import type {
  AwaitingRestartReading,
  FleetReloadNamedWorker,
  FleetReloadReach,
  FleetReloadSummary,
  FleetReloadWorkerStatement,
  RecycleRoll,
} from '@tai42/api-client';
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

/** Why a lone answering worker reached no other, on a bus with no one else or with no bus at all. */
const ALONE_ON_BUS = 'no other worker was on the worker bus when it ran';
const NO_BUS = 'no worker bus is configured';

/** The statements that leave a worker's outcome settled, so a success line may stand beside them. */
const SETTLED_STATEMENTS: ReadonlySet<FleetReloadWorkerStatement> = new Set([
  'recycled',
  'confirmed-clean',
]);

/** The sentences stating what the reply says of the workers beyond its one row. */
function otherWorkerFacts(others: readonly FleetReloadNamedWorker[]): string[] {
  const named = (...statements: readonly FleetReloadWorkerStatement[]): string[] =>
    others.filter((worker) => statements.includes(worker.statement)).map((worker) => worker.name);
  const coveredBelow = named('recycled', 'outcome-open');
  const confirmedClean = named('confirmed-clean');
  const newLives = named('new-life');
  const handedTo = named('roll-handed-off');
  return [
    ...(coveredBelow.length > 0 ? [`The sections below cover ${coveredBelow.join(', ')}.`] : []),
    ...(confirmedClean.length === 1
      ? [`${confirmedClean.join()} confirmed it needs no restart and was left running.`]
      : []),
    ...(confirmedClean.length > 1
      ? [`${confirmedClean.join(', ')} confirmed they need no restart and were left running.`]
      : []),
    ...(newLives.length === 1
      ? [
          `A new life of ${newLives.join()} came up during this reload; the report ties it to no restart and says nothing else about it.`,
        ]
      : []),
    ...(newLives.length > 1
      ? [
          `New lives of ${newLives.join(', ')} came up during this reload; the report ties them to no restart and says nothing else about them.`,
        ]
      : []),
    ...handedTo.map(
      (name) =>
        `${name} takes over the worker restarts after this reply, so this report cannot state their outcome; ${name}'s log holds it.`,
    ),
  ];
}

/** The sentences stating one row and what the reply says of any other workers it names. */
const oneRowFact = (worker: string, others: readonly FleetReloadNamedWorker[]): string =>
  [`This reload's report has a row only for ${worker}.`, ...otherWorkerFacts(others)].join(' ');

/** Whether the reply names a worker beyond its one row whose outcome it leaves open. */
const leavesOutcomeOpen = (reach: FleetReloadReach): boolean =>
  reach.kind === 'one-row' &&
  reach.others.some((worker) => !SETTLED_STATEMENTS.has(worker.statement));

/** The sentence naming the workers a warning covers; a fleet reload adds none. */
function reachFact(reach: FleetReloadReach): string[] {
  switch (reach.kind) {
    case 'fleet':
      return [];
    case 'selected':
      return [
        reach.count === 1
          ? 'This reload targeted the selected worker.'
          : `This reload targeted the ${String(reach.count)} selected workers.`,
      ];
    case 'alone-on-bus':
      return [`This reload reached only this worker; ${ALONE_ON_BUS}.`];
    case 'no-bus':
      return [`This reload reached only this worker; ${NO_BUS}.`];
    case 'one-row':
      return [oneRowFact(reach.worker, reach.others)];
  }
}

/** The warning an unfailed reload still owes the operator, or `null` for none. */
function appliedReloadWarning(
  summary: FleetReloadSummary,
  recycle: RecycleRoll | null,
): string | null {
  const stopped = recycle?.recycle_stopped != null;
  const { restartsPending, reloadsUnconfirmed } = summary;
  if (
    !stopped &&
    summary.awaiting.length === 0 &&
    restartsPending.length === 0 &&
    reloadsUnconfirmed.length === 0 &&
    !leavesOutcomeOpen(summary.reach)
  ) {
    return null;
  }
  const confirmedClean = reloadsUnconfirmed.filter((name) => !restartsPending.includes(name));
  const count = (reading: AwaitingRestartReading): number =>
    summary.awaiting.filter((worker) => worker.reading === reading).length;
  const fact = (reading: AwaitingRestartReading): string[] =>
    count(reading) > 0 ? [AWAITING_FACT[reading](count(reading))] : [];
  return [
    ...(count('withheld') === 0 &&
    count('unstated') === 0 &&
    reloadsUnconfirmed.length === 0 &&
    summary.reach.kind !== 'one-row'
      ? ['The reload was applied.']
      : []),
    ...fact('withheld'),
    ...(stopped ? ['The worker restarts stopped before they finished.'] : []),
    ...fact('restartable'),
    ...fact('unstated'),
    ...(restartsPending.length > 0 ? [pendingRestartFact(restartsPending.length)] : []),
    ...(confirmedClean.length > 0 ? [confirmedCleanFact(confirmedClean.length)] : []),
    ...reachFact(summary.reach),
  ].join(' ');
}

/** The success line, naming the workers the report covers. */
function successLine(reach: FleetReloadReach): string {
  switch (reach.kind) {
    case 'fleet':
      return 'Reload converged across the fleet.';
    case 'selected':
      return reach.count === 1
        ? 'Reload converged on the selected worker.'
        : `Reload converged on the ${String(reach.count)} selected workers.`;
    case 'alone-on-bus':
      return `Reload applied. Only this worker reloaded; ${ALONE_ON_BUS}.`;
    case 'no-bus':
      return `Reload applied. Only this worker reloaded; ${NO_BUS}.`;
    case 'one-row':
      return oneRowFact(reach.worker, reach.others);
  }
}

function AppliedReloadHeadline({
  warning,
  reach,
}: {
  readonly warning: string | null;
  readonly reach: FleetReloadReach;
}): ReactNode {
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
      {successLine(reach)}
    </p>
  );
}

export interface FleetReloadReportProps {
  /** The reply folded by `summarizeFleetReload`. */
  readonly summary: FleetReloadSummary;
  /** The reply's `recycle`: the roll the reload ran. */
  readonly recycle: RecycleRoll | null;
  /** The write the report's panels and roll name as their scope. */
  readonly scope: string;
}

export function FleetReloadReport({ summary, recycle, scope }: FleetReloadReportProps): ReactNode {
  return (
    <div className="tai-stack tai-stack-3">
      {summary.status === 'converged' ? (
        <AppliedReloadHeadline
          warning={appliedReloadWarning(summary, recycle)}
          reach={summary.reach}
        />
      ) : null}
      <FleetOutcomeReport summary={summary} recycle={recycle} action="reload" scope={scope} />
    </div>
  );
}
