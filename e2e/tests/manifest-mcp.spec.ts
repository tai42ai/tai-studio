/**
 * MCP-config dirty-edit guard on the Manifest screen, against the LIVE boot skeleton
 * with the MCP config endpoints stubbed via `page.route` so the editor renders a
 * known config; and a connector-managed entry rendered read-only in that editor.
 *
 * The MCP config editor lives in the Manifest screen's "MCP servers" block; the guard
 * is the ROUTE one: an unsaved edit in the config editor must
 * confirm before a navigation tears the page down. The editor reports its dirtiness
 * (`useRegisterDirty`) to the `DirtyGuardBoundary` the section mounts, which arms the
 * shell's navigation guard — so leaving via a nav link prompts. Declining (Cancel)
 * keeps the edit; confirming (Discard changes) navigates away.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';

needs();

/** The dirty-guard discard prompt (the shared ConfirmDialog's body copy). */
const DISCARD_PROMPT = 'This editor has unsaved changes. Leaving now discards them.';

async function stubMcp(page: Page): Promise<void> {
  await seedCredential(page);
  // The MCP config editor seeds from the PRESERVED read (`!ENV` markers intact).
  await page.route(
    (url) => url.pathname === '/api/manifest/preserved',
    async (route) => {
      await route.fulfill({
        json: {
          data: {
            mcp: [],
            user_tools: [],
            extension_settings: {
              extensions_modules: [],
              backend_module: null,
              tools: [],
              mcp: [],
              api_tools: {},
            },
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
      await route.fulfill({ json: { data: { bound: {}, failed: [], health: {} } } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/extensions',
    async (route) => {
      await route.fulfill({ json: { data: [] } });
    },
  );
}

/** Open the config editor's JSON view and dirty its buffer. */
async function dirtyTheEditor(page: Page): Promise<void> {
  await page.goto('/manifest');
  await page
    .getByRole('group', { name: 'Config view' })
    .getByRole('button', { name: 'JSON' })
    .click();
  const editor = page.getByLabel('MCP config');
  await expect(editor).toBeVisible();
  await editor.fill('[{"e2eDirtyMarker":true}]');
}

test('navigating away from a dirty MCP editor prompts, and Cancel keeps the edit', async ({
  page,
}) => {
  await stubMcp(page);
  await dirtyTheEditor(page);

  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Tools' })
    .click();

  // The guard holds the navigation behind the shared confirm; declining keeps us on
  // the Manifest screen with the edit intact.
  await expect(page.getByText(DISCARD_PROMPT)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/manifest/);
  await expect(page.getByLabel('MCP config')).toHaveValue('[{"e2eDirtyMarker":true}]');
});

test('confirming the discard navigates away from the dirty MCP editor', async ({ page }) => {
  await stubMcp(page);
  await dirtyTheEditor(page);

  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Tools' })
    .click();

  // Confirming the discard lets the same navigation through to the Tools page.
  await expect(page.getByText(DISCARD_PROMPT)).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/tools/);
});

test('a connector-managed MCP entry renders read-only in the config form', async ({ page }) => {
  // The managed entry renders read-only in the Manifest screen's MCP editor.
  await seedCredential(page);
  const manifestBody = {
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
      extension_settings: {
        extensions_modules: [],
        backend_module: null,
        tools: [],
        mcp: [],
        api_tools: {},
      },
    },
  };
  await page.route(
    (url) => url.pathname === '/api/manifest',
    async (route) => {
      await route.fulfill({ json: manifestBody });
    },
  );
  // The MCP config editor seeds from the PRESERVED read, a distinct endpoint from
  // the resolved `/api/manifest`; the managed entry must be present in both.
  await page.route(
    (url) => url.pathname === '/api/manifest/preserved',
    async (route) => {
      await route.fulfill({ json: manifestBody });
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
      await route.fulfill({ json: { data: { bound: {}, failed: [], health: {} } } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/extensions',
    async (route) => {
      await route.fulfill({ json: { data: [] } });
    },
  );

  await page.goto('/manifest');

  // The managed entry is labelled Managed, explains its owning connection, and its
  // Remove control is disabled — the whole entry is read-only (disconnect to change it).
  await expect(page.getByText('acme-mcp')).toBeVisible();
  await expect(page.getByText('Managed', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('note').filter({ hasText: 'Managed by connection conn-1' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove server 1' })).toBeDisabled();
});
