/**
 * The HTTP core: a fetch wrapper that attaches the auth header, unwraps the
 * skeleton's `{ "data" }` / `{ "error" }` envelope, and validates the payload
 * against a per-endpoint zod schema. Every failure throws.
 *
 * Same-origin by default: the skeleton serves the built SPA, so requests use
 * relative `/api/...` URLs. `VITE_API_BASE_URL` can override for cross-origin
 * deployments (documented as requiring CORS on the skeleton).
 */
import type { z } from 'zod';

import { ApiConflictError, ApiError, ApiSchemaError, ApiUnauthorizedError } from './errors';

/** Supplies the current API key (in-memory or sessionStorage-backed) + base URL. */
export interface ApiConfig {
  /** Absolute base (e.g. `https://host`) or '' for same-origin relative `/api`. */
  readonly baseUrl?: string;
  /** Returns the pre-provisioned API key, or null when unauthenticated. */
  getToken: () => string | null;
  /** Optional fetch impl (tests inject one; defaults to global fetch). */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
  // An array value is sent as REPEATED params, one occurrence per element (e.g.
  // `tags=a&tags=b`); a scalar is sent once. `undefined` values are dropped.
  readonly query?: Record<string, string | number | string[] | undefined>;
  readonly signal?: AbortSignal;
}

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

/**
 * Whether a value can never be faithfully transmitted as a single URL path
 * segment. The browser's WHATWG URL parser removes dot-segments (`.`, `..`) from a
 * relative request path before it is sent — even percent-encoded — and reads an
 * empty or absolute (`/`-prefixed) value as a path boundary, so any of these would
 * silently retarget the request at an unrelated same-origin route. The path
 * encoders reject such a segment loudly at the client boundary instead of letting
 * it leave; the server enforces the same relative-path rule.
 */
export function isUnsafePathSegment(segment: string): boolean {
  return segment === '' || segment === '.' || segment === '..' || segment.startsWith('/');
}

/**
 * Encode a single id (string or number) as ONE URL path segment.
 * `encodeURIComponent` already percent-encodes any interior `/`, so the value is
 * guaranteed to stay a single segment (spaces, `#`, `?`, … all escape). An empty,
 * `.`, `..`, or absolute id is REJECTED loudly rather than encoded (see
 * `isUnsafePathSegment`): the browser would collapse it and retarget the request
 * at a different route. A number stringifies to digits and is always safe.
 */
export function encodeSegment(value: string | number): string {
  const segment = String(value);
  if (isUnsafePathSegment(segment)) {
    throw new Error(
      `URL path segment must not be empty, '.', '..', or absolute; received ${JSON.stringify(segment)}`,
    );
  }
  return encodeURIComponent(segment);
}

function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const url = `${base}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const element of value) params.append(key, element);
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Send a request and validate the unwrapped `data` against `schema`. The auth
 * header is `X-Api-Key` (the skeleton's access-control middleware also accepts
 * `Authorization: Bearer`; we use the dedicated key header).
 */
export async function apiRequest<S extends z.ZodType>(
  config: ApiConfig,
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.infer<S>> {
  const doFetch = config.fetch ?? globalThis.fetch;
  const token = config.getToken();
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (token) headers['x-api-key'] = token;

  const response = await doFetch(buildUrl(config.baseUrl ?? '', path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 401) throw new ApiUnauthorizedError();

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new ApiSchemaError(path, 'response was not valid JSON');
    throw new ApiError(response.statusText || 'request failed', response.status);
  }

  if (!response.ok) {
    const { message, code } = extractError(payload);
    const text = message ?? (response.statusText || 'request failed');
    if (response.status === 409) throw new ApiConflictError(text);
    throw new ApiError(text, response.status, code);
  }

  if (!isDataEnvelope(payload)) {
    throw new ApiSchemaError(path, 'response was not a { data } envelope');
  }

  const parsed = schema.safeParse(payload.data);
  if (!parsed.success) throw new ApiSchemaError(path, parsed.error.issues);
  return parsed.data;
}

/**
 * Fetch a plain-text endpoint (the skeleton's `/health` → `"OK"`). No `{ data }`
 * envelope, no zod — the body is returned verbatim. Non-2xx still throws loudly.
 */
export async function apiText(
  config: ApiConfig,
  path: string,
  options: RequestOptions = {},
): Promise<string> {
  const doFetch = config.fetch ?? globalThis.fetch;
  const token = config.getToken();
  const headers: Record<string, string> = {};
  if (token) headers['x-api-key'] = token;

  const response = await doFetch(buildUrl(config.baseUrl ?? '', path, options.query), {
    method: options.method ?? 'GET',
    headers,
    signal: options.signal,
  });

  if (response.status === 401) throw new ApiUnauthorizedError();
  if (!response.ok) throw new ApiError(response.statusText || 'request failed', response.status);
  return response.text();
}

/**
 * Fetch a raw file download (the skeleton's backup export and observability
 * exports stream a document, NOT a `{ data }` envelope). Attaches the auth
 * header, serializes a JSON body when one is given (POST exports), and returns
 * the response as a `Blob`. Non-2xx throws loudly — no silent empty download.
 */
export async function apiDownload(
  config: ApiConfig,
  path: string,
  options: RequestOptions = {},
): Promise<Blob> {
  const doFetch = config.fetch ?? globalThis.fetch;
  const token = config.getToken();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) Object.assign(headers, JSON_HEADERS);
  if (token) headers['x-api-key'] = token;

  const response = await doFetch(buildUrl(config.baseUrl ?? '', path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 401) throw new ApiUnauthorizedError();
  if (!response.ok) throw new ApiError(response.statusText || 'download failed', response.status);
  return response.blob();
}

function isDataEnvelope(value: unknown): value is { data: unknown } {
  return typeof value === 'object' && value !== null && 'data' in value;
}

/** Pull the `error` message and optional machine `code` from the failure envelope. */
export function extractError(value: unknown): { message: string | null; code: string | undefined } {
  if (typeof value === 'object' && value !== null) {
    const message = 'error' in value && typeof value.error === 'string' ? value.error : null;
    const code = 'code' in value && typeof value.code === 'string' ? value.code : undefined;
    return { message, code };
  }
  return { message: null, code: undefined };
}
