/**
 * Transport-level tests for the manifest / MCP client methods: `getManifest`,
 * `setMcpConfig`, `getMcpStatus`, `reloadMcp`, `getMcpConfigSchema`,
 * `getSettingsSchema` — URL (+ title encoding), HTTP method, request-body shaping,
 * the `{ data }` envelope unwrap, and a LOUD error on a 4xx `{error}` plus an
 * `ApiSchemaError` on a drifting response. A fake `fetch` records each request.
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

const settingsSchemaData = {
  groups: [
    {
      name: 'General',
      module: 'app.settings',
      qualname: 'GeneralSettings',
      fields: [
        {
          name: 'title',
          env_var: 'APP_TITLE',
          type: 'str',
          default: 'Studio',
          required: false,
          secret: false,
          description: 'The app title',
          nested_group: null,
          default_namespace_var: null,
          value: 'Studio',
        },
      ],
    },
  ],
};

describe('manifest / mcp client transport', () => {
  it('getManifest GETs /api/manifest and parses the mcp + user_tools view', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { mcp: [{ name: 'files' }], user_tools: ['echo'] } }),
    );
    const out = await client.getManifest();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/manifest');
    expect(out.mcp).toEqual([{ name: 'files' }]);
    expect(out.user_tools).toEqual(['echo']);
  });

  it('getManifest exposes the typed managed provenance and passes the rest of each entry through', async () => {
    const managed = {
      title: 'github-repo',
      config: { transport: 'stdio', command: 'run' },
      managed: { connection_id: 'c1', provider_id: 'github', sub_service: 'repo' },
    };
    const { client } = harness(() =>
      jsonResponse({
        data: { mcp: [managed, { title: 'hand', config: {} }], user_tools: [] },
      }),
    );
    const out = await client.getManifest();
    // The connector-owned entry surfaces `managed` typed, for the read-only guard.
    expect(out.mcp[0]?.managed).toEqual({
      connection_id: 'c1',
      provider_id: 'github',
      sub_service: 'repo',
    });
    // A hand-authored entry carries no provenance marker.
    expect(out.mcp[1]?.managed).toBeUndefined();
    // Every other field rides through unmodeled so the editor edits the whole entry.
    expect(out.mcp[0]?.config).toEqual({ transport: 'stdio', command: 'run' });
    expect(out.mcp[0]?.title).toBe('github-repo');
  });

  it('throws ApiSchemaError LOUDLY on a malformed managed marker (missing connection_id)', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          mcp: [{ title: 't', managed: { provider_id: 'github', sub_service: 'repo' } }],
          user_tools: [],
        },
      }),
    );
    await expect(client.getManifest()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('setMcpConfig POSTs { mcp } and parses the apply result (reload + fanout)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          status: 'ok',
          env_keys: 3,
          fanout: {
            mode: 'local-only',
            note: 'no worker bus configured; only this worker reloaded',
          },
        },
      }),
    );
    const out = await client.setMcpConfig([{ name: 'files' }]);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/mcp-config');
    expect(captured[0]?.body).toEqual({ mcp: [{ name: 'files' }] });
    expect(out.status).toBe('ok');
    expect(out.fanout.mode).toBe('local-only');
  });

  it('getMcpStatus GETs /api/mcp-status and parses the bound + failed maps', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { bound: { files: ['read', 'write'] }, failed: [{ title: 'db', status: 'error' }] },
      }),
    );
    const out = await client.getMcpStatus();
    expect(captured[0]?.url).toBe('/api/mcp-status');
    expect(out.bound.files).toEqual(['read', 'write']);
    expect(out.failed[0]).toEqual({ title: 'db', status: 'error' });
  });

  it('reloadMcp POSTs to the title-encoded reload route and parses the fleet report', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          op: 'reload_mcp',
          reachable: true,
          local_only: false,
          results: [
            {
              name: 'serve-a',
              outcome: 'applied',
              payload: { title: 'my server', status: 'ok' },
              error: null,
              detail: null,
            },
          ],
          error: null,
        },
      }),
    );
    const out = await client.reloadMcp('my server');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/mcp-status/my%20server/reload');
    expect(out.op).toBe('reload_mcp');
    expect(out.results[0]?.outcome).toBe('applied');
  });

  it('getMcpConfigSchema GETs the schema route and parses the JSON Schema record', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { type: 'object', properties: {} } }),
    );
    const out = await client.getMcpConfigSchema();
    expect(captured[0]?.url).toBe('/api/mcp-config/schema');
    expect(out).toEqual({ type: 'object', properties: {} });
  });

  it('getSettingsSchema GETs the settings-schema route and parses the group/field tree', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: settingsSchemaData }));
    const out = await client.getSettingsSchema();
    expect(captured[0]?.url).toBe('/api/config/settings-schema');
    expect(out.groups[0]?.fields[0]?.env_var).toBe('APP_TITLE');
  });

  it('getMcpEnvRefs GETs /api/manifest/mcp-env-refs and parses the names-only rows', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          {
            var: 'DATABASE_URL',
            pointer: '/mcp/0/config/env/DATABASE_URL',
            has_default: false,
            set: false,
          },
          // The wire row carries a stray `value` — the names-only door must STRIP it,
          // never surface a real env value on this read.
          {
            var: 'PORT',
            pointer: '/mcp/0/config/env/PORT',
            has_default: true,
            set: true,
            value: 'super-secret-value',
          },
        ],
      }),
    );
    const out = await client.getMcpEnvRefs();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/manifest/mcp-env-refs');
    expect(out[0]?.var).toBe('DATABASE_URL');
    expect(out[0]?.set).toBe(false);
    expect(out[1]?.has_default).toBe(true);
    // Names + booleans ONLY: the stray value is gone from the parsed row.
    expect(out[1]).not.toHaveProperty('value');
  });

  it('throws ApiSchemaError LOUDLY on a drifting env-ref row (missing set)', async () => {
    // `set` is the resolution truth the install-time dangling refusal + checklist
    // read; a row that dropped it is drift, never a silently-defaulted false.
    const { client } = harness(() =>
      jsonResponse({
        data: [
          { var: 'DATABASE_URL', pointer: '/mcp/0/config/env/DATABASE_URL', has_default: false },
        ],
      }),
    );
    await expect(client.getMcpEnvRefs()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('surfaces a 4xx { error } from a bad mcp-config as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'invalid mcp entry' }, 400));
    await expect(client.setMcpConfig([{}])).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting settings schema (field missing env_var)', async () => {
    const broken = {
      groups: [
        {
          name: 'General',
          module: 'app.settings',
          qualname: 'GeneralSettings',
          fields: [{ name: 'title', type: 'str' }],
        },
      ],
    };
    const { client } = harness(() => jsonResponse({ data: broken }));
    await expect(client.getSettingsSchema()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  // A `.`/`..`/absolute/empty MCP title would be collapsed by the browser URL
  // parser and silently retarget the request, so the id→path encoder rejects it at
  // the client boundary before any request leaves.
  it('rejects an unsafe mcp title before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          op: 'reload_mcp',
          reachable: true,
          local_only: false,
          results: [],
          error: null,
        },
      }),
    );
    expect(() => client.reloadMcp('..')).toThrow(rule);
    expect(() => client.reloadMcp('.')).toThrow(rule);
    expect(() => client.reloadMcp('')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.reloadMcp('my server');
    expect(captured[0]?.url).toBe('/api/mcp-status/my%20server/reload');
  });

  const applyResult = {
    status: 'ok',
    env_keys: 0,
    fanout: { mode: 'local-only', note: 'only this worker reloaded' },
  };

  const fleet = (op: string, results: unknown[] = []) => ({
    op,
    reachable: true,
    local_only: false,
    results,
    error: null,
  });

  it('addToolsEntries POSTs { entries, replace } to the tools-config entries door', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: applyResult }));
    const out = await client.addToolsEntries([{ title: 't1', module: 'mod' }]);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/tools-config/entries');
    // `replace` defaults to false when the caller omits it.
    expect(captured[0]?.body).toEqual({
      entries: [{ title: 't1', module: 'mod' }],
      replace: false,
    });
    expect(out.status).toBe('ok');
  });

  it('addToolsEntries carries replace=true when asked', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: applyResult }));
    await client.addToolsEntries([{ title: 't1', module: 'mod' }], true);
    expect(captured[0]?.body).toEqual({ entries: [{ title: 't1', module: 'mod' }], replace: true });
  });

  it('removeToolsEntry DELETEs the title-encoded tools-config entry route', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: applyResult }));
    await client.removeToolsEntry('my tool');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/tools-config/entries/my%20tool');
    expect(captured[0]?.body).toBeUndefined();
  });

  it('addAgentsEntries POSTs to the agents-config entries door', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: applyResult }));
    await client.addAgentsEntries([{ title: 'a1', module: 'mod' }]);
    expect(captured[0]?.url).toBe('/api/agents-config/entries');
    expect(captured[0]?.body).toEqual({
      entries: [{ title: 'a1', module: 'mod' }],
      replace: false,
    });
  });

  it('removeAgentsEntry DELETEs the title-encoded agents-config entry route', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: applyResult }));
    await client.removeAgentsEntry('agent x');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/agents-config/entries/agent%20x');
  });

  it('updateApiTools POSTs all four delta lists, defaulting the absent ones to empty', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: applyResult }));
    await client.updateApiTools({ include_add: ['echo'], exclude_remove: ['db'] });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/api-tools');
    expect(captured[0]?.body).toEqual({
      include_add: ['echo'],
      include_remove: [],
      exclude_add: [],
      exclude_remove: ['db'],
    });
  });

  it('listFailedMcps GETs the failed door and parses the fleet report', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: fleet('list_failed_mcps', [
          {
            name: 'serve-a',
            outcome: 'applied',
            payload: [{ title: 'db', status: 'unavailable' }],
            error: null,
            detail: null,
          },
        ]),
      }),
    );
    const out = await client.listFailedMcps();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/mcp-status/failed');
    expect(out.op).toBe('list_failed_mcps');
    expect(out.results[0]?.payload).toEqual([{ title: 'db', status: 'unavailable' }]);
  });

  it('reloadFailedMcps POSTs the reload-failed door with a null targets fan-out', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: fleet('reload_failed_mcps') }));
    await client.reloadFailedMcps();
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/mcp-status/reload-failed');
    expect(captured[0]?.body).toEqual({ targets: null });
  });

  it('deregisterMcp POSTs to the title-encoded deregister route', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: fleet('deregister_mcp') }));
    await client.deregisterMcp('my server');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/mcp-status/my%20server/deregister');
    expect(captured[0]?.body).toEqual({ targets: null });
  });

  it('rejects an unsafe entry/deregister title before any request leaves', () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() => jsonResponse({ data: applyResult }));
    expect(() => client.removeToolsEntry('..')).toThrow(rule);
    expect(() => client.removeAgentsEntry('.')).toThrow(rule);
    expect(() => client.deregisterMcp('')).toThrow(rule);
    expect(captured).toHaveLength(0);
  });

  it('surfaces a 4xx { error } from a rejected entry add as a LOUD ApiError', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: 'entries already present (use replace)' }, 400),
    );
    await expect(client.addToolsEntries([{ title: 't1' }])).rejects.toBeInstanceOf(ApiError);
  });
});
