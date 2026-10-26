/**
 * Loud error types. Every failure surfaces — a failed request or a schema
 * mismatch throws, so the UI can render a visible error state, never a silent
 * empty render.
 */

import { z } from 'zod';

import { type ReferenceHolder, referenceHolder } from './schemas/presets';

/** The skeleton returned `{ "error": "<message>" }` (or a non-2xx status). */
export class ApiError extends Error {
  readonly status: number;
  /** The optional machine-readable `code` from the `{ error, code }` envelope. */
  readonly code: string | undefined;
  /**
   * The response's `Retry-After` delay in seconds, when it carried one (the
   * retriable reloading `503` does). A caller that retries waits this long; a
   * caller that does not ignores it.
   */
  readonly retryAfterSeconds?: number;
  /**
   * The full parsed error body (`{ error, code, …extra }`), when the failure carried a
   * JSON body. Operations spread structured follow-up data beside the message (e.g. a
   * reconcile refusal's `{ reconcile: true, orphans: [...] }`), so a UI keys its
   * follow-up on this DATA, not on the prose. `undefined` when the body was not JSON.
   */
  readonly body?: unknown;
  constructor(
    message: string,
    status: number,
    code?: string,
    retryAfterSeconds?: number,
    body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.body = body;
  }
}

/** A 401 from any data route. The shell routes this back to `/login`. */
export class ApiUnauthorizedError extends ApiError {
  constructor(message = 'unauthorized') {
    super(message, 401);
    this.name = 'ApiUnauthorizedError';
  }
}

/** A duplicate answer / alias collision etc. (HTTP 409). */
export class ApiConflictError extends ApiError {
  constructor(message: string, body?: unknown) {
    super(message, 409, undefined, undefined, body);
    this.name = 'ApiConflictError';
  }
}

/**
 * A login attempt was REJECTED (bad credentials, expired invite/SSO code,
 * rate-limited). Deliberately NOT an ApiUnauthorizedError: that type means "your
 * stored session credential is dead" and routes to /login globally (the
 * create-studio wiring); this one means "the credentials you just typed on the
 * login page were refused" and renders inline, on the page the user is already
 * on.
 */
export class ApiLoginFailedError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiLoginFailedError';
    this.status = status;
  }
}

/**
 * A setup attempt was REJECTED — a bad or throttled token (403/429), an
 * already-initialized deployment (409), an unsupported setup door (501), or an
 * invalid body (400/422). Like {@link ApiLoginFailedError} it is NOT an
 * ApiUnauthorizedError: it renders inline on the setup entry, keyed on `status`
 * so the page shows the right copy, never a global unauthorized redirect.
 */
export class ApiSetupFailedError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiSetupFailedError';
    this.status = status;
  }
}

/**
 * The response body did not match its declared zod schema. This is a contract
 * drift between the Studio and the skeleton — a loud, visible error, never a
 * silently-coerced value.
 */
export class ApiSchemaError extends Error {
  readonly endpoint: string;
  readonly issues: unknown;
  constructor(endpoint: string, issues: unknown) {
    super(`response from ${endpoint} did not match its expected schema`);
    this.name = 'ApiSchemaError';
    this.endpoint = endpoint;
    this.issues = issues;
  }
}

/**
 * The holders a refused rename or delete names: an `ApiError` whose body carries a
 * `holders` list answers it, parsed (a malformed list throws). Any other error, or a
 * body without `holders`, answers `null`.
 */
export const holdersFromError = (error: unknown): ReferenceHolder[] | null => {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  if (typeof body !== 'object' || body === null || !('holders' in body)) return null;
  return z.array(referenceHolder).parse(body.holders);
};

const STORED_PRESET_UNREADABLE = 'stored-preset-unreadable';

/**
 * The stored preset a read could not walk: an `ApiError` with code
 * `stored-preset-unreadable` answers the row's name from `body.preset`. That code without a
 * non-empty string `preset` throws; any other error answers `null`.
 */
export const storedPresetFaultFromError = (error: unknown): string | null => {
  if (!(error instanceof ApiError) || error.code !== STORED_PRESET_UNREADABLE) return null;
  const body = error.body;
  const preset =
    typeof body === 'object' && body !== null && 'preset' in body ? body.preset : undefined;
  if (typeof preset !== 'string' || preset === '') {
    throw new Error(`a '${STORED_PRESET_UNREADABLE}' error carried no stored preset name`);
  }
  return preset;
};
