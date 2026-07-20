/**
 * TanStack Query key factory for the interactions feature's server state. The
 * live inbox itself is SSE-fed (no query key); the only queried resource is the
 * installed channel-plugin catalog.
 */

/** Key for the installed channel-plugin name list. */
export function channelsKey(): readonly ['channels'] {
  return ['channels'];
}
