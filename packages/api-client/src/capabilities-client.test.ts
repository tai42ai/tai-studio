/**
 * Transport-level tests for the capability + delegation client methods:
 * `getMe` (the `/api/auth/me` projection round-trip + loud drift), the mint-flow
 * `createClaimLink`, the public `claimLogin` claim-token exchange (its 404 →
 * inline `ApiLoginFailedError` mapping, and the pin that it shares the exact
 * `loginResult` wire shape), and `logout` (the `{ revoked }` result, and that a
 * successful logout body never throws `ApiSchemaError`). A fake `fetch` records
 * each request and returns a canned `{ data }` envelope.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, ApiLoginFailedError, ApiSchemaError, type ApiConfig } from './index';
import { loginResult, meProjection } from './schemas';

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

const FULL_PROJECTION = {
  user_id: 'admin',
  owner_user_id: null,
  admin: true,
  scopes: ['*'],
  routes: [{ path: '/api/tools', methods: ['GET'] }],
  route_patterns: [{ pattern: '^/app/slug/.*$', scope_id: 'app' }],
  sub_mcp: [{ slug: 'demo', tools: ['echo'], transport: 'sse' }],
  tools: ['echo'],
  agents: ['researcher'],
  mintable: true,
};

describe('getMe client transport', () => {
  it('GETs /api/auth/me and parses the full projection round-trip', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: FULL_PROJECTION }));
    const out = await client.getMe();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/me');
    expect(captured[0]?.hasAuthHeader).toBe(true);
    expect(out).toEqual(FULL_PROJECTION);
  });

  it('parses a scoped projection (admin:false, owner set, jq-exact routes)', async () => {
    const scoped = {
      ...FULL_PROJECTION,
      user_id: 'agent-1',
      owner_user_id: 'editor',
      admin: false,
      scopes: ['tools:read'],
    };
    const { client } = harness(() => jsonResponse({ data: scoped }));
    const out = await client.getMe();
    expect(out.admin).toBe(false);
    expect(out.owner_user_id).toBe('editor');
  });

  it('THROWS ApiSchemaError on projection drift (admin not a boolean)', async () => {
    const { client } = harness(() => jsonResponse({ data: { ...FULL_PROJECTION, admin: 'yes' } }));
    await expect(client.getMe()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('THROWS ApiSchemaError when a required field is missing (no owner_user_id key)', async () => {
    const { owner_user_id: _drop, ...withoutOwner } = FULL_PROJECTION;
    const { client } = harness(() => jsonResponse({ data: withoutOwner }));
    await expect(client.getMe()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});

describe('createClaimLink client transport', () => {
  it('POSTs the api_key and parses { claim_path, token, expires_at }', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          claim_path: '/login#claim=clm-abc',
          token: 'clm-abc',
          expires_at: '2026-07-16T12:00:00+00:00',
        },
      }),
    );
    const out = await client.createClaimLink({ api_key: 'sk-live' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/claim-links');
    expect(captured[0]?.body).toEqual({ api_key: 'sk-live' });
    expect(out).toEqual({
      claim_path: '/login#claim=clm-abc',
      token: 'clm-abc',
      expires_at: '2026-07-16T12:00:00+00:00',
    });
  });

  it('passes an optional ttl_seconds through to the body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { claim_path: '/login#claim=x', token: 'x', expires_at: 'now' } }),
    );
    await client.createClaimLink({ api_key: 'sk-live', ttl_seconds: 300 });
    expect(captured[0]?.body).toEqual({ api_key: 'sk-live', ttl_seconds: 300 });
  });

  it('THROWS ApiSchemaError on drift (expires_at missing)', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { claim_path: '/login#claim=x', token: 'x' } }),
    );
    await expect(client.createClaimLink({ api_key: 'sk-live' })).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });
});

describe('claimLogin client transport', () => {
  it('POSTs { token } to /api/login/claim and parses the login result', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { token: 'tai-sess-9', user_id: 'agent-1' } }),
    );
    const out = await client.claimLogin({ token: 'clm-abc' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/login/claim');
    expect(captured[0]?.body).toEqual({ token: 'clm-abc' });
    expect(out).toEqual({ token: 'tai-sess-9', user_id: 'agent-1' });
  });

  it('maps a burned/unknown claim token (404) to an inline ApiLoginFailedError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'unknown or already used' }, 404));
    const error = await client.claimLogin({ token: 'stale' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiLoginFailedError);
    expect((error as ApiLoginFailedError).status).toBe(404);
    expect((error as ApiLoginFailedError).message).toBe('unknown or already used');
  });

  it('rethrows a 500 UNCHANGED (ApiError, the loud generic branch — not a login failure)', async () => {
    const { client } = harness(() => jsonResponse({ error: 'boom' }, 500));
    const error = await client.claimLogin({ token: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ApiLoginFailedError);
    expect((error as ApiError).status).toBe(500);
  });

  it('THROWS ApiSchemaError on drift (token missing)', async () => {
    const { client } = harness(() => jsonResponse({ data: { user_id: 'u' } }));
    await expect(client.claimLogin({ token: 'x' })).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('shares the exact loginResult wire shape (no divergent claim schema)', () => {
    // The claim exchange returns the SAME shape as a form/SSO login, so both
    // parse from one schema. A body valid for `loginResult` is valid for the
    // claim leg, and vice versa — this pins that they never fork.
    const body = { token: 'tai-sess-9', user_id: 'agent-1' };
    expect(loginResult.safeParse(body).success).toBe(true);
    // A projection body is NOT a login result — guards against a copy-paste swap.
    expect(loginResult.safeParse(FULL_PROJECTION).success).toBe(false);
    expect(meProjection.safeParse(body).success).toBe(false);
  });
});

describe('logout client transport', () => {
  it('POSTs /api/auth/logout and parses { revoked: true }', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { revoked: true } }));
    const out = await client.logout();
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/logout');
    expect(out).toEqual({ revoked: true });
  });

  it('does NOT throw on a successful logout carrying an additive field (non-strict)', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { revoked: true, provider: 'accounts' } }),
    );
    await expect(client.logout()).resolves.toEqual({ revoked: true });
  });

  it('surfaces the expected 404 (no revocable session) as an ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'Not a revocable session' }, 404));
    const error = await client.logout().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });

  it('THROWS ApiSchemaError on drift (revoked not a boolean)', async () => {
    const { client } = harness(() => jsonResponse({ data: { revoked: 'yes' } }));
    await expect(client.logout()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
