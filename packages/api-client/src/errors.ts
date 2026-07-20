/**
 * Loud error types. Every failure surfaces — a failed request or a schema
 * mismatch throws, so the UI can render a visible error state, never a silent
 * empty render.
 */

/** The skeleton returned `{ "error": "<message>" }` (or a non-2xx status). */
export class ApiError extends Error {
  readonly status: number;
  /** The optional machine-readable `code` from the `{ error, code }` envelope. */
  readonly code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
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
  constructor(message: string) {
    super(message, 409);
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
