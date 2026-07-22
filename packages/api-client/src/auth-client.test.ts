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
  it('listAuthRoutes GETs the routes catalog and parses each mapping + its feature-tag join', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          {
            path: '/api/tools',
            methods: ['GET'],
            mapped: 'scope_1',
            tags: ['tools'],
            summary: 'List the registered tools.',
            action: 'read',
          },
          {
            path: '/api/backup/export',
            methods: ['POST'],
            mapped: null,
            tags: ['backup'],
            summary: 'Export a backup.',
            action: 'fenced',
          },
        ],
      }),
    );
    const out = await client.listAuthRoutes();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/routes');
    expect(out[1]?.mapped).toBeNull();
    // The join fields the Roles grant editor derives feature groups + admin-only markers from.
    expect(out[0]?.tags).toEqual(['tools']);
    expect(out[0]?.action).toBe('read');
    expect(out[1]?.action).toBe('fenced');
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

describe('auth roles client transport', () => {
  // A full role body as the roles routes echo it (the base-tier ceiling fields are
  // READ-ONLY here; only `grants` + `description` are editable).
  const editorBody = {
    name: 'editor',
    description: 'read + write on granted feature groups',
    scopes: ['*'],
    condition: '.foo',
    condition_id: null,
    condition_kwargs: null,
    base_tier: 'editor',
    allow_all: false,
    grants: { tools: 'write', config: 'read' },
  };

  it('listRoles GETs the roles route and parses each full role body + grant map', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          editorBody,
          {
            name: 'admin',
            description: 'full access',
            scopes: ['*'],
            condition: null,
            condition_id: null,
            condition_kwargs: null,
            base_tier: null,
            allow_all: true,
            grants: {},
          },
        ],
      }),
    );
    const out = await client.listRoles();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/roles');
    expect(out[0]?.grants).toEqual({ tools: 'write', config: 'read' });
    expect(out[1]?.allow_all).toBe(true);
  });

  it('rejects (loudly) a role whose grant level is outside none/read/write', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: [{ ...editorBody, grants: { tools: 'admin' } }] }),
    );
    await expect(client.listRoles()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('createRole POSTs the create body (name + base tier + grant map)', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: editorBody }));
    const out = await client.createRole({
      name: 'releaser',
      description: 'ships',
      base_tier: 'editor',
      grants: { tools: 'write' },
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/roles');
    expect(captured[0]?.body).toEqual({
      name: 'releaser',
      description: 'ships',
      base_tier: 'editor',
      grants: { tools: 'write' },
    });
    expect(out.name).toBe('editor');
  });

  it('updateRole PUTs the (omit-means-keep) grant map to the name-encoded route', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: editorBody }));
    const out = await client.updateRole('ci runner', { grants: { tools: 'read' } });
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/auth/roles/ci%20runner');
    expect(captured[0]?.body).toEqual({ grants: { tools: 'read' } });
    expect(out.grants).toEqual({ tools: 'write', config: 'read' });
  });

  it('deleteRole DELETEs the name-encoded route and parses the deleted flag', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'releaser', deleted: true } }),
    );
    const out = await client.deleteRole('releaser');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/auth/roles/releaser');
    expect(out.deleted).toBe(true);
  });

  it('surfaces a 409 delete-of-assigned-role as a LOUD ApiError', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: 'role is still assigned to 2 principals' }, 409),
    );
    await expect(client.deleteRole('editor')).rejects.toBeInstanceOf(ApiError);
  });

  it('listRoleVersions GETs the versions route and parses the history + audit', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          versions: [
            {
              version: 2,
              body: editorBody,
              tags: [],
              created_at: '2026-07-21T00:00:00Z',
              is_current: true,
            },
          ],
          audit: [
            {
              version: 2,
              body: { action: 'update', actor: 'admin', before: null, after: editorBody },
              tags: [],
              created_at: '2026-07-21T00:00:00Z',
              is_current: true,
            },
          ],
        },
      }),
    );
    const out = await client.listRoleVersions('editor');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/roles/editor/versions');
    expect(out.versions[0]?.is_current).toBe(true);
    expect(out.audit[0]?.body.action).toBe('update');
  });

  it('rollbackRole POSTs { version } to the rollback route and parses the re-pointed body', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: editorBody }));
    const out = await client.rollbackRole('ci runner', 1);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/roles/ci%20runner/rollback');
    expect(captured[0]?.body).toEqual({ version: 1 });
    expect(out.name).toBe('editor');
  });

  // A `.`/`..`/absolute/empty role name would be collapsed by the browser URL parser
  // and silently retarget the request, so the name→path encoder rejects it first.
  it('rejects an unsafe role name before any request leaves', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() => jsonResponse({ data: editorBody }));
    expect(() => client.updateRole('..', { grants: {} })).toThrow(rule);
    expect(() => client.deleteRole('.')).toThrow(rule);
    expect(() => client.rollbackRole('', 1)).toThrow(rule);
    expect(captured).toHaveLength(0);
  });
});
