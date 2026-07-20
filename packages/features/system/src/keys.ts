/**
 * TanStack Query keys for the system surface. Centralising the keys keeps the
 * query definitions and any later invalidations referring to the exact same
 * tuples.
 */

/** Key for the skeleton's liveness body (`GET /health`). */
export const healthKey = ['health'] as const;

/** Key for the process metrics snapshot (`GET /metrics`). */
export const metricsKey = ['metrics'] as const;

/** Key for the execution-backend identity (`GET /api/backend`). */
export const backendInfoKey = ['backend', 'info'] as const;

/** Key for the live worker fleet census (`GET /api/fleet/workers`). */
export const fleetWorkersKey = ['fleet', 'workers'] as const;

/** Key for the pluggable-kind status table (`GET /api/system/kinds`). */
export const systemKindsKey = ['system', 'kinds'] as const;
