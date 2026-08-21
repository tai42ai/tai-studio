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
  delivery: 'package',
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
  source: 'github',
  latest: {
    version: '0.1.0',
    contract_range: '>=0.1,<0.2',
    status: 'published',
    published_at: '2026-07-12T00:00:00Z',
    // The registry's plugin-detail `latest` carries NO per-version `delivery` and
    // its items carry NO `required_env`: delivery is derived from the listing's
    // package, and required-env rides the install preview (see the real-shape
    // pin below). Extra registry keys (artifact_ref/sha256/tag/spec) ride through
    // and are stripped by the non-strict schema.
    artifact_ref: 'https://wheels.example/tai42_toolbox-0.1.0-py3-none-any.whl',
    sha256: 'deadbeef',
    tag: null,
    items: [
      {
        kind: 'tool',
        name: 'generate_uuid',
        description: 'Generate a UUID.',
        tags: ['uuid'],
        group: null,
        module: 'tai42_toolbox.tools',
        routes: null,
      },
    ],
    spec: {
      name: 'toolbox',
      package: 'tai42-toolbox',
      provides: [{ kind: 'tool', name: 'generate_uuid' }],
    },
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
    // The registry detail carries NO per-version `delivery`: it is not in the schema
    // and the extra registry keys (delivery is not even sent; artifact_ref/sha256/
    // tag/spec/module ARE) ride through and are stripped by the non-strict schema.
    expect((out.latest as unknown as Record<string, unknown>).delivery).toBeUndefined();
    expect((out.latest as unknown as Record<string, unknown>).spec).toBeUndefined();
    // The registry item carries no `required_env` — it parses as `undefined`
    // (required-env is server-computed and rides the install preview, not the detail).
    expect(out.latest?.items[0]?.required_env).toBeUndefined();
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
          required_env: [
            { name: 'ACME_CLIENT_ID', secret: false },
            { name: 'ACME_CLIENT_SECRET', secret: true },
          ],
          missing_env: ['ACME_CLIENT_SECRET'],
          delivery: 'descriptor',
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
    // The server-computed env picture rides the preview: the derived secret-ness of
    // every required var, the bare missing names, and how the plugin is delivered.
    expect(out.required_env).toEqual([
      { name: 'ACME_CLIENT_ID', secret: false },
      { name: 'ACME_CLIENT_SECRET', secret: true },
    ]);
    expect(out.missing_env).toEqual(['ACME_CLIENT_SECRET']);
    expect(out.delivery).toBe('descriptor');
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

// The exact bodies the RUNNING skeleton serves, copied verbatim from a live
// browser e2e trace (the marketplace arc installing tai42/e2e-beta 0.1.0). These
// pin the studio schemas to the TRUE server shape — not to a hand-written fixture
// that could drift with the schema — so a schema that stops matching what the
// server really sends fails HERE, in a unit test, instead of only in the live UI.
describe('marketplace client — real skeleton response shapes', () => {
  // GET /api/marketplace/installed after the UI install of the packaged beta plugin.
  const REAL_INSTALLED = {
    installed: [
      {
        ref: 'tai42/e2e-beta',
        version: '0.1.0',
        source: 'pypi',
        delivery: 'package',
        installed_at: '2026-08-21T19:29:07.379310+00:00',
        latest: '0.1.0',
        update_available: false,
        incompatible_newer: null,
        missing_upstream: false,
        compat: { status: 'compatible', reason: null },
        items: [
          { kind: 'tool', name: 'e2e_market_beta_probe' },
          { kind: 'extension', name: 'beta_marker' },
        ],
        route_mounts: {},
      },
    ],
    quarantined: [],
  };

  // GET /api/marketplace/plugins/tai42/e2e-beta — a registry passthrough. Its
  // `latest` carries a full `spec` plus artifact_ref/sha256/tag and per-item
  // module/routes, and carries NEITHER a per-version `delivery` NOR any per-item
  // `required_env` (both are server-computed and ride the installed rows / install
  // preview, never this detail body).
  const REAL_DETAIL = {
    namespace: 'tai42',
    name: 'e2e-beta',
    display_name: null,
    package: 'tai-e2e-market-beta',
    source: 'pypi',
    repository_url: null,
    homepage_url: null,
    license: 'Apache-2.0',
    description:
      'Installable marketplace fixture plugin: a probe tool plus a wrapper tool extension.',
    readme_md: '<h1>TAI42 Toolbox</h1>',
    categories: ['productivity'],
    tags: ['probe', 'beta'],
    pricing: 'free',
    premium: false,
    status: 'active',
    created_at: '2026-08-21T19:23:14.758740Z',
    updated_at: '2026-08-21T19:23:14.758740Z',
    trust_tier: 'official',
    ref: 'tai42/e2e-beta',
    icon_url: null,
    downloads: 0,
    latest: {
      version: '0.1.0',
      contract_range: '<4,>=3.0',
      artifact_ref: 'http://127.0.0.1/wheels/tai_e2e_market_beta-0.1.0-py3-none-any.whl',
      sha256: '3faece31fa35783d57b56bcdaded8018034ea85462a26ae26c57872e611aa7a9',
      tag: null,
      status: 'published',
      published_at: '2026-08-21T19:23:14.764438Z',
      spec: { name: 'e2e-beta', package: 'tai-e2e-market-beta', provides: [] },
      items: [
        {
          kind: 'tool',
          name: 'e2e_market_beta_probe',
          module: 'tai_e2e_market_beta.tools',
          description: 'Return a fixed marker payload identifying the beta fixture.',
          tags: ['probe'],
          group: 'probe-suite',
          routes: null,
        },
        {
          kind: 'extension',
          name: 'beta_marker',
          module: 'tai_e2e_market_beta.extensions',
          description: 'Branch a tool into a variant that stamps a beta marker onto its result.',
          tags: ['beta'],
          group: 'probe-suite',
          routes: null,
        },
      ],
    },
    versions: [
      {
        version: '0.1.0',
        contract_range: '<4,>=3.0',
        status: 'published',
        published_at: '2026-08-21T19:23:14.764438Z',
      },
    ],
  };

  it('parses the real /api/marketplace/installed body so the Installed badge renders', async () => {
    const { client } = harness(() => jsonResponse({ data: REAL_INSTALLED }));
    const out = await client.listInstalledMarketplacePlugins();
    const row = out.installed[0];
    expect(row?.ref).toBe('tai42/e2e-beta');
    expect(row?.version).toBe('0.1.0');
    expect(row?.delivery).toBe('package');
    expect(row?.source).toBe('pypi');
    expect(row?.compat).toEqual({ status: 'compatible', reason: null });
    expect(row?.items).toEqual([
      { kind: 'tool', name: 'e2e_market_beta_probe' },
      { kind: 'extension', name: 'beta_marker' },
    ]);
    expect(out.quarantined).toEqual([]);
  });

  it('parses the real /api/marketplace/plugins detail body (no latest.delivery, items without required_env)', async () => {
    const { client } = harness(() => jsonResponse({ data: REAL_DETAIL }));
    const out = await client.getMarketplacePlugin('tai42', 'e2e-beta');
    expect(out.package).toBe('tai-e2e-market-beta');
    expect(out.latest?.version).toBe('0.1.0');
    // The wire never sends these on the detail; the non-strict schema strips the
    // extra registry keys and the item's required_env DEFAULTS to [].
    expect((out.latest as unknown as Record<string, unknown>).delivery).toBeUndefined();
    expect((out.latest as unknown as Record<string, unknown>).spec).toBeUndefined();
    expect(out.latest?.items[0]?.name).toBe('e2e_market_beta_probe');
    expect(out.latest?.items[0]?.required_env).toBeUndefined();
    expect(out.latest?.items[1]?.required_env).toBeUndefined();
  });
});
