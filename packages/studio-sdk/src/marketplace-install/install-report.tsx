/**
 * The fleet side of an install, update or uninstall: the reload fan-out report and,
 * when the reload recycled workers, the roll. The host folds the receipt's
 * `reload.fanout` / `awaiting_respawn` / `span_release_error` into `summary` with
 * `summarizeFleetFanout` and passes `reload.recycle` as `recycle`.
 */
import type { FleetReportSummary, RecycleRoll } from '@tai42/api-client';
import { type CSSProperties, type ReactNode, useId } from 'react';

import { FleetReport } from '../components/fleet-report';
import { RecycleRollSection } from '../components/recycle-roll';

export interface InstallReportProps {
  readonly summary: FleetReportSummary | null;
  readonly recycle: RecycleRoll | null;
}

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-2)',
  fontSize: 'var(--tai-text-md)',
  color: 'var(--tai-color-text)',
};

const sectionIntroStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

export function InstallReport({ summary, recycle }: InstallReportProps): ReactNode {
  const headingId = useId();
  return (
    <div className="tai-stack tai-stack-3">
      <FleetReport summary={summary} />
      {recycle !== null ? (
        <section aria-labelledby={headingId}>
          <h4 id={headingId} style={sectionTitleStyle}>
            Worker recycle
          </h4>
          <p style={sectionIntroStyle}>
            Some changed settings take effect only in a fresh worker process, so the fleet recycled
            its workers one at a time.
          </p>
          <RecycleRollSection
            recycle={recycle.recycle}
            fresh={recycle.fresh}
            stopped={recycle.recycle_stopped}
            writerNote="this worker recycles itself after replying"
          />
        </section>
      ) : null}
    </div>
  );
}
