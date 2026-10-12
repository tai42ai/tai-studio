/**
 * Transport-level tests for the connectors client methods: `listProviders`,
 * `listConnections`, `getConnection`, `startConnect`, `disconnect`, `reconnect`,
 * `patchSubServices`, `completeOAuth`, and the provider door (`discoverServer`, `addServer`,
 * `removeProvider`, `setProviderClient`) — URL (+ id encoding), HTTP method,
 * request-body shaping, the `{ data }` envelope unwrap (including the connect-start
 * and oauth-complete discriminated unions), and a LOUD error on a 4xx `{error}`
 * plus an `ApiSchemaError` on a drifting response. A fake `fetch` records each
 * request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { type ApiConfig, ApiError, ApiSchemaError } from '../index';
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

const provider = {
  id: 'github',
  display_name: 'GitHub',
  description: 'Source control',
  icon_url: 'https://example.test/gh.svg',
  kind: 'oauth',
  origin: 'system',
  category: 'dev',
  sub_services: [
    { id: 'repo', display_name: 'Repositories', description: 'Repo access', scopes: ['repo'] },
  ],
  config_fields: [
    { key: 'org', label: 'Organization', target: 'env', required: false, secret: false },
  ],
};

const connection = {
  connection_id: 'conn_1',
  provider_id: 'github',
  alias: 'work',
  kind: 'oauth',
  account_identity: 'octocat',
  enabled_sub_services: ['repo'],
  granted_scopes: ['repo'],
  auth_health_state: 'healthy',
  created_at: '2026-07-11T00:00:00Z',
};

const discovered = {
  url: 'https://mcp.example.com/mcp',
  resource: 'https://mcp.example.com/mcp',
  resource_name: 'Remote files',
  issuer: 'https://login.example.com',
  authorization_servers: ['https://login.example.com'],
  client_issuer: null,
  registration_supported: true,
  automatic_client: true,
  scopes_supported: ['files.read', 'files.write'],
  suggested_id: 'remote_files',
  suggested_display_name: 'Remote files',
  redirect_uri: 'https://studio.example.com/oauth/callback',
};

describe('connectors client transport', () => {
  it('listProviders GETs the providers route and parses the catalog + category groupings', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          providers: [provider],
          categories: [{ id: 'dev', display_name: 'Developer tools', sort_order: 1 }],
        },
      }),
    );
    const out = await client.listProviders();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/connectors/providers');
    expect(out.providers[0]?.sub_services[0]?.id).toBe('repo');
    expect(out.categories[0]).toEqual({
      id: 'dev',
      display_name: 'Developer tools',
      sort_order: 1,
    });
  });

  it('listConnections parses { items, total, unhealthy }', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { items: [connection], total: 1, unhealthy: 0 } }),
    );
    const out = await client.listConnections();
    expect(captured[0]?.url).toBe('/api/connectors/connections');
    expect(out.total).toBe(1);
    expect(out.items[0]?.alias).toBe('work');
    // The list projection is probe-free, so a listed connection defaults to no
    // unreachable sub-services.
    expect(out.items[0]?.unreachable_sub_services).toEqual([]);
    expect(out.unhealthy).toBe(0);
  });

  it('refuses a connections listing without its unhealthy count', async () => {
    const { client } = harness(() => jsonResponse({ data: { items: [connection], total: 1 } }));
    await expect(client.listConnections()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('listConnections carries the unhealthy attention count when the worker sends it', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { items: [connection], total: 3, unhealthy: 2 } }),
    );
    const out = await client.listConnections();
    expect(out.unhealthy).toBe(2);
  });

  it('getConnection GETs the id-encoded route and parses the view (unreachable sub-services default empty)', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: connection }));
    const out = await client.getConnection('conn 1');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/connectors/connections/conn%201');
    expect(out.auth_health_state).toBe('healthy');
    expect(out.unreachable_sub_services).toEqual([]);
  });

  it('getConnection surfaces the probed unreachable sub-services on the single view', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { ...connection, unreachable_sub_services: ['issues'] } }),
    );
    const out = await client.getConnection('conn_1');
    expect(out.unreachable_sub_services).toEqual(['issues']);
  });

  it('startConnect POSTs the args and parses the oauth authorize variant', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { flow_id: 'f1', authorize_url: 'https://example.test/auth' } }),
    );
    const out = await client.startConnect({
      provider_id: 'github',
      alias: 'work',
      enabled_sub_services: ['repo'],
      return_url: '/connectors',
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/connectors/connections/start');
    expect(captured[0]?.body).toEqual({
      provider_id: 'github',
      alias: 'work',
      enabled_sub_services: ['repo'],
      return_url: '/connectors',
    });
    expect('flow_id' in out ? out.flow_id : null).toBe('f1');
  });

  it('startConnect parses the manual (no-oauth) added-manifest variant of the union (with fleet fanout)', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          connection_id: 'conn_2',
          added_manifest_entries: ['github.repo'],
          fanout: {
            mode: 'local-only',
            note: 'no worker bus configured; only this worker reloaded',
          },
        },
      }),
    );
    const out = await client.startConnect({
      provider_id: 'internal',
      alias: 'ci',
      enabled_sub_services: [],
      config_values: { token: 'x' },
    });
    expect('connection_id' in out ? out.connection_id : null).toBe('conn_2');
    expect('fanout' in out ? out.fanout?.mode : null).toBe('local-only');
  });

  it('disconnect DELETEs the id-encoded route and parses the revoke outcome + fleet fanout', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          connection_id: 'conn_1',
          upstream_revoke_outcome: 'success',
          upstream_revoke_status: 200,
          removed_manifest_entries: ['github.repo'],
          fanout: {
            mode: 'local-only',
            note: 'no worker bus configured; only this worker reloaded',
          },
        },
      }),
    );
    const out = await client.disconnect('conn_1');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/connectors/connections/conn_1');
    expect(out.upstream_revoke_outcome).toBe('success');
    expect(out.fanout?.mode).toBe('local-only');
  });

  it('reconnect POSTs { enabled_sub_services, return_url } to the reconnect route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { flow_id: 'f2', authorize_url: 'https://example.test/auth' } }),
    );
    const out = await client.reconnect('conn_1', ['repo'], '/back');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/connectors/connections/conn_1/reconnect');
    expect(captured[0]?.body).toEqual({ enabled_sub_services: ['repo'], return_url: '/back' });
    expect(out.flow_id).toBe('f2');
  });

  it('patchSubServices PATCHes the sub-services route with the new selection', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          connection_id: 'conn_1',
          enabled_sub_services: ['repo', 'issues'],
          consent_required: true,
          flow_id: 'f3',
          authorize_url: 'https://example.test/auth',
          added_manifest_entries: ['github.issues'],
          removed_manifest_entries: [],
          // An inline add is a manifest mutation, so it carries the fan-out of the
          // reload it broadcast even as the remaining toggles fork a consent flow.
          fanout: {
            mode: 'local-only',
            note: 'no worker bus configured; only this worker reloaded',
          },
        },
      }),
    );
    const out = await client.patchSubServices('conn_1', ['repo', 'issues'], '/back');
    expect(captured[0]?.method).toBe('PATCH');
    expect(captured[0]?.url).toBe('/api/connectors/connections/conn_1/sub-services');
    expect(captured[0]?.body).toEqual({
      enabled_sub_services: ['repo', 'issues'],
      return_url: '/back',
    });
    expect(out.consent_required).toBe(true);
    expect(out.fanout?.mode).toBe('local-only');
  });

  it('completeOAuth POSTs { state, code } and parses the success variant of the union (with fleet fanout)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          kind: 'success',
          connection_id: 'conn_1',
          return_url: '/done',
          fanout: {
            mode: 'local-only',
            note: 'no worker bus configured; only this worker reloaded',
          },
        },
      }),
    );
    const out = await client.completeOAuth('st', 'cd');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/connectors/oauth/complete');
    // `error` is omitted, so JSON.stringify drops it — the body carries state + code only.
    expect(captured[0]?.body).toEqual({ state: 'st', code: 'cd' });
    expect(out.kind).toBe('success');
  });

  it("completeOAuth sends the redirect's iss when it has one", async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { kind: 'failed', reason: 'IssuerMismatch' } }),
    );
    await client.completeOAuth('st', 'cd', undefined, 'https://login.example.com');
    expect(captured[0]?.body).toEqual({
      state: 'st',
      code: 'cd',
      iss: 'https://login.example.com',
    });
  });

  it('completeOAuth parses the cancelled variant and carries the error through the body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { kind: 'cancelled', message: 'user cancelled' } }),
    );
    const out = await client.completeOAuth('st', 'cd', 'access_denied');
    expect(captured[0]?.body).toEqual({ state: 'st', code: 'cd', error: 'access_denied' });
    expect(out.kind).toBe('cancelled');
  });

  it('surfaces a 4xx { error } from a failed connect as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: "provider 'ghost' unknown" }, 404));
    await expect(
      client.startConnect({ provider_id: 'ghost', alias: 'x', enabled_sub_services: [] }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting provider row (missing id)', async () => {
    const { id: _dropped, ...broken } = provider;
    const { client } = harness(() =>
      jsonResponse({ data: { providers: [broken], categories: [] } }),
    );
    await expect(client.listProviders()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY when the catalog is served as a bare array (pre-reshape shape)', async () => {
    const { client } = harness(() => jsonResponse({ data: [provider] }));
    await expect(client.listProviders()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('listProviders parses a provider added by address: a null icon, removable, client_source', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          providers: [
            { ...provider, icon_url: null, removable: true, client_source: 'manual' },
            provider,
          ],
          categories: [],
        },
      }),
    );
    const out = await client.listProviders();
    expect(out.providers[0]?.icon_url).toBeNull();
    expect(out.providers[0]?.removable).toBe(true);
    expect(out.providers[0]?.client_source).toBe('manual');
    // A catalog entry that names neither field reads as not removable with no client source.
    expect(out.providers[1]?.removable).toBe(false);
    expect(out.providers[1]?.client_source).toBeNull();
  });

  it('throws ApiSchemaError LOUDLY on an unknown client_source', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: { providers: [{ ...provider, client_source: 'borrowed' }], categories: [] },
      }),
    );
    await expect(client.listProviders()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('a connection carries the scopes a tool asked for, empty when the view names none', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          items: [{ ...connection, scopes_wanted: ['files.write', 'files.read'] }, connection],
          total: 2,
          unhealthy: 0,
        },
      }),
    );
    const out = await client.listConnections();
    expect(out.items[0]?.scopes_wanted).toEqual(['files.write', 'files.read']);
    expect(out.items[1]?.scopes_wanted).toEqual([]);
  });

  it('discoverServer POSTs { url } for an address and parses the look-up', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: discovered }));
    const out = await client.discoverServer({ url: 'https://mcp.example.com/mcp' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/connectors/providers/discover');
    expect(captured[0]?.body).toEqual({ url: 'https://mcp.example.com/mcp' });
    expect(out.automatic_client).toBe(true);
    expect(out.client_issuer).toBeNull();
    expect(out.redirect_uri).toBe('https://studio.example.com/oauth/callback');
  });

  it('discoverServer POSTs { provider_id } for an existing provider', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { ...discovered, client_issuer: 'https://login.example.com', redirect_uri: null },
      }),
    );
    const out = await client.discoverServer({ providerId: 'remote_files' });
    expect(captured[0]?.body).toEqual({ provider_id: 'remote_files' });
    expect(out.client_issuer).toBe('https://login.example.com');
    expect(out.redirect_uri).toBeNull();
  });

  it('addServer POSTs the body to the providers route and parses the new catalog entry + fanout', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          provider: { ...provider, id: 'remote_files', icon_url: null, removable: true },
          fanout: {
            mode: 'local-only',
            note: 'no worker bus configured; only this worker reloaded',
          },
        },
      }),
    );
    const out = await client.addServer({
      url: 'https://mcp.example.com/mcp',
      id: 'remote_files',
      display_name: 'Remote files',
      scopes: ['files.read'],
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/connectors/providers');
    expect(captured[0]?.body).toEqual({
      url: 'https://mcp.example.com/mcp',
      id: 'remote_files',
      display_name: 'Remote files',
      scopes: ['files.read'],
    });
    expect(out.provider.id).toBe('remote_files');
    expect(out.fanout?.mode).toBe('local-only');
  });

  it('removeProvider DELETEs the id-encoded provider route and parses the result', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { provider_id: 'remote files', removed_clients: 1, fanout: null } }),
    );
    const out = await client.removeProvider('remote files');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/connectors/providers/remote%20files');
    expect(out.removed_clients).toBe(1);
    expect(out.fanout).toBeNull();
  });

  it('setProviderClient PUTs the credentials to the provider client route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { provider: { ...provider, client_source: 'manual' }, fanout: null } }),
    );
    const out = await client.setProviderClient('remote_files', {
      client_id: 'app-1',
      client_secret: 'not-a-real-secret',
      issuer: 'https://login.example.com',
    });
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/connectors/providers/remote_files/client');
    expect(captured[0]?.body).toEqual({
      client_id: 'app-1',
      client_secret: 'not-a-real-secret',
      issuer: 'https://login.example.com',
    });
    expect(out.provider.client_source).toBe('manual');
  });

  it('rejects an unsafe provider id before any request', () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() => jsonResponse({ data: {} }));
    expect(() => client.removeProvider('..')).toThrow(rule);
    expect(() => client.setProviderClient('..', { client_id: 'x' })).toThrow(rule);
    expect(captured).toHaveLength(0);
  });

  // A `.`/`..`/absolute/empty connection id would be collapsed by the browser URL
  // parser and silently retarget the request, so the id→path encoder rejects it at
  // the client boundary before any request leaves.
  it('rejects an unsafe connection id before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() => jsonResponse({ data: connection }));
    expect(() => client.getConnection('..')).toThrow(rule);
    expect(() => client.getConnection('.')).toThrow(rule);
    expect(() => client.getConnection('')).toThrow(rule);
    expect(() => client.disconnect('..')).toThrow(rule);
    expect(() => client.reconnect('..', [])).toThrow(rule);
    expect(() => client.patchSubServices('..', [])).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.getConnection('conn 1');
    expect(captured[0]?.url).toBe('/api/connectors/connections/conn%201');
  });
});
