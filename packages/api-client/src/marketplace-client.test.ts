/**
 * Transport-level tests for the marketplace client methods: `searchMarketplace`,
 * `getMarketplacePlugin`, `listMarketplaceCategories`,
 * `listInstalledMarketplacePlugins`, `installMarketplacePlugin`,
 * `uninstallMarketplacePlugin`, `updateMarketplacePlugin`,
 * `upgradeAllMarketplacePlugins`, and
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
  kinds: [
    { kind: 'tool', count: 2, names: ['generate_uuid', 'hash_text'] },
    { kind: 'agent', count: 1, names: ['echo'] },
  ],
  groups: [{ name: 'utilities', count: 2 }],
};

const INSTALLED_ROW = {
  ref: 'tai42/toolbox',
  version: '0.1.0',
  source: 'github',
  installed_at: '2026-07-12T00:00:00Z',
  latest: '0.2.0',
  update_available: true,
  incompatible_newer: '0.3.0',
  missing_upstream: false,
  compat: {
    status: 'incompatible',
    reason: 'declared contract range >=0.1,<0.2 excludes the running 0.2.0',
  },
  items: [{ kind: 'mcp-server', name: 'postgres' }],
  route_mounts: { relay: 'channels/relay-2' },
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
  repository_url: 'https://github.com/tai42ai/tai42/tree/main/plugins/toolbox',
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
      {
        kind: 'tool',
        name: 'generate_uuid',
        description: 'Generate a UUID.',
        tags: ['uuid'],
        group: null,
      },
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
      jsonResponse({ data: { listings: [SEARCH_ROW], total: 1, page: 2, page_size: 20 } }),
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
    expect(out.listings[0]?.ref).toBe('tai42/toolbox');
    expect(out.listings[0]?.kinds).toEqual([
      { kind: 'tool', count: 2, names: ['generate_uuid', 'hash_text'] },
      { kind: 'agent', count: 1, names: ['echo'] },
    ]);
    expect(out.listings[0]?.groups).toEqual([{ name: 'utilities', count: 2 }]);
    expect(out.total).toBe(1);
  });

  it('searchMarketplace() with no filters sends no query params', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { listings: [], total: 0, page: 1, page_size: 20 } }),
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
    expect(out.latest?.items[0]?.group).toBeNull();
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

  it('listMarketplaceKinds GETs /api/marketplace/kinds and parses the list', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: ['tool', 'agent'] }));
    const out = await client.listMarketplaceKinds();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/marketplace/kinds');
    expect(out).toEqual(['tool', 'agent']);
  });

  it('listInstalledMarketplacePlugins GETs /api/marketplace/installed and parses installed + quarantined', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          installed: [INSTALLED_ROW],
          quarantined: [
            { name: 'tai42-broken', reason: 'requires tai42-contract<0.2; running 0.2.0' },
          ],
        },
      }),
    );
    const out = await client.listInstalledMarketplacePlugins();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/marketplace/installed');
    expect(out.installed[0]?.update_available).toBe(true);
    expect(out.installed[0]?.incompatible_newer).toBe('0.3.0');
    expect(out.installed[0]?.items[0]).toEqual({
      kind: 'mcp-server',
      name: 'postgres',
    });
    expect(out.installed[0]?.compat).toEqual({
      status: 'incompatible',
      reason: 'declared contract range >=0.1,<0.2 excludes the running 0.2.0',
    });
    expect(out.installed[0]?.route_mounts).toEqual({ relay: 'channels/relay-2' });
    expect(out.quarantined[0]?.name).toBe('tai42-broken');
  });

  it('throws ApiSchemaError LOUDLY on an unknown key in the CLOSED installed shapes', async () => {
    // The installed listing is a closed contract: the server is built against
    // exactly these shapes, so an extra key is drift, never silently stripped.
    const { client } = harness(() =>
      jsonResponse({
        data: { installed: [{ ...INSTALLED_ROW, surprise: 1 }], quarantined: [] },
      }),
    );
    await expect(client.listInstalledMarketplacePlugins()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('upgradeAllMarketplacePlugins POSTs body-less and parses the per-plugin outcomes', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          results: [
            { ref: 'tai42/toolbox', outcome: 'upgraded', detail: '0.1.0 -> 0.2.0' },
            {
              ref: 'tai42/stable',
              outcome: 'up-to-date',
              detail: '0.1.0 is the latest compatible version',
            },
            { ref: 'tai42/orphan', outcome: 'no-compatible-version', detail: 'newest is 9.0.0' },
            { ref: 'tai42/flaky', outcome: 'failed', detail: 'pip install failed' },
          ],
        },
      }),
    );
    const out = await client.upgradeAllMarketplacePlugins();
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/marketplace/upgrade-all');
    expect(captured[0]?.body).toBeUndefined();
    expect(out.results.map((row) => row.outcome)).toEqual([
      'upgraded',
      'up-to-date',
      'no-compatible-version',
      'failed',
    ]);
  });

  it('throws ApiSchemaError LOUDLY on an outcome outside the upgrade-all enum', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: { results: [{ ref: 'tai42/toolbox', outcome: 'exploded', detail: 'x' }] },
      }),
    );
    await expect(client.upgradeAllMarketplacePlugins()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('installMarketplacePlugin POSTs the body and parses the receipt (notes + advisories + routes)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          ref: 'tai42/toolbox',
          version: '0.1.0',
          package: 'tai42-toolbox',
          advisories: [ADVISORY],
          notes: ['config provider selected via TAI_CONFIG_MODE'],
          routes: [
            {
              item: 'relay',
              full_path: '/api/channels/relay/inbound',
              methods: ['POST'],
              public: true,
            },
          ],
          reload: { ok: true },
          pip_output: 'Successfully installed tai42-toolbox-0.1.0',
        },
      }),
    );
    const out = await client.installMarketplacePlugin({ ref: 'tai42/toolbox', version: '0.1.0' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/marketplace/install');
    expect(captured[0]?.body).toEqual({ ref: 'tai42/toolbox', version: '0.1.0' });
    expect(out.notes).toEqual(['config provider selected via TAI_CONFIG_MODE']);
    expect(out.advisories[0]?.id).toBe(7);
    // The mounted-route receipt is modelled: what was opened, where, and whether public.
    expect(out.routes[0]?.full_path).toBe('/api/channels/relay/inbound');
    expect(out.routes[0]?.public).toBe(true);
    // The un-modelled wire fields are stripped, not surfaced on the receipt.
    expect(out).not.toHaveProperty('package');
    expect(out).not.toHaveProperty('pip_output');
  });

  it('installMarketplacePlugin omits version from the body when not given', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { ref: 'tai42/toolbox', version: '0.1.0', advisories: [], notes: [], routes: [] },
      }),
    );
    await client.installMarketplacePlugin({ ref: 'tai42/toolbox' });
    expect(captured[0]?.body).toEqual({ ref: 'tai42/toolbox' });
  });

  it('installMarketplacePlugin carries env + secret_keys through to the request body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          ref: 'tai42/postgres-mcp',
          version: '1.0.0',
          advisories: [],
          notes: [],
          routes: [],
        },
      }),
    );
    await client.installMarketplacePlugin({
      ref: 'tai42/postgres-mcp',
      env: { DATABASE_URL: 'postgres://db' },
      secret_keys: ['DATABASE_URL'],
    });
    // The env values + secret marks ride the wire body, not just { ref }: the
    // install-time env-collection dialog satisfies required `!ENV` markers here.
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.body).toEqual({
      ref: 'tai42/postgres-mcp',
      env: { DATABASE_URL: 'postgres://db' },
      secret_keys: ['DATABASE_URL'],
    });
  });

  it('installMarketplacePlugin carries route_mounts + accept_public_routes through to the request body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { ref: 'acme/relay', version: '1.0.0', advisories: [], notes: [], routes: [] },
      }),
    );
    await client.installMarketplacePlugin({
      ref: 'acme/relay',
      route_mounts: { relay: 'channels/relay-2' },
      accept_public_routes: true,
    });
    // The chosen mount bases and the public-route consent ride the wire body: the
    // install dialog remaps a base and accepts the routes served without auth here.
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.body).toEqual({
      ref: 'acme/relay',
      route_mounts: { relay: 'channels/relay-2' },
      accept_public_routes: true,
    });
  });

  it('previewMarketplaceInstall POSTs the body and parses the resolved routes, collisions, and public rows', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          ref: 'acme/relay',
          version: '1.0.0',
          items: [
            {
              item: 'relay',
              kind: 'channel',
              base: 'channels/relay-2',
              default_base: 'channels/relay',
              routes: [
                {
                  path: '/inbound',
                  full_path: '/api/channels/relay-2/inbound',
                  methods: ['POST'],
                  public: true,
                },
              ],
            },
          ],
          collisions: [
            {
              item: 'relay',
              full_path: '/api/channels/relay-2/inbound',
              methods: ['POST'],
              conflict_owner: 'plugin:acme/other',
              conflict_path: '/api/channels/relay-2/inbound',
            },
          ],
          public_routes: [
            { item: 'relay', full_path: '/api/channels/relay-2/inbound', methods: ['POST'] },
          ],
          new_public_routes: [
            { item: 'relay', full_path: '/api/channels/relay-2/inbound', methods: ['POST'] },
          ],
          requires_public_acceptance: true,
        },
      }),
    );
    const out = await client.previewMarketplaceInstall({
      ref: 'acme/relay',
      route_mounts: { relay: 'channels/relay-2' },
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/marketplace/install/preview');
    expect(captured[0]?.body).toEqual({
      ref: 'acme/relay',
      route_mounts: { relay: 'channels/relay-2' },
    });
    expect(out.items[0]?.routes[0]?.full_path).toBe('/api/channels/relay-2/inbound');
    expect(out.collisions[0]?.conflict_owner).toBe('plugin:acme/other');
    expect(out.requires_public_acceptance).toBe(true);
  });

  it('throws ApiSchemaError LOUDLY on a drifting preview response (items not an array)', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          ref: 'acme/relay',
          version: '1.0.0',
          items: 'nope',
          collisions: [],
          public_routes: [],
          new_public_routes: [],
          requires_public_acceptance: false,
        },
      }),
    );
    await expect(client.previewMarketplaceInstall({ ref: 'acme/relay' })).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
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
      jsonResponse({
        data: { ref: 'tai42/toolbox', version: '0.2.0', advisories: [], notes: [], routes: [] },
      }),
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

  it('throws ApiSchemaError LOUDLY on a drifting search response (listings not an array)', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { listings: 'nope', total: 0, page: 1, page_size: 20 } }),
    );
    await expect(client.searchMarketplace()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
