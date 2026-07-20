/**
 * Transport-level tests for the marketplace client methods: `searchMarketplace`,
 * `getMarketplacePlugin`, `listMarketplaceCategories`,
 * `listInstalledMarketplacePlugins`, `installMarketplacePlugin`,
 * `uninstallMarketplacePlugin`, `updateMarketplacePlugin`, and
 * `getMarketplaceAdvisories` — URL (incl. REPEATED `tags` params and
 * percent-encoded path segments), HTTP method, request-body shaping, the
 * `{ data }` envelope unwrap, and a LOUD error on a 4xx `{error}` plus an
 * `ApiSchemaError` on a drifting response. A fake `fetch` records each request
 * and returns a canned body.
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

const SEARCH_ROW = {
  item: { kind: 'tool', name: 'generate_uuid', description: 'Generate a UUID.', tags: ['uuid'] },
  ref: 'tai42/toolbox',
  namespace: 'tai42',
  name: 'toolbox',
  display_name: 'Toolbox',
  icon_url: 'https://marketplace.tai42.ai/api/v1/plugins/tai42/toolbox/icon',
  package: 'tai42-toolbox',
  description: 'One-line listing description.',
  categories: ['productivity'],
  tags: ['uuid', 'hashing', 'text'],
  trust_tier: 'official',
  pricing: 'free',
  latest_version: '0.1.0',
  downloads: 3,
  updated_at: '2026-07-12T00:00:00Z',
};

const ADVISORY = {
  id: 7,
  listing: 'tai42/toolbox',
  affected_versions: '<0.1.0',
  severity: 'high',
  summary: 'A fixed input-handling flaw.',
  created_at: '2026-07-10T00:00:00Z',
  withdrawn_at: null,
};

const PLUGIN_DETAIL = {
  namespace: 'tai42',
  name: 'toolbox',
  display_name: 'Toolbox',
  icon_url: 'https://marketplace.tai42.ai/api/v1/plugins/tai42/toolbox/icon',
  package: 'tai42-toolbox',
  description: 'One-line listing description.',
  readme_md: '<p>Docs.</p>',
  license: 'Apache-2.0',
  homepage_url: 'https://tai42.ai',
  repository_url: 'https://github.com/tai42ai/tai-toolbox',
  categories: ['productivity'],
  tags: ['uuid', 'hashing'],
  trust_tier: 'official',
  pricing: 'free',
  downloads: 3,
  latest: {
    version: '0.1.0',
    contract_range: '>=0.1,<0.2',
    status: 'published',
    published_at: '2026-07-12T00:00:00Z',
    items: [
      { kind: 'tool', name: 'generate_uuid', description: 'Generate a UUID.', tags: ['uuid'] },
    ],
  },
  versions: [
    {
      version: '0.1.0',
      contract_range: '>=0.1,<0.2',
      status: 'published',
      published_at: '2026-07-12T00:00:00Z',
    },
  ],
};

describe('marketplace client transport', () => {
  it('searchMarketplace GETs /api/marketplace/search with every param and repeated tags', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { items: [SEARCH_ROW], total: 1, page: 2, page_size: 20 } }),
    );
    const out = await client.searchMarketplace({
      q: 'uuid',
      kind: 'tool',
      category: 'productivity',
      tags: ['hashing', 'text'],
      namespace: 'tai42',
      tier: 'official',
      contract: '0.1.0',
      sort: 'downloads',
      page: 2,
      page_size: 20,
    });
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe(
      '/api/marketplace/search?q=uuid&kind=tool&category=productivity&tags=hashing&tags=text' +
        '&namespace=tai42&tier=official&contract=0.1.0&sort=downloads&page=2&page_size=20',
    );
    expect(out.items[0]?.ref).toBe('tai42/toolbox');
    expect(out.total).toBe(1);
  });

  it('searchMarketplace() with no filters sends no query params', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { items: [], total: 0, page: 1, page_size: 20 } }),
    );
    await client.searchMarketplace();
    expect(captured[0]?.url).toBe('/api/marketplace/search');
  });

  it('getMarketplacePlugin GETs the detail and percent-encodes path segments', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: PLUGIN_DETAIL }));
    const out = await client.getMarketplacePlugin('tai42', 'tool box');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/marketplace/plugins/tai42/tool%20box');
    expect(out.namespace).toBe('tai42');
    expect(out.latest?.items[0]?.name).toBe('generate_uuid');
    expect(out.versions[0]?.version).toBe('0.1.0');
  });

  it('listMarketplaceCategories GETs /api/marketplace/categories and parses the list', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: ['productivity', 'utilities'] }),
    );
    const out = await client.listMarketplaceCategories();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/marketplace/categories');
    expect(out).toEqual(['productivity', 'utilities']);
  });

  it('listInstalledMarketplacePlugins GETs /api/marketplace/installed and parses the list', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          {
            ref: 'tai42/toolbox',
            version: '0.1.0',
            source: 'github',
            installed_at: '2026-07-12T00:00:00Z',
            latest: '0.2.0',
            update_available: true,
            missing_upstream: false,
          },
        ],
      }),
    );
    const out = await client.listInstalledMarketplacePlugins();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/marketplace/installed');
    expect(out[0]?.update_available).toBe(true);
  });

  it('installMarketplacePlugin POSTs the body and parses the receipt (notes + advisories)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          ref: 'tai42/toolbox',
          version: '0.1.0',
          package: 'tai42-toolbox',
          advisories: [ADVISORY],
          notes: ['config provider selected via TAI_CONFIG_MODE'],
          reload: { ok: true },
          pip_output: 'Successfully installed tai-toolbox-0.1.0',
        },
      }),
    );
    const out = await client.installMarketplacePlugin({ ref: 'tai42/toolbox', version: '0.1.0' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/marketplace/install');
    expect(captured[0]?.body).toEqual({ ref: 'tai42/toolbox', version: '0.1.0' });
    expect(out.notes).toEqual(['config provider selected via TAI_CONFIG_MODE']);
    expect(out.advisories[0]?.id).toBe(7);
    // The un-modelled wire fields are stripped, not surfaced on the receipt.
    expect(out).not.toHaveProperty('package');
    expect(out).not.toHaveProperty('pip_output');
  });

  it('installMarketplacePlugin omits version from the body when not given', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ref: 'tai42/toolbox', version: '0.1.0', advisories: [], notes: [] } }),
    );
    await client.installMarketplacePlugin({ ref: 'tai42/toolbox' });
    expect(captured[0]?.body).toEqual({ ref: 'tai42/toolbox' });
  });

  it('uninstallMarketplacePlugin POSTs to /api/marketplace/uninstall and parses the receipt', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { ref: 'tai42/toolbox', uninstalled: true, reload: { ok: true }, notes: [] },
      }),
    );
    const out = await client.uninstallMarketplacePlugin({ ref: 'tai42/toolbox' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/marketplace/uninstall');
    expect(captured[0]?.body).toEqual({ ref: 'tai42/toolbox' });
    expect(out.uninstalled).toBe(true);
  });

  it('updateMarketplacePlugin POSTs to /api/marketplace/update and parses the receipt', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ref: 'tai42/toolbox', version: '0.2.0', advisories: [], notes: [] } }),
    );
    const out = await client.updateMarketplacePlugin({ ref: 'tai42/toolbox' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/marketplace/update');
    expect(captured[0]?.body).toEqual({ ref: 'tai42/toolbox' });
    expect(out.version).toBe('0.2.0');
  });

  it('getMarketplaceAdvisories GETs the advisory state and parses { advisories, fetched_at }', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { advisories: [ADVISORY], fetched_at: '2026-07-16T00:00:00Z' } }),
    );
    const out = await client.getMarketplaceAdvisories();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/marketplace/advisories');
    expect(out.advisories[0]?.severity).toBe('high');
    expect(out.fetched_at).toBe('2026-07-16T00:00:00Z');
  });

  it('surfaces a 4xx { error } from an install failure as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: "unknown listing 'tai42/ghost'" }, 404));
    await expect(client.installMarketplacePlugin({ ref: 'tai42/ghost' })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('throws ApiSchemaError LOUDLY on a drifting search response (items not an array)', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { items: 'nope', total: 0, page: 1, page_size: 20 } }),
    );
    await expect(client.searchMarketplace()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
