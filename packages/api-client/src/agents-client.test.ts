/**
 * Transport-level tests for the agent LIST client methods: `listAgents` and
 * `listSpecRunnableAgents` — URL, HTTP method, the `{ data }` envelope unwrap, the
 * `agentSummary` field defaults, and a LOUD error on a 4xx `{error}` plus an
 * `ApiSchemaError` on a drifting response. The streaming run methods
 * (`streamAgentRun` / `streamAuthoredAgentRun`) are exercised in `agents.test.ts`.
 * A fake `fetch` records each request and returns a canned body.
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
}

function urlString(url: RequestInfo | URL): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

function harness(responder: () => Response) {
  const captured: Captured[] = [];
  const fetchImpl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: urlString(url), method: init?.method ?? 'GET' });
    return Promise.resolve(responder());
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

describe('agents list client transport', () => {
  it('listAgents GETs /api/agents and parses { items, total } with summary defaults', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { items: [{ name: 'planner', tool_name: 'planner' }], total: 1 },
      }),
    );
    const out = await client.listAgents();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/agents');
    expect(out.total).toBe(1);
    // Absent optional summary fields default rather than being required.
    expect(out.items[0]).toMatchObject({
      name: 'planner',
      description: '',
      input_schema: {},
      spec_runnable: false,
    });
  });

  it('listSpecRunnableAgents GETs the spec-runnable route and parses the authorable subset', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          items: [{ name: 'support_bot', tool_name: 'support_bot', spec_runnable: true }],
          total: 1,
        },
      }),
    );
    const out = await client.listSpecRunnableAgents();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/agents/spec-runnable');
    expect(out.items[0]?.spec_runnable).toBe(true);
  });

  it('surfaces a 4xx { error } from the agents route as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'agent registry unavailable' }, 503));
    await expect(client.listAgents()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting list (total missing)', async () => {
    const { client } = harness(() => jsonResponse({ data: { items: [] } }));
    await expect(client.listAgents()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
