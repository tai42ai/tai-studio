/**
 * Read the orphaned open records a declarations-edit reconcile refusal names, from the
 * 422's STRUCTURED body (`{ reconcile: true, orphans: [{subject, kind, id, label}…] }`).
 * The resolve step keys on this data, never on the message prose.
 */
import { ApiError } from '@tai42/api-client';

/** One orphaned open record a reconcile refusal names. */
export interface OrphanRecord {
  readonly subject: string;
  readonly kind: string;
  readonly id: string | null;
  readonly label: string | null;
}

/** The reconcile refusal's orphans, or `null` for any other failure. */
export function reconcileOrphans(error: unknown): OrphanRecord[] | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const body = error.body;
  if (typeof body !== 'object' || body === null) return null;
  const payload = body as { reconcile?: unknown; orphans?: unknown };
  if (payload.reconcile !== true || !Array.isArray(payload.orphans)) return null;
  return payload.orphans.map((raw) => {
    const entry = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    return {
      subject: typeof entry.subject === 'string' ? entry.subject : '',
      kind: typeof entry.kind === 'string' ? entry.kind : '',
      id: typeof entry.id === 'string' ? entry.id : null,
      label: typeof entry.label === 'string' ? entry.label : null,
    };
  });
}
