/**
 * Transport-level tests for the access-control policy client methods:
 * `validateCondition`, `listPolicyVersions`, `rollbackPolicy` — URL/method/body
 * building, the envelope unwrap, and a LOUD `ApiSchemaError` on a drifting
 * response (never a silent coerce). A fake `fetch` records each request and
 * returns a canned body.
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

const version1 = {
  version: 1,
  body: {
    scopes: ['deploy'],
    policy_data: { limit: 7 },
    condition: '.context.used < .policy.limit',
    condition_id: null,
    condition_kwargs: { tier: 'pro' },
  },
  tags: [],
  created_at: '2024-01-01T00:00:01+00:00',
  is_current: true,
};

const versions = [version1];

describe('policy client transport', () => {
  it('validateCondition POSTs the body and parses {ok,result}', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { ok: true, result: null } }));
    const out = await client.validateCondition({ condition: '.policy.limit > 0' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/validate-condition');
    expect(captured[0]?.body).toEqual({ condition: '.policy.limit > 0' });
    expect(out).toEqual({ ok: true, result: null });
  });

  it('validateCondition returns the boolean result on a sample evaluation', async () => {
    const { client } = harness(() => jsonResponse({ data: { ok: true, result: true } }));
    const out = await client.validateCondition({
      condition: '.policy.limit > .context.used',
      sample_context: { policy: { limit: 5 }, context: { used: 3 } },
    });
    expect(out.result).toBe(true);
  });

  it('listPolicyVersions GETs the versions route and parses is_current', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: versions }));
    const out = await client.listPolicyVersions('u1');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/auth/api-keys/u1/policy/versions');
    expect(out[0]?.is_current).toBe(true);
    expect(out[0]?.body.condition).toBe('.context.used < .policy.limit');
  });

  it('rollbackPolicy POSTs {version} and parses the re-pointed active_version', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { user_id: 'u1', active_version: 1 } }),
    );
    const out = await client.rollbackPolicy('u1', 1);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/auth/api-keys/u1/policy/rollback');
    expect(captured[0]?.body).toEqual({ version: 1 });
    expect(out.active_version).toBe(1);
  });

  it('throws ApiSchemaError LOUDLY on a drifting policy version (no silent coerce)', async () => {
    const { is_current: _dropped, ...broken } = version1;
    const { client } = harness(() => jsonResponse({ data: [broken] }));
    await expect(client.listPolicyVersions('u1')).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY when validate-condition drifts', async () => {
    const { client } = harness(() => jsonResponse({ data: { ok: true } }));
    await expect(client.validateCondition({ condition: '.x' })).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });

  // A `.`/`..`/absolute/empty user id would be collapsed by the browser URL parser
  // and silently retarget the request, so the id→path encoder rejects it at the
  // client boundary before any request leaves.
  it('rejects an unsafe user id before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() => jsonResponse({ data: versions }));
    expect(() => client.listPolicyVersions('..')).toThrow(rule);
    expect(() => client.listPolicyVersions('.')).toThrow(rule);
    expect(() => client.listPolicyVersions('')).toThrow(rule);
    expect(() => client.rollbackPolicy('..', 1)).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.listPolicyVersions('u 1');
    expect(captured[0]?.url).toBe('/api/auth/api-keys/u%201/policy/versions');
  });
});
