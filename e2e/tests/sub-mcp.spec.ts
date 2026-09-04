/**
 * Sub-MCP (the Served endpoints page), against the LIVE boot skeleton with the
 * sub-MCP list + tool catalog stubbed via `page.route` so the registered entry and
 * the create form see a known slug. The surface moved off the manifest page's
 * Sub-MCP tab onto its own `/served-endpoints` page under Connections.
 *
 * Legs: a registered sub-MCP shows its `/app/{slug}` connect URL with a copy
 * control; typing an already-registered slug into the create form warns that
 * registering will REPLACE it (register is a silent-swap upsert server-side).
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

async function stubSubMcp(page: Page): Promise<void> {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/sub-mcp',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({ json: { data: { existing: { tools: ['echo'], transport: 'http' } } } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/tools',
    async (route) => {
      await route.fulfill({ json: { data: ['echo', 'ask_user'] } });
    },
  );
}

async function openServedEndpoints(page: Page): Promise<void> {
  // The sub-MCP surface is its own page now — no tab to select.
  await page.goto('/served-endpoints');
}

test('a registered sub-MCP shows its connect URL with a copy control', async ({ page }) => {
  await stubSubMcp(page);
  await openServedEndpoints(page);

  const row = page.getByRole('row', { name: /existing/ });
  await expect(row).toBeVisible();
  // The endpoint the sub-MCP is served under is shown, ready to copy.
  await expect(row.getByText('/app/existing')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Copy' })).toBeVisible();
});

test('typing an already-registered slug warns that registering will replace it', async ({
  page,
}) => {
  await stubSubMcp(page);
  await openServedEndpoints(page);

  const slug = page.getByLabel('Slug');
  // A fresh slug draws no swap warning.
  await slug.fill('brand-new');
  await expect(page.getByRole('alert').filter({ hasText: 'already exists' })).toHaveCount(0);

  // The registered slug is a silent swap on register, so the replace is flagged first.
  await slug.fill('existing');
  const warning = page.getByRole('alert').filter({ hasText: 'already exists' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('existing');
});
