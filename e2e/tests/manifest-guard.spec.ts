/**
 * Manifest dirty-edit guard (PLAN_4/6), against the LIVE boot skeleton with the MCP
 * config endpoints stubbed via `page.route` so the editor renders a known config.
 *
 * The MCP config panel unmounts on a tab switch, so a dirty editor must confirm
 * before it is torn down: switching TABS prompts, and NAVIGATING away (an AppLink)
 * prompts through the same guard. Both are held (Cancel) so the edit survives.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

/** The GuardedTabs discard prompt (distinct from the view-switch dialog's copy). */
const DISCARD_PROMPT = 'This editor has unsaved changes. Leaving now discards them.';

async function stubMcp(page: Page): Promise<void> {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/manifest',
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

/** Open MCP tab, switch to the JSON view, and dirty the config buffer. */
async function dirtyTheEditor(page: Page): Promise<void> {
  await page.goto('/manifest');
  await page.getByRole('tab', { name: 'MCP', exact: true }).click();
  await page
    .getByRole('group', { name: 'Config view' })
    .getByRole('button', { name: 'JSON' })
    .click();
  const editor = page.getByLabel('MCP config');
  await expect(editor).toBeVisible();
  await editor.fill('[{"e2eDirtyMarker":true}]');
}

test('switching tabs away from a dirty MCP editor prompts, and Cancel keeps the edit', async ({
  page,
}) => {
  await stubMcp(page);
  await dirtyTheEditor(page);

  await page.getByRole('tab', { name: 'Manifest' }).click();

  // The guard holds the switch behind a confirm; the MCP panel is still mounted.
  await expect(page.getByText(DISCARD_PROMPT)).toBeVisible();
  await expect(page.getByLabel('MCP config')).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('MCP config')).toHaveValue('[{"e2eDirtyMarker":true}]');
});

test('navigating away from a dirty MCP editor prompts, and Cancel stays on the manifest', async ({
  page,
}) => {
  await stubMcp(page);
  await dirtyTheEditor(page);

  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Tools' })
    .click();

  // The same guard arms the route navigation; declining keeps us on /manifest.
  await expect(page.getByText(DISCARD_PROMPT)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/manifest/);
  await expect(page.getByLabel('MCP config')).toBeVisible();
});
