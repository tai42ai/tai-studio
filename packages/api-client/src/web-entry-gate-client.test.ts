/**
 * Transport-level tests for the web entry-gate client methods: `getWebEntryGate`,
 * `setWebEntryGate`, `mintWebEntryCode`, `revokeWebEntryCode` — URL (+ identity /
 * code-id encoding), HTTP method, request-body shaping, the `{ data }` envelope
 * unwrap + schema round-trip, and the loud failure mappings. Pins the raw-once
 * contract: the mint reply carries the raw `code`; a listed code never does. Both
 * mint fields are sent EXPLICITLY (including `null`). A fake `fetch` records each
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
  rawBody: string | undefined;
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
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;
    captured.push({
      url: urlString(url),
      method: init?.method ?? 'GET',
      rawBody,
      body: rawBody === undefined ? undefined : JSON.parse(rawBody),
    });
    return responder();
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

const GATE = {
  enabled: true,
  codes: [
    {
      code_id: 'abc123def456',
      label: 'newsletter',
      created_at: '2026-08-01T09:00:00Z',
      expires_at: null,
    },
  ],
};

const MINTED = {
  code: 'ent-raw-token',
  code_id: 'abc123def456',
  expires_at: null,
};

describe('web entry-gate client transport', () => {
  it('getWebEntryGate GETs the identity-encoded route and parses the flag + codes', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: GATE }));
    const out = await client.getWebEntryGate('+1 555');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/channels/web/gates/%2B1%20555');
    expect(out.enabled).toBe(true);
    expect(out.codes[0]).toEqual(GATE.codes[0]);
  });

  it('parses a code carrying a label and an expiry', async () => {
    const gate = {
      enabled: false,
      codes: [
        {
          code_id: 'id2',
          label: null,
          created_at: '2026-08-01T09:00:00Z',
          expires_at: '2026-09-01T09:00:00Z',
        },
      ],
    };
    const { client } = harness(() => jsonResponse({ data: gate }));
    const out = await client.getWebEntryGate('web-1');
    expect(out.enabled).toBe(false);
    expect(out.codes[0]?.label).toBeNull();
    expect(out.codes[0]?.expires_at).toBe('2026-09-01T09:00:00Z');
  });

  it('setWebEntryGate PUTs the flag and parses the confirmed state', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { enabled: false } }));
    const out = await client.setWebEntryGate('web-1', false);
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/channels/web/gates/web-1');
    expect(captured[0]?.body).toEqual({ enabled: false });
    expect(out.enabled).toBe(false);
  });

  it('mintWebEntryCode POSTs the codes route and returns the raw code ONCE', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: MINTED }));
    const out = await client.mintWebEntryCode('web-1', { label: 'newsletter', expires_at: null });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/channels/web/gates/web-1/codes');
    expect(out.code).toBe('ent-raw-token');
    expect(out.expires_at).toBeNull();
  });

  it('sends label + expires_at EXPLICITLY, null values included (never dropped keys)', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: MINTED }));
    await client.mintWebEntryCode('web-1', { label: null, expires_at: null });
    expect(captured[0]?.rawBody).toContain('"label":null');
    expect(captured[0]?.rawBody).toContain('"expires_at":null');
    expect(captured[0]?.body).toEqual({ label: null, expires_at: null });
  });

  it('sends a timed expiry and a label verbatim', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ...MINTED, expires_at: '2026-09-01T09:00:00Z' } }),
    );
    await client.mintWebEntryCode('web-1', {
      label: 'timed',
      expires_at: '2026-09-01T09:00:00Z',
    });
    expect(captured[0]?.body).toEqual({ label: 'timed', expires_at: '2026-09-01T09:00:00Z' });
  });

  it('revokeWebEntryCode DELETEs the id-encoded route and parses the reply', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { status: 'revoked' } }));
    const out = await client.revokeWebEntryCode('web-1', 'code id/1');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/channels/web/gates/web-1/codes/code%20id%2F1');
    expect(out).toEqual({ status: 'revoked' });
  });

  it('throws ApiSchemaError LOUDLY on a code missing its code_id', async () => {
    const gate = {
      enabled: true,
      codes: [{ label: null, created_at: '2026-08-01T09:00:00Z', expires_at: null }],
    };
    const { client } = harness(() => jsonResponse({ data: gate }));
    await expect(client.getWebEntryGate('web-1')).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY on a mint reply with no raw code', async () => {
    const { client } = harness(() => jsonResponse({ data: { code_id: 'id', expires_at: null } }));
    await expect(
      client.mintWebEntryCode('web-1', { label: null, expires_at: null }),
    ).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY on a revoke reply whose status is not "revoked"', async () => {
    const { client } = harness(() => jsonResponse({ data: { status: 'gone' } }));
    await expect(client.revokeWebEntryCode('web-1', 'id')).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('maps a revoke of an unknown id to a LOUD 404 ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'unknown entry code' }, 404));
    await expect(client.revokeWebEntryCode('web-1', 'ghost')).rejects.toBeInstanceOf(ApiError);
  });

  it('surfaces a 403 on the gate flip as a LOUD ApiError carrying the envelope text', async () => {
    const { client } = harness(() => jsonResponse({ error: 'not your route' }, 403));
    await expect(client.setWebEntryGate('web-1', true)).rejects.toThrowError('not your route');
  });

  // A `.`/`..`/absolute/empty identity or code-id would be collapsed by the browser
  // URL parser and silently retarget the request, so the id→path encoder rejects it
  // at the client boundary before any request leaves.
  it('rejects an unsafe identity/code-id before any request', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() => jsonResponse({ data: { status: 'revoked' } }));
    expect(() => client.getWebEntryGate('..')).toThrow(rule);
    expect(() => client.revokeWebEntryCode('web-1', '')).toThrow(rule);
    expect(captured).toHaveLength(0);
  });
});
