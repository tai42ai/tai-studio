/** Trigger-link record and lifecycle response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

// A trigger link is a minted, token-bearing PUBLIC URL (`GET|POST /trigger/{token}`)
// that resolves to a hook TOPIC and fires it. Studio mints, lists, and revokes them
// on the hooks page; the QR encodes the composed absolute URL.

/**
 * `POST /api/hooks/trigger-links` — a freshly minted trigger link. `trigger_path`
 * is a relative path (`/trigger/<token>`, never an absolute URL — Studio composes
 * the API origin); `token` is the raw token returned exactly ONCE, in this response
 * (nothing else stores or lists it — a listed link's QR is unrecoverable by
 * design). `expires_at` is an ISO-8601 instant, or `null` for a permanent link.
 */
export const triggerLinkCreated = openapi.triggerLinkCreated;
export type TriggerLinkCreated = z.infer<typeof triggerLinkCreated>;

/**
 * One listed trigger-link record (`GET /api/hooks/trigger-links` item). `tool_kwargs`
 * is the per-link params merged last into every fire (`null` or `{}` = none);
 * `created_by` is the ambient creator identity (`null` on an identity-less,
 * gate-off deployment); `token_hash_prefix` is a short hash prefix for log
 * correlation — never a raw token (none is stored); `execution_key_fingerprint` names
 * the key a fire runs as, and `require_api_key` is whether a fire must also carry one.
 */
export const triggerLinkRecord = openapi.triggerLinkView;
export type TriggerLinkRecord = z.infer<typeof triggerLinkRecord>;

/** `GET /api/hooks/trigger-links` — every live trigger-link record. */
export const triggerLinkList = openapi.triggerLinkListView;
export type TriggerLinkList = z.infer<typeof triggerLinkList>;

/** `DELETE /api/hooks/trigger-links/{name}` — the revoked link. */
export const triggerLinkDeleted = openapi.removedByName;
export type TriggerLinkDeleted = z.infer<typeof triggerLinkDeleted>;
