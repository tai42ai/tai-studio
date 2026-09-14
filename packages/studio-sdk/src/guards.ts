/**
 * Shared runtime type guards. Internal to studio-sdk — never re-exported from
 * `index.ts` or any subpath, so it stays off the public plugin surface.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
