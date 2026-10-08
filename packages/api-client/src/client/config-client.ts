/** Environment-config and reload sub-client. */
import * as s from '../schemas';
import type { Transport } from './transport';

export function configClient(t: Transport) {
  const { req } = t;
  return {
    getEnvConfig: (signal?: AbortSignal) => req('/api/config/env', s.envConfig, { signal }),
    // `env` MERGES into the stored env ('' deletes a key); `secret_keys`, when a list,
    // REPLACES the operator's secret marks (absent or `null` leaves them untouched).
    setEnvConfig: (body: { env: Record<string, string>; secret_keys?: string[] | null }) =>
      req('/api/config/env', s.reloadConfigResult, { method: 'POST', body }),
    getConfigMode: (signal?: AbortSignal) => req('/api/config/mode', s.configMode, { signal }),
    // The LOCAL soft-restart door (distinct from the System page's fleet door
    // `/api/fleet/reload-config`): refresh env from the config manager, reset the
    // settings caches, and re-initialize from the manifest — applied on the serving
    // worker and broadcast to the fleet (all workers, or only `targets`; `null` = all).
    // Admin-`fenced`; the 200 body is the bare per-worker fleet report so an
    // unconverged sibling is visible, never hidden.
    reloadConfig: (targets: string[] | null = null) =>
      req('/api/config/reload', s.fleetReloadResult, { method: 'POST', body: { targets } }),
  };
}
