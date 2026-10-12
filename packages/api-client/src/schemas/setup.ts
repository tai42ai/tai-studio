/** Setup-door (`POST /api/setup`) request-body and result schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

/**
 * The result of a successful `POST /api/setup`, returned exactly ONCE. `api_key`
 * is the owner key's plaintext (shown once, never retrievable again).
 * `login_attached` is whether an interactive login was attached now;
 * `invite_token` and `login_path` are set only when the attachment was an invite
 * the operator completes later.
 */
export const setupResult = openapi.setupResult;
export type SetupResult = z.infer<typeof setupResult>;

/**
 * The body of `POST /api/setup`. `setup_token` is checked against the
 * deployment's setup token. `owner_user_id`/`key_user_id` are optional — the door
 * mints ids when they are absent. `owner_display_name` is required. `login`
 * attaches the owner's interactive login when a login-attaching accounts provider
 * is configured (a password set now, or a one-time invite completed later); a
 * keys-only setup omits it.
 */
export interface SetupBody {
  readonly setup_token: string;
  readonly owner_display_name: string;
  readonly owner_user_id?: string;
  readonly key_user_id?: string;
  readonly key_description?: string;
  readonly login?:
    | { readonly kind: 'password'; readonly email: string; readonly password: string }
    | { readonly kind: 'invite'; readonly email: string };
}
