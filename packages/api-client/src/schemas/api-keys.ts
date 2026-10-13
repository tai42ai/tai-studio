/** API-key payload and mint/edit/revoke response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

/** The per-key payloads (`GET /api/auth/tokens-payload`). The stable per-mint
 * `key_fingerprint` is nested under `policy_data`; the picker reads it there. `principal`
 * is the key's OWNER (`null` for a key whose principal row is absent), `orphaned` is `true`
 * for a key whose owning principal row is gone. */
export const tokensPayload = openapi.tokenPayloadList;
export type TokensPayload = z.infer<typeof tokensPayload>;

// Hand-written: the client narrows the mint reply to the raw key it shows once.
/** Mint reply `{ api_key, key_fingerprint }` narrowed to the raw `sk-…` key,
 *  returned once at creation and never again. */
export const createdApiKey = openapi.apiKeyCreateResult.transform((minted) => minted.api_key);
export const editApiKeyResult = openapi.userUpdateAck;
export const revokeApiKeyResult = openapi.revokeAck;
