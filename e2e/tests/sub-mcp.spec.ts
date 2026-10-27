/**
 * Sub-MCP (the Served endpoints page), against the LIVE boot skeleton with the
 * sub-MCP list + tool catalog stubbed via `page.route` so the registered entry and
 * the create form see a known slug. The surface moved off the manifest page's
 * Sub-MCP tab onto its own `/served-endpoints` page under Connections.
 *
 * Legs: a registered sub-MCP shows its served connect URL (`mount_url`) with a copy
 * control; typing an already-registered slug into the create form warns that
 * registering will REPLACE it (register is a silent-swap upsert server-side); the
 * create form's "Filter tools" box narrows the tool checklist by display name or raw
 * name, keeps a ticked tool it hides, and never submits the form on Enter.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import { bodyOf, nextRequest, serveWrite } from './session-stubs';

needs();

async function stubSubMcp(page: Page): Promise<void> {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/sub-mcp',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        json: {
          data: {
            existing: {
              tools: ['echo'],
              transport: 'http',
              mount_url: '/app/existing',
              access_pattern: '^/app/existing/.*$',
            },
          },
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/tools',
    async (route) => {
      await route.fulfill({ json: { data: ['echo', 'ask'] } });
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

test('the Filter tools box narrows the checklist and a filtered tick is what gets created', async ({
  page,
}) => {
  await stubSubMcp(page);
  // A display name on `echo`, so its checkbox reads `Echo back (echo)`.
  await page.route(
    (url) => url.pathname === '/api/tool-meta',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        json: { data: { folders: [], meta: [{ tool_name: 'echo', display_name: 'Echo back' }] } },
      });
    },
  );
  const isCreate = (pathname: string): boolean => pathname === '/api/sub-mcp';
  await serveWrite(page, 'POST', isCreate, {
    data: { slug: 'filtered', tools: ['echo'], transport: 'http' },
  });
  const creates: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && isCreate(new URL(request.url()).pathname)) {
      creates.push(request.url());
    }
  });
  await openServedEndpoints(page);

  await page.getByLabel('Slug').fill('filtered');
  const echo = page.getByRole('checkbox', { name: 'Echo back (echo)' });
  const ask = page.getByRole('checkbox', { name: 'ask', exact: true });
  await expect(echo).toBeVisible();
  await expect(ask).toBeVisible();

  const filter = page.getByRole('textbox', { name: 'Filter tools' });
  // The display name narrows the list.
  await filter.fill('ECHO BACK');
  await expect(echo).toBeVisible();
  await expect(ask).toHaveCount(0);
  await echo.click();
  await expect(echo).toBeChecked();
  // Enter in the filter narrows only; it never submits the form.
  await filter.press('Enter');

  // The raw name narrows the list too; the ticked tool it hides stays ticked.
  await filter.fill('ask');
  await expect(ask).toBeVisible();
  await expect(echo).toHaveCount(0);
  await filter.fill('nothing-here');
  await expect(
    page.getByRole('status').filter({ hasText: 'No tool matches “nothing-here”.' }),
  ).toBeVisible();
  await filter.fill('');
  await expect(echo).toBeChecked();
  await expect(ask).not.toBeChecked();
  expect(creates).toEqual([]);

  const write = nextRequest(page, 'POST', isCreate);
  await page.getByRole('button', { name: 'Create sub-MCP' }).click();
  expect(bodyOf(await write)).toMatchObject({ slug: 'filtered', tools: ['echo'] });
});
