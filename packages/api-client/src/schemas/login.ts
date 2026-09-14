/** Public login-method aggregator and login-result schemas. */
import { z } from 'zod';

/**
 * One field of a `form` login method. `secret` fields render as password
 * inputs; `autocomplete` passes through to the input (e.g. "email",
 * "current-password", "new-password").
 */
export const loginFormField = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  secret: z.boolean(),
  autocomplete: z.string().optional(),
});

/**
 * The two — and only two — login-method shapes. Discriminated on `shape`; an
 * unknown shape fails validation loudly (contract drift, not a soft skip).
 * Optional fields are `.optional()` (absent), never `.nullable()`: the server
 * serializes with `exclude_none`, so an absent field is OMITTED, never `null`.
 */
export const loginMethod = z.discriminatedUnion('shape', [
  z.object({
    shape: z.literal('form'),
    id: z.string().min(1),
    title: z.string().min(1),
    purpose: z.enum(['login', 'bootstrap', 'invite']).default('login'),
    fields: z.array(loginFormField).min(1),
    submit_path: z.string().min(1),
  }),
  z.object({
    shape: z.literal('button'),
    id: z.string().min(1),
    label: z.string().min(1),
    icon: z.string().optional(),
    href: z.string().min(1),
  }),
]);

/**
 * `GET /api/login/methods` (PUBLIC). `bootstrap: true` ⇒ the deployment has zero
 * accounts and `methods` contains the owner-creation form. Non-strict — the
 * skeleton may grow additive fields.
 */
export const loginMethods = z.object({
  methods: z.array(loginMethod),
  bootstrap: z.boolean(),
});

/**
 * A successful login/exchange: the minted session token (opaque, `tai-sess-`
 * prefixed — the client treats it as an opaque string) + its user.
 */
export const loginResult = z.object({
  token: z.string().min(1),
  user_id: z.string().min(1),
});

export type LoginFormField = z.infer<typeof loginFormField>;
export type LoginMethod = z.infer<typeof loginMethod>;
export type LoginMethods = z.infer<typeof loginMethods>;
export type LoginResult = z.infer<typeof loginResult>;
