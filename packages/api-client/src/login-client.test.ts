/**
 * Transport-level tests for the login-methods client methods: the public
 * `getLoginMethods` union parse (and its loud rejection of an unknown method
 * shape), `submitLoginForm`'s flat POST body + relative-`/api/` path guard + the
 * 401/4xx → `ApiLoginFailedError` mapping (vs 5xx rethrown as `ApiError`),
 * `exchangeSsoCode`'s `{ code }` body, and `getAuthCapabilities`. A fake `fetch`
 * records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient, isSafeApiPath } from './client';
import { ApiError, ApiLoginFailedError, ApiSchemaError, type ApiConfig } from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface Captured {
  url: string;
  method: string;
  body: unknown;
  hasAuthHeader: boolean;
}

function urlString(url: RequestInfo | URL): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

function harness(responder: () => Response, token: string | null = 'k') {
  const captured: Captured[] = [];
  const fetchImpl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    captured.push({
      url: urlString(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      hasAuthHeader: headers.has('x-api-key'),
    });
    return Promise.resolve(responder());
  });
  const config: ApiConfig = { getToken: () => token, fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

describe('isSafeApiPath', () => {
  it('accepts relative /api/ paths and rejects everything else', () => {
    expect(isSafeApiPath('/api/login/password')).toBe(true);
    expect(isSafeApiPath('/api/')).toBe(true);
    expect(isSafeApiPath('/other/x')).toBe(false);
    expect(isSafeApiPath('//evil.test/api/x')).toBe(false);
    expect(isSafeApiPath('https://evil.test/api/x')).toBe(false);
    expect(isSafeApiPath('api/login')).toBe(false);
  });
});

describe('getLoginMethods client transport', () => {
  it('GETs /api/login/methods and parses the form|button union', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          bootstrap: false,
          methods: [
            {
              shape: 'form',
              id: 'password',
              title: 'Sign in',
              fields: [{ name: 'email', label: 'Email', secret: false }],
              submit_path: '/api/login/password',
            },
            { shape: 'button', id: 'oidc', label: 'Continue', href: '/api/login/oidc/start' },
          ],
        },
      }),
    );
    const out = await client.getLoginMethods();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/login/methods');
    expect(out.methods).toHaveLength(2);
    // The `form` method's `purpose` defaults to 'login' when the payload omits it.
    expect(out.methods[0]).toMatchObject({ shape: 'form', purpose: 'login' });
  });

  it('is public: unauthenticated (no token) carries no auth header', async () => {
    const { client, captured } = harness(
      () => jsonResponse({ data: { methods: [], bootstrap: false } }),
      null,
    );
    await client.getLoginMethods();
    expect(captured[0]?.hasAuthHeader).toBe(false);
  });

  it('REJECTS an unknown method shape as an ApiSchemaError (contract drift, not a soft skip)', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { bootstrap: false, methods: [{ shape: 'magic-link', id: 'x' }] } }),
    );
    await expect(client.getLoginMethods()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});

describe('submitLoginForm client transport', () => {
  it('POSTs the field values as a FLAT body and parses the login result', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { token: 'tai-sess-1', user_id: 'u1' } }),
    );
    const out = await client.submitLoginForm('/api/login/password', {
      email: 'a@b.co',
      password: 'pw',
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/login/password');
    expect(captured[0]?.body).toEqual({ email: 'a@b.co', password: 'pw' });
    expect(out).toEqual({ token: 'tai-sess-1', user_id: 'u1' });
  });

  it('maps a transport 401 to a generic ApiLoginFailedError (not an ApiUnauthorizedError)', async () => {
    const { client } = harness(() => jsonResponse({ error: 'nope' }, 401));
    const error = await client
      .submitLoginForm('/api/login/password', { password: 'x' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiLoginFailedError);
    expect((error as ApiLoginFailedError).status).toBe(401);
    expect((error as ApiLoginFailedError).message).toBe('Sign-in failed — check your credentials.');
  });

  it('carries a 429 rate-limit message through as an ApiLoginFailedError', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: 'Too many attempts — try again in 15 minutes' }, 429),
    );
    const error = await client
      .submitLoginForm('/api/login/password', { password: 'x' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiLoginFailedError);
    expect((error as ApiLoginFailedError).message).toBe(
      'Too many attempts — try again in 15 minutes',
    );
  });

  it('rethrows a 500 UNCHANGED (ApiError, the loud generic-failure branch)', async () => {
    const { client } = harness(() => jsonResponse({ error: 'boom' }, 500));
    const error = await client
      .submitLoginForm('/api/login/password', { password: 'x' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ApiLoginFailedError);
    expect((error as ApiError).status).toBe(500);
  });

  it('throws a programming Error (never a login failure) on an off-origin submit_path', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { token: 't', user_id: 'u' } }),
    );
    await expect(client.submitLoginForm('https://evil.test/api/x', {})).rejects.toBeInstanceOf(
      Error,
    );
    await expect(client.submitLoginForm('https://evil.test/api/x', {})).rejects.not.toBeInstanceOf(
      ApiLoginFailedError,
    );
    await expect(client.submitLoginForm('//evil.test/api/x', {})).rejects.toBeInstanceOf(Error);
    // The guard fires before any request leaves the client.
    expect(captured).toHaveLength(0);
  });
});

describe('exchangeSsoCode client transport', () => {
  it('POSTs { code } to the exchange route and parses the token', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { token: 'tai-sess-2', user_id: 'u2' } }),
    );
    const out = await client.exchangeSsoCode('abc');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/login/sso/exchange');
    expect(captured[0]?.body).toEqual({ code: 'abc' });
    expect(out).toEqual({ token: 'tai-sess-2', user_id: 'u2' });
  });

  it('maps an expired/reused code (400) to an ApiLoginFailedError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'code expired' }, 400));
    const error = await client.exchangeSsoCode('stale').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiLoginFailedError);
    expect((error as ApiLoginFailedError).status).toBe(400);
  });
});

describe('getAuthCapabilities client transport', () => {
  it('GETs /api/auth/capabilities and parses { mintable, providers }', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { mintable: false, providers: [{ name: 'oidc', mintable: false }] } }),
    );
    const out = await client.getAuthCapabilities();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/capabilities');
    expect(out).toEqual({ mintable: false, providers: [{ name: 'oidc', mintable: false }] });
  });
});
