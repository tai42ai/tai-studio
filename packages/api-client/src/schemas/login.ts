/** Public login-method aggregator and login-result schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

/**
 * One field of a `form` login method. `secret` fields render as password
 * inputs; `autocomplete` passes through to the input (e.g. "email",
 * "current-password", "new-password").
 */
export const loginFormField = openapi.formField;

/**
 * The two — and only two — login-method shapes. Discriminated on `shape`; an
 * unknown shape fails validation loudly (contract drift, not a soft skip).
 */
export const loginMethod = openapi.loginMethodsListing.shape.methods.element;

/**
 * `GET /api/login/methods` (PUBLIC). `needs_setup: true` ⇒ no principal exists
 * yet, so the deployment must be initialized through the setup door before anyone
 * can sign in. `setup_login` names the login-credential kinds the setup door can
 * attach the owner's login with; it is `null` when no login-attaching accounts
 * provider is configured (a keys-only deployment). `claim_fragment_key` names the
 * URL-fragment key a claim link carries its token under.
 */
export const loginMethods = openapi.loginMethodsListing;

/**
 * A successful login/exchange: the minted session token (opaque, `tai-sess-`
 * prefixed — the client treats it as an opaque string) + its user.
 */
export const loginResult = openapi.claimExchangeResult;

export type LoginFormField = z.infer<typeof loginFormField>;
export type LoginMethod = z.infer<typeof loginMethod>;
export type LoginMethods = z.infer<typeof loginMethods>;
export type LoginResult = z.infer<typeof loginResult>;
