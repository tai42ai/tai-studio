/**
 * Transport-level tests for the backup client methods: `listBackupSections`,
 * `importBackup`, and the `exportBackup` DOWNLOAD — URL, HTTP method, request-body
 * shaping, the `{ data }` envelope unwrap, the raw-`Blob` download, and a LOUD
 * error on a non-2xx (never a silent empty Blob) plus an `ApiSchemaError` on a
 * drifting response. A fake `fetch` records each request and returns a canned body.
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

describe('backup client transport', () => {
  it('listBackupSections GETs the sections route and parses the { name, secret } rows', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          { name: 'presets', secret: false },
          { name: 'api-keys', secret: true },
        ],
      }),
    );
    const out = await client.listBackupSections();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/backup/sections');
    expect(out[1]).toEqual({ name: 'api-keys', secret: true });
  });

  it('importBackup POSTs { document, sections } and parses the per-section report (incl. the manifest fanout)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          ok: true,
          sections: {
            presets: { created: 1, updated: 0, skipped: 0, errors: [] },
            // The manifest/env restores apply through the config pipeline, so their
            // report carries the mode-wrapped fleet fanout; it must parse, not strip.
            manifest: {
              created: 0,
              updated: 1,
              skipped: 0,
              errors: [],
              fanout: {
                mode: 'local-only',
                note: 'no worker bus configured; only this worker reloaded',
              },
            },
          },
        },
      }),
    );
    const document = { version: 1, created_at: 'now', sections: { presets: [], manifest: {} } };
    const out = await client.importBackup({ document, sections: ['presets', 'manifest'] });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/backup/import');
    expect(captured[0]?.body).toEqual({ document, sections: ['presets', 'manifest'] });
    expect(out.ok).toBe(true);
    expect(out.sections.presets?.created).toBe(1);
    expect(out.sections.manifest?.fanout?.mode).toBe('local-only');
  });

  it('exportBackup POSTs { sections } and returns the raw Blob with its content type', async () => {
    const bytes = new TextEncoder().encode('{"version":1}');
    const { client, captured } = harness(
      () =>
        new Response(bytes, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-disposition': 'attachment; filename="backup.json"',
          },
        }),
    );
    const blob = await client.exportBackup(['presets', 'api-keys']);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/backup/export');
    expect(captured[0]?.body).toEqual({ sections: ['presets', 'api-keys'] });
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('{"version":1}');
  });

  it('exportBackup throws LOUDLY on a non-2xx (no silent empty Blob)', async () => {
    const { client } = harness(() => jsonResponse({ error: 'export failed' }, 500));
    await expect(client.exportBackup(['presets'])).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting import report (ok missing)', async () => {
    const { client } = harness(() => jsonResponse({ data: { sections: {} } }));
    await expect(client.importBackup({ document: {}, sections: [] })).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });
});
