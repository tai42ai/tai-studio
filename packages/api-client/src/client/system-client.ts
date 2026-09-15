/** System health and pluggable-kind status sub-client. */
import { apiText } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

export function systemClient(t: Transport) {
  const { config, req } = t;
  return {
    getHealth: (signal?: AbortSignal) => apiText(config, '/health', { signal }),

    // The pluggable-kind status table (`GET /api/system/kinds`) — a JSON `{data}`
    // envelope, one row per kind with its active/default/off state.
    getSystemKinds: (signal?: AbortSignal) =>
      req('/api/system/kinds', s.kindStatusList, { signal }),
  };
}
