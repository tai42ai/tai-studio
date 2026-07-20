/**
 * Transport-level tests for the tool-extensions client methods — built against the
 * tool-extensions route response shapes. `getToolExtensions` unwraps `{ combos, available }`;
 * `setToolExtensions` POSTs the FULL `{ combos }` list (matching the GET shape) and
 * parses the reload result; a drifting response throws `ApiSchemaError` LOUDLY (no
 * silent coerce). A fake `fetch` records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiSchemaError, type ApiConfig } from './index';

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

// The lone-worker fan-out every apply embeds when no sibling is reached.
const localOnly = {
  mode: 'local-only',
  note: 'no worker bus configured; only this worker reloaded',
};

// The GET response body for the tool-extensions route.
const getData = {
  combos: [['marka'], ['marka', 'markb']],
  available: [
    { name: 'argswrap', kind: 'wrapper' },
    { name: 'backendx', kind: 'backend' },
    { name: 'marka', kind: 'wrapper' },
    { name: 'markb', kind: 'wrapper' },
  ],
};

describe('tool-extensions client transport', () => {
  it('getToolExtensions GETs the extensions route and parses combos + available', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: getData }));
    const out = await client.getToolExtensions('shout');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/tools/shout/extensions');
    expect(out.combos).toEqual([['marka'], ['marka', 'markb']]);
    expect(out.available[1]).toEqual({ name: 'backendx', kind: 'backend' });
  });

  it('getToolExtensions encodes the tool name in the path', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { ...getData, combos: [] } }));
    await client.getToolExtensions('weird name/slash');
    expect(captured[0]?.url).toBe('/api/tools/weird%20name%2Fslash/extensions');
  });

  it('setToolExtensions POSTs the full { combos } list and parses the apply result (local reload + fanout)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { status: 'ok', env_keys: 0, fanout: localOnly } }),
    );
    const out = await client.setToolExtensions('shout', [['marka'], ['markb']]);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/tools/shout/extensions');
    expect(captured[0]?.body).toEqual({ combos: [['marka'], ['markb']] });
    // The apply result is the local reload result plus the mode-wrapped fleet fanout.
    expect(out.status).toBe('ok');
    expect(out.fanout.mode).toBe('local-only');
  });

  it('setToolExtensions parses the multi-worker fanout, keeping a non-converged origin visible', async () => {
    // A reachable multi-worker broadcast rides the fleet fanout; zod must parse (not
    // strip) it so the shared fleet-report handler can surface a stranded sibling.
    const { client } = harness(() =>
      jsonResponse({
        data: {
          status: 'ok',
          env_keys: 2,
          fanout: {
            mode: 'fleet',
            op: 'reload_config',
            reachable: true,
            local_only: false,
            results: [
              { origin: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
              {
                origin: 'backend-b',
                outcome: 'failed',
                payload: null,
                error: 'reload raised',
                detail: null,
              },
            ],
            error: null,
          },
        },
      }),
    );
    const out = await client.setToolExtensions('shout', [['marka']]);
    expect(out.fanout.mode).toBe('fleet');
    // Narrow past the local-only variant to reach the fleet report's origin list.
    if (out.fanout.mode !== 'local-only') {
      expect(out.fanout.results.map((entry) => entry.outcome)).toEqual(['applied', 'failed']);
    }
  });

  it('setToolExtensions sends an empty combos list to CLEAR', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { status: 'ok', env_keys: 0, fanout: localOnly } }),
    );
    await client.setToolExtensions('shout', []);
    expect(captured[0]?.body).toEqual({ combos: [] });
  });

  it('getToolExtensions parses a config-bearing combo element ({ name, config })', async () => {
    const configElement = {
      name: 'output_schema',
      config: { schema: { type: 'object', title: 'Weather' } },
    };
    const { client } = harness(() =>
      jsonResponse({ data: { combos: [['marka', configElement]], available: [] } }),
    );
    const out = await client.getToolExtensions('shout');
    expect(out.combos[0]?.[1]).toEqual(configElement);
  });

  it('setToolExtensions POSTs a config-bearing combo verbatim', async () => {
    const configElement = {
      name: 'output_schema',
      config: { schema: { type: 'object', title: 'Weather' } },
    };
    const { client, captured } = harness(() =>
      jsonResponse({ data: { status: 'ok', env_keys: 0, fanout: localOnly } }),
    );
    await client.setToolExtensions('shout', [['marka', configElement]]);
    expect(captured[0]?.body).toEqual({ combos: [['marka', configElement]] });
  });

  it('throws ApiSchemaError LOUDLY on a drifting extensions response (no silent coerce)', async () => {
    // `combos` as a flat list of strings (not list-of-combos) is a contract drift.
    const { client } = harness(() =>
      jsonResponse({ data: { combos: ['marka', 'markb'], available: [] } }),
    );
    await expect(client.getToolExtensions('shout')).rejects.toBeInstanceOf(ApiSchemaError);
  });

  // A `.`/`..`/absolute/empty tool name would be collapsed by the browser URL
  // parser and silently retarget the request, so the id→path encoder rejects it at
  // the client boundary before any request leaves.
  it('rejects an unsafe tool name before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() => jsonResponse({ data: { ...getData, combos: [] } }));
    expect(() => client.getToolExtensions('..')).toThrow(rule);
    expect(() => client.getToolExtensions('.')).toThrow(rule);
    expect(() => client.getToolExtensions('')).toThrow(rule);
    expect(() => client.setToolExtensions('..', [])).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.getToolExtensions('weird name/slash');
    expect(captured[0]?.url).toBe('/api/tools/weird%20name%2Fslash/extensions');
  });
});
