/**
 * Connectors, against the LIVE boot skeleton with the connector read/write
 * endpoints stubbed via `page.route` (the OAuth surface has no seedable fixture).
 *
 * Legs: a popup-blocked sign-in falls back to a full-page redirect (stashing the
 * return path); the redirect-resume completes the exchange via the forwarded
 * state/code and strips them from the URL; a `kind:'none'` connection hides
 * Reconnect; a disconnect whose upstream revoke FAILED surfaces the warning and
 * stays on the page; an MCP server is added by its address from the header's "Add a
 * custom server" (look-up, review, add) and lands in the connect flow; a removable
 * provider is removed from its entry's actions menu after its confirm; and the
 * connect flow (Connect, Pick tools, Done) runs for a new provider, for a second
 * account of a connected provider, and for a marketplace listing installed inside
 * the flow.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { ADD_SERVER_LOOKUP, seedCredential } from './helpers';

needs();

const PROVIDERS_PATH = '/api/connectors/providers';
const CONNECTIONS_PATH = '/api/connectors/connections';

const PROVIDERS = {
  providers: [
    {
      id: 'acme',
      display_name: 'Acme',
      description: 'Acme provider',
      icon_url: 'https://cdn.example/acme.png',
      kind: 'oauth',
      origin: 'system',
      category: 'tools',
      sub_services: [],
      config_fields: [],
    },
  ],
  categories: [{ id: 'tools', display_name: 'Tools', sort_order: 1 }],
};

/** A provider added by its address: no icon, removable, its client registered automatically. */
const ADDED_PROVIDER = {
  id: 'remote_files',
  display_name: 'Remote files',
  description: '',
  icon_url: null,
  kind: 'oauth',
  origin: 'community',
  category: 'tools',
  sub_services: [{ id: 'default', display_name: 'Remote files', description: '', scopes: [] }],
  config_fields: [],
  removable: true,
  client_source: 'dynamic',
};

/** A UI-safe connection record with the given kind. */
function connection(kind: 'oauth' | 'none') {
  return {
    connection_id: 'conn-1',
    provider_id: 'acme',
    alias: 'work-account',
    kind,
    account_identity: 'user@acme',
    enabled_sub_services: [],
    granted_scopes: [],
    unreachable_sub_services: [],
    auth_health_state: 'healthy',
    created_at: '2026-08-01T00:00:00.000Z',
  };
}

async function stubCatalog(page: Page): Promise<void> {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === PROVIDERS_PATH,
    async (route) => {
      await route.fulfill({ json: { data: PROVIDERS } });
    },
  );
  await page.route(
    (url) => url.pathname === CONNECTIONS_PATH,
    async (route) => {
      await route.fulfill({ json: { data: { items: [], total: 0, unhealthy: 0 } } });
    },
  );
}

/** The directory entry keyed `key`: its list row (the default view). */
function entry(page: Page, key: string): Locator {
  return page.getByRole('row').filter({ has: page.locator(`[data-directory-row="${key}"]`) });
}

test('a blocked popup falls back to a full-page redirect and stashes the return path', async ({
  page,
}) => {
  await stubCatalog(page);
  // Force the popup path to fail so the redirect fallback is exercised.
  await page.addInitScript(() => {
    window.open = () => null;
  });

  // `startConnect` hands back an OAuth authorize URL on the app's own origin so the
  // fallback navigation lands somewhere this test controls (not a real provider).
  await page.route(`${CONNECTIONS_PATH}/start`, async (route) => {
    const origin = new URL(route.request().url()).origin;
    await route.fulfill({
      json: { data: { flow_id: 'flow-1', authorize_url: `${origin}/e2e-oauth-authorize` } },
    });
  });
  await page.route('**/e2e-oauth-authorize', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>authorize</title>',
    });
  });

  await page.goto('/connectors');
  await entry(page, 'provider:acme').getByRole('button', { name: 'Connect', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect Acme' });
  await dialog.getByLabel('Alias').fill('work-account');
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click();

  // The whole tab redirected to the authorize URL, and the in-app return path was
  // stashed so the callback page can forward the provider's result home.
  await page.waitForURL('**/e2e-oauth-authorize**');
  const stashed = await page.evaluate(() =>
    window.sessionStorage.getItem('tai:oauth:redirect-return'),
  );
  expect(stashed).toBe('/connectors');
});

test('the redirect-resume completes the exchange via the forwarded state and strips it from the URL', async ({
  page,
}) => {
  await stubCatalog(page);
  await page.route('**/api/connectors/oauth/complete', async (route) => {
    await route.fulfill({
      json: {
        data: {
          kind: 'success',
          connection_id: 'conn-1',
          return_url: '/connectors',
          fanout: { mode: 'local-only', note: 'only this worker reloaded' },
        },
      },
    });
  });

  // The callback page forwards the provider's result on the return URL's query.
  await page.goto('/connectors?tai_oauth_state=state-1&tai_oauth_code=code-1');

  // The authed exchange settles into the success notice, and the single-use state is
  // scrubbed from the URL so a reload never re-fires it.
  await expect(page.getByText('Connected successfully.')).toBeVisible();
  await expect(page).not.toHaveURL(/tai_oauth_state/);
  await expect(page).not.toHaveURL(/tai_oauth_code/);
});

test("a kind:'none' connection hides Reconnect but still offers Disconnect", async ({ page }) => {
  await stubCatalog(page);
  await page.route(`${CONNECTIONS_PATH}/conn-1`, async (route) => {
    await route.fulfill({ json: { data: connection('none') } });
  });

  await page.goto('/connectors?connection=conn-1');
  await expect(page.getByRole('heading', { name: 'work-account' })).toBeVisible();
  // A no-auth connection has no grant to renew, so Reconnect is withdrawn.
  await expect(page.getByRole('button', { name: 'Reconnect' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
});

test('a disconnect whose upstream revoke FAILED surfaces the warning and stays on the page', async ({
  page,
}) => {
  await stubCatalog(page);
  await page.route(`${CONNECTIONS_PATH}/conn-1`, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        json: {
          data: {
            connection_id: 'conn-1',
            upstream_revoke_outcome: 'failed',
            upstream_revoke_status: 502,
            removed_manifest_entries: [],
            fanout: null,
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { data: connection('oauth') } });
  });

  await page.goto('/connectors?connection=conn-1');
  await page.getByRole('button', { name: 'Disconnect' }).click();
  // Confirm inside the dialog.
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();

  // The view stays open with a loud warning that access may still be live upstream.
  const warning = page.getByRole('alert').filter({ hasText: 'Upstream access may still be live' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('502');
  await expect(page).toHaveURL(/connection=conn-1/);
});

/** Serve the catalog from `current()` on GET; hand any other method to `write`. */
async function stubProviders(
  page: Page,
  current: () => unknown[],
  write: (method: string, path: string) => unknown,
): Promise<void> {
  await page.route(
    (url) => url.pathname === PROVIDERS_PATH || url.pathname.startsWith(`${PROVIDERS_PATH}/`),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'GET' && path === PROVIDERS_PATH) {
        await route.fulfill({
          json: { data: { providers: current(), categories: PROVIDERS.categories } },
        });
        return;
      }
      await route.fulfill({ json: { data: write(request.method(), path) } });
    },
  );
}

test('an MCP server added by its address lands in the connect flow', async ({ page }) => {
  await stubCatalog(page);
  let providers: unknown[] = [...PROVIDERS.providers];
  const calls: string[] = [];
  await stubProviders(
    page,
    () => providers,
    (method, path) => {
      calls.push(`${method} ${path}`);
      if (path === `${PROVIDERS_PATH}/discover`) return ADD_SERVER_LOOKUP;
      providers = [...providers, ADDED_PROVIDER];
      return { provider: ADDED_PROVIDER, fanout: null };
    },
  );

  await page.goto('/connectors');
  await page.getByRole('button', { name: 'Add a custom server' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add MCP server' });
  await dialog.getByLabel('Server address').fill('https://mcp.example.com/mcp');
  await dialog.getByRole('button', { name: 'Look up' }).click();

  // The review step shows what the look-up found and prefills the name and identifier.
  await expect(dialog.getByText('login.example.com')).toBeVisible();
  await expect(dialog.getByText('Automatic')).toBeVisible();
  await expect(dialog.getByLabel('Name')).toHaveValue('Remote files');
  await expect(dialog.getByLabel('Identifier')).toHaveValue('remote_files');
  await dialog.getByRole('button', { name: 'Add server' }).click();

  // The server registers apps by itself, so the connect flow opens for it.
  const flow = page.getByRole('dialog', { name: 'Connect Remote files' });
  await expect(flow).toBeVisible();
  expect(calls).toEqual([`POST ${PROVIDERS_PATH}/discover`, `POST ${PROVIDERS_PATH}`]);
  await flow.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('[data-directory-row="provider:remote_files"]')).toBeVisible();
});

test('a removable provider is removed after its confirm', async ({ page }) => {
  await stubCatalog(page);
  let providers: unknown[] = [...PROVIDERS.providers, ADDED_PROVIDER];
  const calls: string[] = [];
  await stubProviders(
    page,
    () => providers,
    (method, path) => {
      calls.push(`${method} ${path}`);
      providers = providers.filter((p) => p !== ADDED_PROVIDER);
      return { provider_id: 'remote_files', removed_clients: 1, fanout: null };
    },
  );

  await page.goto('/connectors');
  await entry(page, 'provider:remote_files')
    .getByRole('button', { name: 'Actions for Remote files' })
    .click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove this server?' });
  await expect(dialog).toContainText(
    'This removes “Remote files” from the list. Disconnect its accounts first.',
  );
  await dialog.getByRole('button', { name: 'Remove' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-directory-row="provider:remote_files"]')).toHaveCount(0);
  expect(calls).toEqual([`DELETE ${PROVIDERS_PATH}/remote_files`]);
});

/** A no-auth provider with one sub-service: its connect lands a connection at once. */
const FILES_PROVIDER = {
  id: 'acme_files',
  display_name: 'Acme files',
  description: 'Files provider',
  icon_url: null,
  kind: 'none',
  origin: 'system',
  category: 'tools',
  sub_services: [{ id: 'default', display_name: 'Files', description: '', scopes: [] }],
  config_fields: [],
};

/** A connection to the files provider, its MCP entry titled `acme-files-<alias>`. */
function filesConnection(alias: string) {
  return {
    ...connection('none'),
    connection_id: `conn-${alias}`,
    provider_id: FILES_PROVIDER.id,
    alias,
    enabled_sub_services: ['default'],
  };
}

/** The preserved-manifest entry a connection (or an install) adds, titled `title`. */
function mcpEntry(title: string, connectionId: string | null) {
  return {
    title,
    config: { transport: 'streamable-http', url: 'https://mcp.example.com/mcp' },
    include: [],
    exclude: [],
    managed:
      connectionId === null
        ? null
        : { connection_id: connectionId, provider_id: FILES_PROVIDER.id, sub_service: 'default' },
  };
}

/** Two advertised tools, both mounted by an entry with no tool filter. */
function advertised(title: string) {
  const tool = (name: string) => ({
    name,
    title: null,
    description: null,
    bound: true,
    selected: true,
    unbound_reason: null,
  });
  return {
    title,
    include: [],
    exclude: [],
    tools: [tool('files.read'), tool('files.write')],
    unadvertised: [],
  };
}

/** The mutable state behind the directory stubs; each write test edits it. */
interface DirectoryState {
  providers: unknown[];
  connections: unknown[];
  entries: unknown[];
  bound: Record<string, string[]>;
  listings: unknown[];
}

/** The tool-filter writes the flow sent, by entry title. */
type FilterWrites = { title: string; body: unknown }[];

/**
 * Stub every read the directory and the connect flow make from `state`, and record
 * the tool-filter writes: the providers, the connections, the preserved manifest,
 * the live MCP status, the marketplace search and installed inventory, a server's
 * advertised tools and its tool-filter write.
 */
async function stubDirectory(page: Page, state: DirectoryState): Promise<FilterWrites> {
  await seedCredential(page);
  const writes: FilterWrites = [];
  const json = (data: unknown) => ({ json: { data } });
  await page.route(
    (url) => url.pathname === PROVIDERS_PATH,
    async (route) => {
      await route.fulfill(json({ providers: state.providers, categories: PROVIDERS.categories }));
    },
  );
  await page.route(
    (url) => url.pathname === CONNECTIONS_PATH,
    async (route) => {
      await route.fulfill(
        json({ items: state.connections, total: state.connections.length, unhealthy: 0 }),
      );
    },
  );
  await page.route(
    (url) => url.pathname === '/api/manifest/preserved',
    async (route) => {
      await route.fulfill(
        json({
          mcp: state.entries,
          user_tools: [],
          extension_settings: {
            extensions_modules: [],
            backend_module: null,
            tools: [],
            mcp: [],
            api_tools: {},
          },
        }),
      );
    },
  );
  await page.route(
    (url) => url.pathname === '/api/mcp-status',
    async (route) => {
      await route.fulfill(json({ bound: state.bound, failed: [], health: {} }));
    },
  );
  await page.route(
    (url) => url.pathname === '/api/marketplace/search',
    async (route) => {
      const kind = new URL(route.request().url()).searchParams.get('kind');
      const listings = state.listings.filter((listing) =>
        (listing as { kinds: { kind: string }[] }).kinds.some((k) => k.kind === kind),
      );
      await route.fulfill(json({ listings, total: listings.length, page: 1, page_size: 20 }));
    },
  );
  await page.route(
    (url) => url.pathname === '/api/marketplace/installed',
    async (route) => {
      await route.fulfill(json({ installed: [] }));
    },
  );
  await page.route(
    (url) => /^\/api\/mcp-status\/[^/]+\/advertised-tools$/.test(url.pathname),
    async (route) => {
      const title = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[3] ?? '');
      await route.fulfill(json(advertised(title)));
    },
  );
  await page.route(
    (url) => /^\/api\/mcp-config\/entries\/[^/]+\/tool-filter$/.test(url.pathname),
    async (route) => {
      const title = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[4] ?? '');
      writes.push({ title, body: route.request().postDataJSON() });
      await route.fulfill(
        json({
          status: 'reloaded',
          env_keys: 0,
          recycle: null,
          awaiting_respawn: [],
          span_release_error: null,
          fanout: { mode: 'local-only', note: 'only this worker reloaded' },
        }),
      );
    },
  );
  return writes;
}

/**
 * Answer the no-auth connect start for `alias`: the connection and its MCP entry
 * land in `state`, and the reply names the new connection.
 */
async function stubNoAuthStart(page: Page, state: DirectoryState): Promise<void> {
  await page.route(`**${CONNECTIONS_PATH}/start`, async (route) => {
    const { alias } = route.request().postDataJSON() as { alias: string };
    const title = `acme-files-${alias}`;
    state.connections = [...state.connections, filesConnection(alias)];
    state.entries = [...state.entries, mcpEntry(title, `conn-${alias}`)];
    state.bound = { ...state.bound, [title]: ['files.read', 'files.write'] };
    await route.fulfill({
      json: {
        data: {
          connection_id: `conn-${alias}`,
          added_manifest_entries: [title],
          fanout: null,
          span_release_error: null,
        },
      },
    });
  });
}

/** The Pick tools switch; while it is on, the step lists no single tools. */
function mountEvery(flow: Locator): Locator {
  return flow.getByRole('checkbox', {
    name: 'Mount every tool, including tools the server adds later',
  });
}

/** In the open flow, turn mount every off, keep `files.read` only and save the pick. */
async function pickReadOnly(flow: Locator): Promise<void> {
  await mountEvery(flow).click();
  await expect(flow.getByRole('checkbox', { name: 'files.read' })).toBeChecked();
  await flow.getByRole('checkbox', { name: 'files.write' }).click();
  await flow.getByRole('button', { name: 'Save' }).click();
}

test('a provider connects and its tools are picked', async ({ page }) => {
  const state: DirectoryState = {
    providers: [FILES_PROVIDER],
    connections: [],
    entries: [],
    bound: {},
    listings: [],
  };
  const writes = await stubDirectory(page, state);
  await stubNoAuthStart(page, state);

  await page.goto('/connectors');
  await entry(page, 'provider:acme_files').getByRole('button', { name: 'Connect' }).click();
  const flow = page.getByRole('dialog', { name: 'Connect Acme files' });
  await flow.getByLabel('Alias').fill('work');
  await flow.getByRole('button', { name: 'Connect', exact: true }).click();

  // The new connection's entry arrives with the manifest re-read, and Pick tools opens
  // on it with every tool mounted.
  await expect(mountEvery(flow)).toBeChecked();
  await pickReadOnly(flow);

  await expect(flow.getByRole('heading', { name: 'Acme files is connected.' })).toBeVisible();
  expect(writes).toEqual([
    { title: 'acme-files-work', body: { include: ['files.read'], exclude: [] } },
  ]);
});

test('a connected provider adds a second account and picks tools for one of its two connections', async ({
  page,
}) => {
  const state: DirectoryState = {
    providers: [FILES_PROVIDER],
    connections: [filesConnection('work')],
    entries: [mcpEntry('acme-files-work', 'conn-work')],
    bound: { 'acme-files-work': ['files.read', 'files.write'] },
    listings: [],
  };
  const writes = await stubDirectory(page, state);
  await stubNoAuthStart(page, state);

  await page.goto('/connectors');
  await entry(page, 'provider:acme_files')
    .getByRole('button', { name: 'Add another account' })
    .click();
  const flow = page.getByRole('dialog', { name: 'Connect Acme files' });
  await flow.getByLabel('Alias').fill('personal');
  await flow.getByRole('button', { name: 'Connect', exact: true }).click();

  // Pick tools covers the new connection's entry alone; the first account's entry is
  // left as it is.
  await expect(mountEvery(flow)).toBeChecked();
  await pickReadOnly(flow);
  await expect(flow.getByRole('heading', { name: 'Acme files is connected.' })).toBeVisible();
  expect(writes).toEqual([
    { title: 'acme-files-personal', body: { include: ['files.read'], exclude: [] } },
  ]);

  // Both accounts now show on the provider's entry, each with its own Pick tools.
  await flow.getByRole('button', { name: 'Close' }).click();
  const accounts = page.getByRole('list', { name: 'Connections to Acme files' });
  await expect(accounts.getByRole('button', { name: 'Pick tools for work' })).toBeVisible();
  await expect(accounts.getByRole('button', { name: 'Pick tools for personal' })).toBeVisible();
});

/** A marketplace listing of one MCP server, `acme_mail`. */
const MAIL_LISTING = {
  ref: 'acme/mail',
  namespace: 'acme',
  name: 'mail',
  display_name: 'Acme Mail',
  icon_url: null,
  package: 'acme-mail',
  description: 'Send and read mail.',
  categories: [],
  tags: [],
  trust_tier: 'community',
  pricing: 'free',
  premium: false,
  latest_version: '1.0.0',
  downloads: 0,
  updated_at: '2026-07-01T00:00:00Z',
  kinds: [{ kind: 'mcp-server', count: 1, names: ['acme_mail'] }],
  groups: [],
};

test('a marketplace listing installs inside the flow and reaches Pick tools', async ({ page }) => {
  const state: DirectoryState = {
    providers: [],
    connections: [],
    entries: [],
    bound: {},
    listings: [MAIL_LISTING],
  };
  await stubDirectory(page, state);
  await page.route(
    (url) => url.pathname === '/api/marketplace/plugins/acme/mail',
    async (route) => {
      await route.fulfill({
        json: {
          data: {
            namespace: 'acme',
            name: 'mail',
            display_name: 'Acme Mail',
            icon_url: null,
            package: 'acme-mail',
            source: 'pypi',
            description: 'Send and read mail.',
            readme_md: null,
            license: null,
            homepage_url: null,
            repository_url: null,
            categories: [],
            tags: [],
            trust_tier: 'community',
            pricing: 'free',
            premium: false,
            downloads: 0,
            latest: {
              version: '1.0.0',
              contract_range: '>=1.0',
              status: 'published',
              published_at: '2026-07-01T00:00:00Z',
              items: [
                { kind: 'mcp-server', name: 'acme_mail', description: '', tags: [], group: null },
              ],
            },
            versions: [],
          },
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/marketplace/install/preview',
    async (route) => {
      await route.fulfill({
        json: {
          data: {
            ref: 'acme/mail',
            version: '1.0.0',
            items: [],
            collisions: [],
            public_routes: [],
            new_public_routes: [],
            requires_public_acceptance: false,
            required_env: [],
            missing_env: [],
            delivery: 'package',
          },
        },
      });
    },
  );
  const installs: unknown[] = [];
  await page.route(
    (url) => url.pathname === '/api/marketplace/install',
    async (route) => {
      installs.push(route.request().postDataJSON());
      // The install adds the server's entry; the live status lists it as bound.
      state.entries = [mcpEntry('acme_mail', null)];
      state.bound = { acme_mail: ['files.read', 'files.write'] };
      await route.fulfill({
        json: {
          data: {
            ref: 'acme/mail',
            version: '1.0.0',
            notes: [],
            advisories: [],
            routes: [],
            package: null,
            pip_output: null,
            reload: {
              span_release_error: null,
              status: 'reloaded',
              env_keys: 0,
              recycle: null,
              awaiting_respawn: [],
              fanout: { mode: 'local-only', note: 'only this worker reloaded' },
            },
          },
        },
      });
    },
  );

  await page.goto('/connectors');
  await entry(page, 'listing:acme/mail').getByRole('button', { name: 'Connect' }).click();
  const flow = page.getByRole('dialog', { name: 'Connect Acme Mail' });
  const form = flow.getByRole('form', { name: 'Install plugin' });
  const install = form.getByRole('button', { name: 'Install' });
  await expect(install).toBeEnabled();
  await install.click();

  // Once the status read lists the installed server, the flow moves on to Pick tools
  // for it, which lists the tools the server advertises.
  await mountEvery(flow).click();
  await expect(flow.getByRole('checkbox', { name: 'files.read' })).toBeVisible();
  expect(installs).toHaveLength(1);
});
