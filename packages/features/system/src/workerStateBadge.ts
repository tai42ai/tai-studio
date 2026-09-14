/**
 * The badge a worker row advertises. The SERVER-computed `stale` flag WINS over the
 * written state: a decayed row is quiet (reconnecting or dead) whatever it last wrote,
 * so it reads `stale`, never `ready`. The tone reinforces the label, never replaces it.
 */
import type { FleetWorker, WorkerState } from '@tai42/api-client';

/** The badge tone per written lifecycle state: `ready` (converged) reads positive; the
 * transient `resyncing`/`recycling` restart states read as warnings worth an eye. */
const WORKER_STATE_VARIANT: Record<WorkerState, string> = {
  ready: 'success',
  resyncing: 'warning',
  recycling: 'warning',
};

export function workerStateBadge(worker: FleetWorker): { label: string; variant: string } {
  if (worker.stale) return { label: 'stale', variant: 'warning' };
  return { label: worker.state, variant: WORKER_STATE_VARIANT[worker.state] };
}
