/** Principal (identity) reference, row, listing and delete-result schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

/**
 * A compact reference to a principal — the owner of a key, or the human behind a
 * session — carried inline on payloads that name one.
 */
export const principalRef = openapi.principalRef;
export type PrincipalRef = z.infer<typeof principalRef>;

/**
 * A principal's kind: `human` (logs in interactively) or `service` (holds keys only,
 * never logs in).
 */
export const principalKind = openapi.principal.shape.kind;
export type PrincipalKind = z.infer<typeof principalKind>;

/**
 * A principal row (`/api/auth/principals`). `created_by` is the principal that created
 * this one, or `null` for the owner the setup door mints. `disabled` turns off every
 * credential the principal owns. `created_at` is an ISO-8601 instant.
 */
export const principal = openapi.principal;
export type Principal = z.infer<typeof principal>;

/** The principals listing (`GET /api/auth/principals`). */
export const principalList = openapi.principalListing;
export type PrincipalList = z.infer<typeof principalList>;

/** The delete result (`DELETE /api/auth/principals/{user_id}`). */
export const principalDeleted = openapi.principalDeleted;
export type PrincipalDeleted = z.infer<typeof principalDeleted>;
