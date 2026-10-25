/**
 * TanStack Query keys for the connectors surface. Centralised so the queries
 * and the mutations that invalidate them can never drift apart.
 */
export const PROVIDERS_KEY = ['providers'] as const;
export const CONNECTIONS_KEY = ['connections'] as const;

/** The key for a single connection's detail record. */
export function connectionKey(id: string): readonly ['connection', string] {
  return ['connection', id];
}
