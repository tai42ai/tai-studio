/**
 * The fleet outcome of a config change, the one report every door whose reply can carry a
 * recycle roll mounts: the fleet broadcast's report, then the roll the change ran, when it ran
 * one. The host folds the reply's fleet fields into `summary` with `summarizeFleetFanout` (a
 * reload's with `summarizeFleetReload`) and passes the reply's roll as `recycle`.
 */
import type { FleetReportSummary } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { FleetReport, type FleetReportProps } from './fleet-report';
import { RecycleRollSection, type RecycleRollSectionProps } from './recycle-roll';

export interface FleetOutcomeReportProps {
  readonly summary: FleetReportSummary | null;
  /** The roll the change ran, or `null` when it ran none. */
  readonly recycle: RecycleRollSectionProps['roll'] | null;
  /** Whose framing the broadcast's report takes. */
  readonly action?: FleetReportProps['action'];
  /** The write the report's panels and roll name as their scope. */
  readonly scope: string;
}

export function FleetOutcomeReport({
  summary,
  recycle,
  action,
  scope,
}: FleetOutcomeReportProps): ReactNode {
  if (recycle === null) return <FleetReport summary={summary} action={action} scope={scope} />;
  return (
    <div className="tai-stack tai-stack-3">
      <FleetReport summary={summary} action={action} scope={scope} />
      <RecycleRollSection roll={recycle} scope={scope} />
    </div>
  );
}
