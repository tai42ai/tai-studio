/**
 * MCP-config dirty-edit guard on the Connectors page, against the LIVE boot skeleton
 * with the MCP config endpoints stubbed via `page.route` so the editor renders a
 * known config.
 *
 * The MCP config surface moved off the manifest page's tabs onto the unified
 * Connectors page (its MCP servers section). There are no tabs to switch anymore, so
 * the guard that survives is the ROUTE one: an unsaved edit in the config editor must
 * confirm before a navigation tears the page down. The editor reports its dirtiness
 * (`useRegisterDirty`) to the `DirtyGuardBoundary` the section mounts, which arms the
 * shell's navigation guard — so leaving via a nav link prompts. Declining (Cancel)
 * keeps the edit; confirming (Discard changes) navigates away.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

/** The dirty-guard discard prompt (the shared ConfirmDialog's body copy). */
const DISCARD_PROMPT = 'This editor has unsaved changes. Leaving now discards them.';

async function stubMcp(page: Page): Promise<void> {
  await seedCredential(page);
  // The Connectors page also lists providers + connections; stub them empty so the
  // page renders deterministically and the MCP section paints beside them.
  await page.route(
    (url) => url.pathname === '/api/connectors/providers',
    async (route) => {
      await route.fulfill({ json: { data: { providers: [], categories: [] } } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/connectors/connections',
    async (route) => {
      await route.fulfill({ json: { data: { items: [], total: 0 } } });
    },
  );
  // The MCP config editor seeds from the PRESERVED read (`!ENV` markers intact).
  await page.route(
    (url) => url.pathname === '/api/manifest/preserved',
    async (route) => {
      await route.fulfill({ json: { data: { mcp: [], user_tools: [] } } });
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
}

/** Open the config editor's JSON view and dirty its buffer. */
async function dirtyTheEditor(page: Page): Promise<void> {
  await page.goto('/connectors');
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
  // the Connectors page with the edit intact.
  await expect(page.getByText(DISCARD_PROMPT)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/connectors/);
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
