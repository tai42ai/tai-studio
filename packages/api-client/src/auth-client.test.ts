/**
 * Transport-level tests for the auth client methods: scopes
 * (`listScopes`, `addUrlToScope`, `removeUrlFromScope`, `removeScope`), the
 * route catalog (`listAuthRoutes`, `listPublicRoutes`, `pinRoutePublic`,
 * `unpinPublicRoute`), and api keys (`listTokensPayload`, `createApiKey`,
 * `editApiKey`, `revokeApiKey`) — URL (+ id encoding), HTTP method, request-body
 * shaping (in particular the full policy-authoring body createApiKey/editApiKey
 * send), the `{ data }` envelope unwrap, and the loud 400 validation failure the
 * policy-authoring flow depends on. A fake `fetch` records each request.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, ApiSchemaError, type ApiConfig, type ApiKeyBody } from './index';

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
}

function urlString(url: RequestInfo | URL): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

function harness(responder: () => Response) {
  const captured: Captured[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: urlString(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return responder();
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

describe('auth scopes client transport', () => {
  it('listScopes GETs the scopes route and parses the url → scope_id map', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { 'https://api.test/a': 'scope_1' } }),
    );
    const out = await client.listScopes();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/scopes');
    expect(out).toEqual({ 'https://api.test/a': 'scope_1' });
  });

  it('addUrlToScope POSTs the body and parses { scope_id, url }', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { scope_id: 'scope_1', url: 'https://api.test/a' } }),
    );
    const out = await client.addUrlToScope({
      scope_id: 'scope_1',
      url: 'https://api.test/a',
      pattern: '.*',
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/scopes');
    expect(captured[0]?.body).toEqual({
      scope_id: 'scope_1',
      url: 'https://api.test/a',
      pattern: '.*',
    });
    expect(out.scope_id).toBe('scope_1');
  });

  it('removeUrlFromScope DELETEs the urls route with the { url } body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { url: 'https://api.test/a' } }),
    );
    const out = await client.removeUrlFromScope({ url: 'https://api.test/a' });
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/auth/scopes/urls');
    expect(captured[0]?.body).toEqual({ url: 'https://api.test/a' });
    expect(out.url).toBe('https://api.test/a');
  });

  it('removeScope DELETEs the id-encoded scope route and parses the deleted-keys count', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { scope_id: 'scope 1', deleted_keys: 2 } }),
    );
    const out = await client.removeScope('scope 1');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/auth/scopes/scope%201');
    expect(out.deleted_keys).toBe(2);
  });

  // A `.`/`..`/absolute/empty scope id would be collapsed by the browser URL parser
  // and silently retarget the request, so the id→path encoder rejects it at the
  // client boundary before any request leaves.
  it('rejects an unsafe scope id before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({ data: { scope_id: 'scope 1', deleted_keys: 0 } }),
    );
    expect(() => client.removeScope('..')).toThrow(rule);
    expect(() => client.removeScope('.')).toThrow(rule);
    expect(() => client.removeScope('')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.removeScope('scope 1');
    expect(captured[0]?.url).toBe('/api/auth/scopes/scope%201');
  });
});

describe('auth route-catalog client transport', () => {
  it('listAuthRoutes GETs the routes catalog and parses each route mapping', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          { path: '/api/tools', methods: ['GET'], mapped: 'scope_1' },
          { path: '/api/health', methods: ['GET'], mapped: null },
        ],
      }),
    );
    const out = await client.listAuthRoutes();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/routes');
    expect(out[1]?.mapped).toBeNull();
  });

  it('listPublicRoutes GETs the public-routes route and parses the pinned url list', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: ['/api/health', '/metrics'] }));
    const out = await client.listPublicRoutes();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/public-routes');
    expect(out).toEqual(['/api/health', '/metrics']);
  });

  it('pinRoutePublic POSTs { url, pattern } to the public-routes route', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { url: '/api/health' } }));
    const out = await client.pinRoutePublic({ url: '/api/health', pattern: '/api/health.*' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/public-routes');
    expect(captured[0]?.body).toEqual({ url: '/api/health', pattern: '/api/health.*' });
    expect(out.url).toBe('/api/health');
  });

  it('unpinPublicRoute DELETEs the public-routes route with the { url } body', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { url: '/api/health' } }));
    const out = await client.unpinPublicRoute('/api/health');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/auth/public-routes');
    expect(captured[0]?.body).toEqual({ url: '/api/health' });
    expect(out.url).toBe('/api/health');
  });

  it('maps an unpin of an absent/scope-mapped url to a LOUD 404 ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'url is not pinned public' }, 404));
    await expect(client.unpinPublicRoute('/api/x')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('auth api-key client transport', () => {
  it('listTokensPayload GETs the tokens route and parses the key rows', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          {
            user_id: 'u1',
            description: 'deploy key',
            scopes: ['deploy'],
            policy_data: { limit: 5 },
            condition: '.context.used < .policy.limit',
          },
        ],
      }),
    );
    const out = await client.listTokensPayload();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/tokens-payload');
    expect(out[0]?.user_id).toBe('u1');
  });

  it('createApiKey POSTs the FULL policy-authoring body and returns the raw key string', async () => {
    const body: ApiKeyBody = {
      user_id: 'u1',
      description: 'deploy key',
      scopes: ['deploy', 'read'],
      policy_data: { limit: 5 },
      condition: '.context.used < .policy.limit',
      condition_id: null,
      condition_kwargs: { tier: 'pro' },
    };
    const { client, captured } = harness(() => jsonResponse({ data: 'sk-abc123' }));
    const out = await client.createApiKey(body);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/api-keys');
    // The whole policy body must reach the wire — the policy-authoring flow is
    // blind to any dropped field.
    expect(captured[0]?.body).toEqual(body);
    expect(out).toBe('sk-abc123');
  });

  it('createApiKey surfaces a 400 policy-validation failure as a LOUD ApiError', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: 'condition failed to compile: unexpected token' }, 400),
    );
    await expect(
      client.createApiKey({
        user_id: 'u1',
        description: 'x',
        scopes: [],
        condition: '.broken (',
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('editApiKey PUTs the full body (minus user_id) to the id-encoded route', async () => {
    const body: Omit<ApiKeyBody, 'user_id'> = {
      description: 'rotated',
      scopes: ['deploy'],
      policy_data: null,
      condition: null,
      condition_id: 'tmpl_1',
      condition_kwargs: { tier: 'free' },
    };
    const { client, captured } = harness(() =>
      jsonResponse({ data: { user_id: 'u 1', updated: true } }),
    );
    const out = await client.editApiKey('u 1', body);
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/auth/api-keys/u%201');
    expect(captured[0]?.body).toEqual(body);
    expect(out.updated).toBe(true);
  });

  it('editApiKey surfaces a 400 policy-validation failure as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'invalid condition template id' }, 400));
    await expect(
      client.editApiKey('u1', { description: 'x', scopes: [], condition_id: 'ghost' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('revokeApiKey DELETEs the id-encoded route and parses the revoked flag', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { user_id: 'u1', revoked: true } }),
    );
    const out = await client.revokeApiKey('u1');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/auth/api-keys/u1');
    expect(out.revoked).toBe(true);
  });

  it('throws ApiSchemaError LOUDLY on a drifting edit result (updated missing)', async () => {
    const { client } = harness(() => jsonResponse({ data: { user_id: 'u1' } }));
    await expect(client.editApiKey('u1', { description: 'x', scopes: [] })).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });

  // A `.`/`..`/absolute/empty user id would be collapsed by the browser URL parser
  // and silently retarget the request, so the id→path encoder rejects it at the
  // client boundary before any request leaves.
  it('rejects an unsafe user id before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({ data: { user_id: 'u 1', updated: true } }),
    );
    expect(() => client.revokeApiKey('..')).toThrow(rule);
    expect(() => client.revokeApiKey('.')).toThrow(rule);
    expect(() => client.revokeApiKey('')).toThrow(rule);
    expect(() => client.editApiKey('..', { description: 'x', scopes: [] })).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.editApiKey('u 1', { description: 'x', scopes: [] });
    expect(captured[0]?.url).toBe('/api/auth/api-keys/u%201');
  });
});
