/**
 * Transport-level tests for the connectors client methods: `listProviders`,
 * `listConnections`, `getConnection`, `startConnect`, `disconnect`, `reconnect`,
 * `patchSubServices`, `completeOAuth` — URL (+ id encoding), HTTP method,
 * request-body shaping, the `{ data }` envelope unwrap (including the connect-start
 * and oauth-complete discriminated unions), and a LOUD error on a 4xx `{error}`
 * plus an `ApiSchemaError` on a drifting response. A fake `fetch` records each
 * request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, ApiSchemaError, type ApiConfig } from './index';

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

  it('listConnections parses { items, total } and defaults an omitted unhealthy count to undefined', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { items: [connection], total: 1 } }),
    );
    const out = await client.listConnections();
    expect(captured[0]?.url).toBe('/api/connectors/connections');
    expect(out.total).toBe(1);
    expect(out.items[0]?.alias).toBe('work');
    // The list projection is probe-free, so a listed connection defaults to no
    // unreachable sub-services; a pre-reshape worker omits `unhealthy` entirely.
    expect(out.items[0]?.unreachable_sub_services).toEqual([]);
    expect(out.unhealthy).toBeUndefined();
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

  it('throws ApiSchemaError LOUDLY on a null connector icon_url (icon_url is non-nullable)', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { providers: [{ ...provider, icon_url: null }], categories: [] } }),
    );
    await expect(client.listProviders()).rejects.toBeInstanceOf(ApiSchemaError);
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
