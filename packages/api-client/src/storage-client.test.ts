/**
 * Transport-level tests for the storage client methods: URL/method/body shaping,
 * the envelope unwrap, the nested-id per-segment encoding, the Blob content
 * download, and a LOUD error on a 404 download (never a silent empty Blob). A fake
 * `fetch` records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, type ApiConfig } from './index';

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

describe('storage client transport', () => {
  it('getStorageInfo GETs /api/storage and parses the absent sentinel', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { present: false, provider: null, module: null } }),
    );
    const out = await client.getStorageInfo();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/storage');
    expect(out).toEqual({ present: false, provider: null, module: null });
  });

  it('getStorageInfo parses a present provider identity', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: { present: true, provider: 'FsStorage', module: 'plugin.storage' },
      }),
    );
    const out = await client.getStorageInfo();
    expect(out.present).toBe(true);
    expect(out.provider).toBe('FsStorage');
  });

  it('listStorageResources GETs the resources route with no query', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { resources: ['a.txt', 'nested/b.bin'] } }),
    );
    const out = await client.listStorageResources();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/storage/resources');
    expect(out.resources).toEqual(['a.txt', 'nested/b.bin']);
  });

  it('statStorageResource encodes a nested id per segment (preserving /)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'a/b c.txt', content_type: 'text/plain' } }),
    );
    const out = await client.statStorageResource('a/b c.txt');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/storage/resources/a/b%20c.txt/stat');
    expect(out.content_type).toBe('text/plain');
  });

  it('statStorageResource parses a null content_type', async () => {
    const { client } = harness(() => jsonResponse({ data: { id: 'blob', content_type: null } }));
    const out = await client.statStorageResource('blob');
    expect(out.content_type).toBeNull();
  });

  it('uploadStorageResource POSTs the text body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'note.txt', stored: true } }),
    );
    const out = await client.uploadStorageResource({ id: 'note.txt', content_text: 'hi' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/storage/resources');
    expect(captured[0]?.body).toEqual({ id: 'note.txt', content_text: 'hi' });
    expect(out.stored).toBe(true);
  });

  it('uploadStorageResource POSTs a base64 body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'img.png', stored: true } }),
    );
    await client.uploadStorageResource({ id: 'img.png', content_base64: 'AAEC' });
    expect(captured[0]?.body).toEqual({ id: 'img.png', content_base64: 'AAEC' });
  });

  it('deleteStorageResource DELETEs the encoded resource route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'a/b c.txt', deleted: true } }),
    );
    const out = await client.deleteStorageResource('a/b c.txt');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/storage/resources/a/b%20c.txt');
    expect(out.deleted).toBe(true);
  });

  it('deleteStorageDir DELETEs the encoded dirs route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { dir: 'nested dir', deleted: true } }),
    );
    const out = await client.deleteStorageDir('nested dir');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/storage/dirs/nested%20dir');
    expect(out.dir).toBe('nested dir');
  });

  it('downloadStorageResource returns the raw Blob with its content type', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3]);
    const { client, captured } = harness(
      () =>
        new Response(bytes, {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
            'content-disposition': 'attachment; filename="b.bin"',
          },
        }),
    );
    const blob = await client.downloadStorageResource('nested/b.bin');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/storage/resources/nested/b.bin/content');
    expect(blob.type).toBe('application/octet-stream');
    expect(await blob.arrayBuffer()).toEqual(bytes.buffer);
  });

  it('downloadStorageResource throws LOUDLY on a 404 (no silent empty Blob)', async () => {
    const { client } = harness(() => jsonResponse({ error: "resource 'gone' not found" }, 404));
    await expect(client.downloadStorageResource('gone')).rejects.toBeInstanceOf(ApiError);
  });

  // A `.`/`..`/absolute/empty-segment id can never survive the browser's URL parser
  // (it strips dot-segments from the relative path before the request is sent), so the
  // path encoder rejects it at the client boundary rather than let it silently retarget
  // the request at an unrelated route. Every storage method that encodes an id inherits
  // the guard.
  it('rejects an id with unsafe path segments before issuing any request', () => {
    const { client, captured } = harness(() => jsonResponse({ data: {} }));
    const rule = /relative path/;
    expect(() => client.statStorageResource('..')).toThrow(rule);
    expect(() => client.deleteStorageResource('a/../b')).toThrow(rule);
    expect(() => client.downloadStorageResource('/etc')).toThrow(rule);
    expect(() => client.deleteStorageDir('a//b')).toThrow(rule);
    expect(() => client.statStorageResource('')).toThrow(rule);
    // The guard fires before the transport, so no request was ever sent.
    expect(captured).toHaveLength(0);
  });

  it('still encodes a legitimate nested id per segment (guard does not over-reject)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'reports/2026/q1 report.txt', content_type: 'text/plain' } }),
    );
    await client.statStorageResource('reports/2026/q1 report.txt');
    expect(captured[0]?.url).toBe('/api/storage/resources/reports/2026/q1%20report.txt/stat');
  });
});
