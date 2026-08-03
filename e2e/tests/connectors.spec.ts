/**
 * Connectors (PLAN_6), against the LIVE boot skeleton with the connector read/write
 * endpoints stubbed via `page.route` (the OAuth surface has no seedable fixture).
 *
 * Legs: a popup-blocked sign-in falls back to a full-page redirect (stashing the
 * return path); the redirect-resume completes the exchange via the forwarded
 * state/code and strips them from the URL; a `kind:'none'` connection hides
 * Reconnect; a disconnect whose upstream revoke FAILED surfaces the warning and
 * stays on the page; and a connector-MANAGED MCP entry renders read-only.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

const PROVIDERS_PATH = '/api/connectors/providers';
const CONNECTIONS_PATH = '/api/connectors/connections';

const PROVIDERS = {
  providers: [
    {
      id: 'acme',
      display_name: 'Acme',
      description: 'Acme provider',
      icon_url: '',
      kind: 'oauth',
      origin: 'system',
      category: 'crm',
      sub_services: [],
      config_fields: [],
    },
  ],
  categories: [{ id: 'crm', display_name: 'CRM', sort_order: 1 }],
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
      await route.fulfill({ json: { data: { items: [], total: 0 } } });
    },
  );
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
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  const dialog = page.getByRole('dialog');
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
        data: { kind: 'success', connection_id: 'conn-1', return_url: '/connectors', fanout: null },
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

test('a connector-managed MCP entry renders read-only in the config form', async ({ page }) => {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/manifest',
    async (route) => {
      await route.fulfill({
        json: {
          data: {
            mcp: [
              {
                title: 'acme-mcp',
                transport: 'http',
                include: ['acme.search'],
                managed: { connection_id: 'conn-1', provider_id: 'acme', sub_service: 'search' },
              },
            ],
            user_tools: [],
          },
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/mcp-config/schema',
    async (route) => {
      await route.fulfill({ json: { data: { type: 'object', properties: {} } } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/mcp-status',
    async (route) => {
      await route.fulfill({ json: { data: { bound: {}, failed: [] } } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/extensions',
    async (route) => {
      await route.fulfill({ json: { data: [] } });
    },
  );

  await page.goto('/manifest');
  await page.getByRole('tab', { name: 'MCP', exact: true }).click();

  // The managed entry is labelled Managed, explains its owning connection, and its
  // Remove control is disabled — the whole entry is read-only (disconnect to change it).
  await expect(page.getByText('acme-mcp')).toBeVisible();
  await expect(page.getByText('Managed', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('note').filter({ hasText: 'Managed by connection conn-1' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove server 1' })).toBeDisabled();
});
