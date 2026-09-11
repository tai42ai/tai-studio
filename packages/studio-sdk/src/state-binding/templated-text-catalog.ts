/**
 * Builds the {@link TemplatedTextCatalog} a door form feeds its templated-text
 * fields, from the two queries every such form already runs: the storage-presence
 * signal (`GET /api/storage`) and the stored-template name list (`GET /api/templates`).
 *
 * Storage is dead by default — a deployment with no storage backend is supported —
 * and the template list door cannot answer without one. So the CALLER gates its
 * template-names query on presence (`enabled: storage.data?.present === true`), and
 * this helper maps the two query states onto the catalog the field reads: when
 * storage is absent it exposes no templates and marks the field absent (the field
 * then offers no stored source); when present it exposes the fetched names. A
 * presence-fetch failure surfaces ahead of a template-fetch failure, since presence
 * is the prerequisite.
 *
 * It takes the query RESULTS structurally (the fields it reads), so this module adds
 * no data-layer dependency to the SDK.
 */
import { errorMessage } from '../errors';

import type { TemplatedTextCatalog } from './types';

/** The storage-presence query result (`GET /api/storage`) fields this helper reads. */
export interface StoragePresenceQueryLike {
  readonly data?: { readonly present: boolean };
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly refetch: () => unknown;
}

/** The stored-template-names query result (`GET /api/templates`) fields this helper reads. */
export interface TemplateNamesQueryLike {
  readonly data?: readonly string[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly refetch: () => unknown;
}

export function templatedTextCatalog(
  storage: StoragePresenceQueryLike,
  templates: TemplateNamesQueryLike,
): TemplatedTextCatalog {
  const presenceKnown = storage.data !== undefined;
  const present = storage.data?.present === true;
  // A presence failure matters only until presence is first known: once it is in
  // hand, a later background-refetch failure must not blow away a field already
  // working from it. Presence is the prerequisite of the catalog, so its failure
  // surfaces ahead of a catalog-fetch failure.
  const presenceFailed = storage.isError && !presenceKnown;
  return {
    // Never expose template names while storage is absent or unknown — the caller's
    // gate keeps the list query from firing there, and its pending/stale data must
    // not leak into a picker the field will not show.
    templates: present ? (templates.data ?? []).map((id) => ({ id })) : [],
    loading: present && templates.isPending,
    error: presenceFailed
      ? errorMessage(storage.error)
      : templates.isError
        ? errorMessage(templates.error)
        : undefined,
    onRetry: () => {
      if (presenceFailed) void storage.refetch();
      else void templates.refetch();
    },
    storageAbsent: storage.data?.present === false,
    storagePresenceLoading: !presenceKnown && storage.isPending,
  };
}
