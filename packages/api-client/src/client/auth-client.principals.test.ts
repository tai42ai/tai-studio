/**
 * Transport-level tests for the auth-client surfaces that carry principal
 * identity: the principals catalog + CRUD (`listPrincipals`,
 * `createPrincipal`, `updatePrincipal`, `deletePrincipal`) and the principal
 * fields on api-key rows and mints — the `principal`/`orphaned` join a key row
 * reports and the `owner_user_id` an admin mint sends. A fake `fetch` records
 * each request.
 */
import { describe, expect, it, vi } from 'vitest';

import { type ApiConfig, ApiError, type ApiKeyBody, ApiSchemaError } from '../index';
import { createApiClient } from './index';

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

describe('auth api-key principal-owner transport', () => {
  it('parses a key row carrying its owner principal and the orphaned flag', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: [
          {
            user_id: 'u1',
            description: 'deploy key',
            scopes: ['deploy'],
            policy_data: {},
            principal: { user_id: 'svc-ci', kind: 'service', display_name: 'CI' },
            orphaned: false,
          },
          {
            user_id: 'u2',
            description: 'orphaned key',
            scopes: [],
            policy_data: {},
            principal: null,
            orphaned: true,
          },
        ],
      }),
    );
    const out = await client.listTokensPayload();
    expect(out[0]?.principal).toEqual({ user_id: 'svc-ci', kind: 'service', display_name: 'CI' });
    expect(out[0]?.orphaned).toBe(false);
    expect(out[1]?.principal).toBeNull();
    expect(out[1]?.orphaned).toBe(true);
  });

  it('createApiKey carries owner_user_id when an admin mints for another principal', async () => {
    const body: ApiKeyBody = {
      user_id: 'k1',
      description: 'service key',
      scopes: ['deploy'],
      owner_user_id: 'svc-ci',
    };
    const { client, captured } = harness(() =>
      jsonResponse({ data: { api_key: 'sk-1', key_fingerprint: 'kf-1' } }),
    );
    await client.createApiKey(body);
    expect(captured[0]?.body).toEqual(body);
    expect((captured[0]?.body as ApiKeyBody).owner_user_id).toBe('svc-ci');
  });

  it('createApiKey omits owner_user_id when the caller mints its own key', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { api_key: 'sk-2', key_fingerprint: 'kf-2' } }),
    );
    await client.createApiKey({ user_id: 'k2', description: 'self key', scopes: [] });
    expect(captured[0]?.body).not.toHaveProperty('owner_user_id');
  });
});

describe('auth principals client transport', () => {
  const owner = {
    user_id: 'usr-owner',
    kind: 'human',
    display_name: 'Owner',
    created_by: null,
    disabled: false,
    created_at: '2026-07-21T00:00:00Z',
  };
  const service = {
    user_id: 'svc-ci',
    kind: 'service',
    display_name: 'CI',
    created_by: 'usr-owner',
    disabled: false,
    created_at: '2026-07-22T00:00:00Z',
  };

  it('listPrincipals GETs the principals route and parses each row', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: [owner, service] }));
    const out = await client.listPrincipals();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/principals');
    expect(out[0]?.created_by).toBeNull();
    expect(out[1]?.kind).toBe('service');
  });

  it('throws ApiSchemaError LOUDLY on a principal row with an unknown kind', async () => {
    const { client } = harness(() => jsonResponse({ data: [{ ...service, kind: 'robot' }] }));
    await expect(client.listPrincipals()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('createPrincipal POSTs { user_id?, kind, display_name, role } and parses the created principal', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: service }));
    const out = await client.createPrincipal({
      kind: 'service',
      display_name: 'CI',
      role: 'editor',
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/principals');
    expect(captured[0]?.body).toEqual({ kind: 'service', display_name: 'CI', role: 'editor' });
    expect(out.user_id).toBe('svc-ci');
  });

  it('createPrincipal surfaces a 409 duplicate id as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'principal already exists' }, 409));
    await expect(
      client.createPrincipal({
        kind: 'service',
        display_name: 'CI',
        role: 'editor',
        user_id: 'svc-ci',
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('updatePrincipal PUTs the (omit-means-keep) disabled flag to the id-encoded route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ...service, disabled: true } }),
    );
    const out = await client.updatePrincipal('svc ci', { disabled: true });
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/auth/principals/svc%20ci');
    expect(captured[0]?.body).toEqual({ disabled: true });
    expect(out.disabled).toBe(true);
  });

  it('deletePrincipal DELETEs the id-encoded route and parses the deleted flag', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { user_id: 'svc-ci', deleted: true } }),
    );
    const out = await client.deletePrincipal('svc-ci');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/auth/principals/svc-ci');
    expect(out.deleted).toBe(true);
  });

  // A `.`/`..`/absolute/empty user id would be collapsed by the browser URL parser
  // and silently retarget the request, so the id→path encoder rejects it first.
  it('rejects an unsafe principal id before any request leaves', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() => jsonResponse({ data: service }));
    expect(() => client.updatePrincipal('..', { disabled: true })).toThrow(rule);
    expect(() => client.deletePrincipal('.')).toThrow(rule);
    expect(() => client.deletePrincipal('')).toThrow(rule);
    expect(captured).toHaveLength(0);
  });
});
