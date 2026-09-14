/** Backend identity and worker-bus fleet sub-client. */
import * as s from '../schemas';
import type { Transport } from './transport';

export function backendClient(t: Transport) {
  const { req } = t;
  return {
    // Backend IDENTITY (`getBackendInfo`, kept on `/api/backend`) is distinct from
    // the FLEET doors, which ride the app's worker bus and need no backend at all.
    // `getBackendInfo` reports `present: false` (a 200 empty state) when no backend
    // plugin is registered. `listFleetWorkers` reads the live bus presence census
    // (every subscribed worker, ASGI + backend-runtime) and never fabricates an empty
    // fleet — a census read that fails surfaces as a loud 500.
    getBackendInfo: (signal?: AbortSignal) => req('/api/backend', s.backendInfo, { signal }),
    listFleetWorkers: (signal?: AbortSignal) =>
      req('/api/fleet/workers', s.fleetWorkers, { signal }),
    // Soft-restart the fleet: `targets` names the workers to reload, or `null` for
    // the whole fleet. The serving worker applies locally then broadcasts; a 200
    // response carries the per-worker fleet report, so workers that did not converge
    // are named, not hidden. A failed local apply instead re-raises as a loud error
    // (the transport throws with the failure message), not a returned report.
    reloadFleetConfig: (targets: string[] | null) =>
      req('/api/fleet/reload-config', s.fleetReloadResult, { method: 'POST', body: { targets } }),
  };
}
