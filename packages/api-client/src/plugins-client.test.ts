/**
 * Transport-level tests for the studio-plugin registry method: URL/method
 * building, the `{ data }` envelope unwrap, and the manifest `contributions`
 * parsing — in particular that `nav_entries` survives (a non-strict `z.object`
 * would otherwise SILENTLY STRIP an undeclared field) and defaults to `[]` when a
 * manifest omits it. A fake `fetch` records each request and returns a canned body.
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

const manifest = (contributions: Record<string, unknown>) => ({
  name: 'reference_plugin',
  version: '0.1.0',
  api_version: 1,
  entry: 'index.js',
  integrity: { 'index.js': 'sha384-abc' },
  contributions,
});

describe('studio-plugin registry client transport', () => {
  it('listStudioPlugins() GETs /api/plugins and unwraps the registry', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: [] }));
    const out = await client.listStudioPlugins();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/plugins');
    expect(out).toEqual([]);
  });

  it('keeps a manifest that carries nav_entries (never silently strips the field)', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: [
          manifest({
            tool_panels: { studio_demo_echo: 'EchoPanel' },
            pages: ['demo'],
            settings_tabs: ['general'],
            nav_entries: ['demo'],
          }),
        ],
      }),
    );
    const [parsed] = await client.listStudioPlugins();
    expect(parsed?.contributions.nav_entries).toEqual(['demo']);
    expect(parsed?.contributions.settings_tabs).toEqual(['general']);
  });

  it('defaults nav_entries to [] when a manifest omits it', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: [manifest({ tool_panels: {}, pages: ['demo'], settings_tabs: [] })],
      }),
    );
    const [parsed] = await client.listStudioPlugins();
    expect(parsed?.contributions.nav_entries).toEqual([]);
  });

  it('throws ApiSchemaError LOUDLY on a drifting manifest (non-string nav entry)', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: [manifest({ tool_panels: {}, pages: [], settings_tabs: [], nav_entries: [1] })],
      }),
    );
    await expect(client.listStudioPlugins()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
