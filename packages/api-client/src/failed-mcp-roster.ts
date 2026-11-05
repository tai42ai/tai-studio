/**
 * The failed-MCP roster: the servers a `GET /api/mcp-status/failed` broadcast report names as
 * having no bound tools on some worker, read from each worker's own failed list.
 */
import { isMcpStarting } from './mcp-failure';
import type { FleetResult } from './schemas';

/** One MCP server skipped by the viability check — its title, a coarse status, and the
 *  credential-free detail the platform records when present: `category` (`preset_store`
 *  when the preset store could not be read, `auth` for a 401/403, `unreachable` for a
 *  transport error or a start that outran the start budget, `starting` for a start still
 *  in progress — not a failure, read through `isMcpStarting` — and `error` otherwise), the
 *  redacted `message`, and the `http_status` the failure carried (`null` for a pure
 *  transport failure). The three detail fields are absent when the reporting server
 *  omitted them. */
export interface FailedMcpEntry {
  readonly title: string;
  readonly status: string;
  readonly category?: string;
  readonly message?: string;
  readonly http_status?: number | null;
}

/** One worker's failed-list entry as a roster row, or `null` when it is not an object with a
 *  non-empty string title. A missing status reads as `unavailable`; a detail field of the
 *  wrong type is dropped, never coerced. */
function failedMcpEntryOf(entry: unknown): FailedMcpEntry | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  const { title, status, category, message } = record;
  if (typeof title !== 'string' || title === '') return null;
  return {
    title,
    status: typeof status === 'string' ? status : 'unavailable',
    ...(typeof category === 'string' ? { category } : {}),
    ...(typeof message === 'string' ? { message } : {}),
    ...(typeof record.http_status === 'number' || record.http_status === null
      ? { http_status: record.http_status }
      : {}),
  };
}

/**
 * The failed-MCP roster carried by a `GET /api/mcp-status/failed` broadcast report.
 * The query op rides the fleet fan-out primitive, so each worker's own failed list
 * arrives as its per-worker `payload` (opaque on the wire). This unions those lists
 * by title — a server failed on ANY worker is a server the operator must see — and
 * name-sorts the result, tolerating a worker whose payload is absent or malformed
 * (skipped, never a throw: a partial fleet report still yields the roster it can).
 *
 * One record per title carries the whole row, detail fields included: a failure record
 * on any worker wins over a server start still in progress ({@link isMcpStarting}) on
 * another, and otherwise the first-seen record wins.
 */
export function failedMcpsFromReport(result: Omit<FleetResult, 'ok'>): FailedMcpEntry[] {
  const byTitle = new Map<string, FailedMcpEntry>();
  for (const worker of result.results) {
    const payload: unknown = worker.payload;
    if (!Array.isArray(payload)) continue;
    for (const entry of payload) {
      const row = failedMcpEntryOf(entry);
      if (row === null) continue;
      const seen = byTitle.get(row.title);
      if (seen === undefined || (isMcpStarting(seen) && !isMcpStarting(row))) {
        byTitle.set(row.title, row);
      }
    }
  }
  return [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title));
}
