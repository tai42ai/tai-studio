/**
 * Transport-level tests for the storage client methods: URL/method/body shaping,
 * the envelope unwrap, the nested-id per-segment encoding, the Blob content
 * download, and a LOUD error on a 404 download (never a silent empty Blob). A fake
 * `fetch` records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { type ApiConfig, ApiError } from '../index';
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

describe('storage client transport', () => {
  it('getStorageInfo GETs /api/storage and parses the absent sentinel', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { present: false, provider: null, module: null, surfaces: [] } }),
    );
    const out = await client.getStorageInfo();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/storage');
    expect(out).toEqual({ present: false, provider: null, module: null, surfaces: [] });
  });

  it('getStorageInfo parses a present provider identity', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          present: true,
          provider: 'FsStorage',
          module: 'plugin.storage',
          surfaces: ['storage', 'templates'],
        },
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

  // The browser's URL parser strips a `.` or `..` segment before the request is sent,
  // which would retarget it at another route, so the client refuses those segments.
  // Every storage method that encodes an id inherits the check.
  it('rejects a `.` or `..` segment before issuing any request', () => {
    const { client, captured } = harness(() => jsonResponse({ data: {} }));
    const rule = /non-canonical store key/;
    expect(() => client.statStorageResource('./x')).toThrow(rule);
    expect(() => client.downloadStorageResource('x/.')).toThrow(rule);
    expect(() => client.deleteStorageResource('../x')).toThrow(rule);
    expect(() => client.deleteStorageDir('a/../b')).toThrow(rule);
    expect(() => client.readStorageResource('..')).toThrow(rule);
    expect(captured).toHaveLength(0);
  });

  it('sends a key with an empty segment as typed and surfaces the server refusal', async () => {
    const message =
      "non-canonical store key 'a//b': a key is '/'-separated names with no empty, '.' or '..' segment";
    const { client, captured } = harness(() => jsonResponse({ error: message }, 400));
    const failure = client.statStorageResource('a//b');
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toThrow(message);
    expect(captured[0]?.url).toBe('/api/storage/resources/a//b/stat');
    await expect(client.deleteStorageResource('x/')).rejects.toBeInstanceOf(ApiError);
    expect(captured[1]?.url).toBe('/api/storage/resources/x/');
  });

  it('readStorageResource GETs the entries route and parses each kind', async () => {
    const text = { id: 'a.txt', kind: 'text', content: 'hi', content_type: 'text/plain', size: 2 };
    const doc = {
      id: 'docs/a.pdf',
      kind: 'document',
      content: 'extracted',
      content_type: 'application/pdf',
      size: 900,
    };
    const bin = { id: 'img.png', kind: 'binary', content_type: 'image/png', size: 4 };
    for (const entry of [text, doc, bin]) {
      const { client, captured } = harness(() => jsonResponse({ data: entry }));
      expect(await client.readStorageResource(entry.id)).toEqual(entry);
      expect(captured[0]?.method).toBe('GET');
      expect(captured[0]?.url).toBe(`/api/storage/entries/${entry.id}`);
    }
  });

  it('readStorageResource refuses an unknown kind loudly', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { id: 'x', kind: 'video', content_type: null, size: 1 } }),
    );
    await expect(client.readStorageResource('x')).rejects.toThrow();
  });

  it('still encodes a legitimate nested id per segment (guard does not over-reject)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'reports/2026/q1 report.txt', content_type: 'text/plain' } }),
    );
    await client.statStorageResource('reports/2026/q1 report.txt');
    expect(captured[0]?.url).toBe('/api/storage/resources/reports/2026/q1%20report.txt/stat');
  });
});
