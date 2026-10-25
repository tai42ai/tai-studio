/**
 * Storage, against the LIVE boot skeleton with the storage-presence signal and the
 * storage doors stubbed via `page.route` (the lean boot installs no storage provider).
 *
 * Legs: path-shaped ids fold into a virtual folder tree that navigates inward; a
 * multi-file upload checks for id conflicts before it sends anything and reports a
 * per-file outcome; a text object opens in the detail and renders a preview with
 * kwargs; a binary object opens with no preview and downloads; a delete from the
 * detail; a held delete lists its holders and the holder link opens the hooks screen;
 * Clear cache announces its result.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';

needs();

const IDS = ['prompts/welcome.md', 'prompts/emails/greeting.md', 'logo.png', 'jq/gate'];

const ENTRIES: Record<string, unknown> = {
  'prompts/welcome.md': {
    kind: 'text',
    id: 'prompts/welcome.md',
    content_type: 'text/markdown',
    size: 17,
    content: 'Hello {{ name }}!',
  },
  'logo.png': { kind: 'binary', id: 'logo.png', content_type: 'image/png', size: 4 },
  'jq/gate': {
    kind: 'text',
    id: 'jq/gate',
    content_type: 'text/plain',
    size: 6,
    content: '.ready',
  },
};

const FANOUT = { mode: 'local-only', note: 'only this worker reloaded' };

/** The presence signal, the list and the entry reads; returns the live id list. */
async function stubStorage(page: Page): Promise<string[]> {
  const ids = [...IDS];
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/storage',
    (route) =>
      route.fulfill({
        json: {
          data: {
            present: true,
            provider: 'LocalStorage',
            module: 'plugin.storage',
            surfaces: ['storage', 'templates'],
          },
        },
      }),
  );
  await page.route(
    (url) => url.pathname === '/api/storage/resources',
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { data: { resources: ids } } });
        return;
      }
      await route.fallback();
    },
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/storage/entries/'),
    async (route) => {
      const id = decodeURIComponent(
        new URL(route.request().url()).pathname.slice('/api/storage/entries/'.length),
      );
      const entry = ENTRIES[id];
      if (entry === undefined) {
        await route.fulfill({ status: 404, json: { error: `resource '${id}' not found` } });
        return;
      }
      await route.fulfill({ json: { data: entry } });
    },
  );
  return ids;
}

test('path-shaped ids fold into a folder tree that navigates inward', async ({ page }) => {
  await stubStorage(page);
  await page.goto('/storage');

  await expect(page.getByRole('button', { name: 'prompts', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open logo.png' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open prompts/welcome.md' })).toHaveCount(0);

  await page.getByRole('button', { name: 'prompts', exact: true }).click();
  await expect(page.getByRole('button', { name: 'emails', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open prompts/welcome.md' })).toBeVisible();
});

test('a multi-file upload checks conflicts first, then reports a per-file outcome', async ({
  page,
}) => {
  await stubStorage(page);
  const sent: string[] = [];
  await page.route(
    (url) => url.pathname === '/api/storage/resources',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      const body = route.request().postDataJSON() as { id: string };
      sent.push(body.id);
      if (body.id === 'bad.md') {
        await route.fulfill({ status: 500, json: { error: 'disk full' } });
        return;
      }
      await route.fulfill({ json: { data: { id: body.id, stored: true } } });
    },
  );
  await page.goto('/storage');
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload resource' });
  await dialog.getByRole('radio', { name: 'Files' }).check();

  // A name already stored blocks the whole batch before any request.
  await dialog
    .getByLabel('Choose files')
    .setInputFiles([{ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('png!') }]);
  await expect(dialog.getByText(/already exist/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();
  expect(sent).toEqual([]);

  await dialog.getByLabel('Choose files').setInputFiles([
    { name: 'ok.md', mimeType: 'text/markdown', buffer: Buffer.from('hello') },
    { name: 'bad.md', mimeType: 'text/markdown', buffer: Buffer.from('nope') },
  ]);
  const list = dialog.getByRole('list', { name: 'Selected files' });
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click();

  await expect(list.getByText('Uploaded')).toBeVisible();
  await expect(list.getByText('Failed')).toBeVisible();
  await expect(dialog.getByText('Some files failed to upload.')).toBeVisible();
  expect([...sent].sort()).toEqual(['bad.md', 'ok.md']);
});

test('a text object opens in the detail and renders a preview with kwargs', async ({ page }) => {
  await stubStorage(page);
  let renderBody: unknown = null;
  await page.route(
    (url) => url.pathname === '/api/render-template',
    async (route) => {
      renderBody = route.request().postDataJSON();
      await route.fulfill({ json: { data: { rendered: 'Hello Ada!' } } });
    },
  );
  await page.goto('/storage?id=prompts%2Fwelcome.md');

  const detail = page.getByRole('region', { name: 'prompts/welcome.md' });
  await expect(detail.getByRole('heading', { name: 'Content' })).toBeVisible();
  await expect(detail.getByText('Hello {{ name }}!')).toBeVisible();
  await detail.getByLabel('Keyword arguments (JSON)').fill('{"name": "Ada"}');
  await detail.getByRole('button', { name: 'Render', exact: true }).click();

  await expect(detail.getByText('Hello Ada!')).toBeVisible();
  expect(renderBody).toEqual({ text: { id: 'prompts/welcome.md', kwargs: { name: 'Ada' } } });
});

test('a binary object opens with no preview and downloads', async ({ page }) => {
  await stubStorage(page);
  await page.route(
    (url) => url.pathname === '/api/storage/resources/logo.png/content',
    (route) =>
      route.fulfill({ body: Buffer.from('png!'), headers: { 'content-type': 'image/png' } }),
  );
  await page.goto('/storage');
  await page.getByRole('link', { name: 'Open logo.png' }).click();

  const detail = page.getByRole('region', { name: 'logo.png' });
  await expect(detail.getByText('Binary object: no text preview.')).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Render preview' })).toHaveCount(0);

  const download = page.waitForEvent('download');
  await detail.getByRole('button', { name: 'Download logo.png' }).click();
  expect((await download).suggestedFilename()).toBe('logo.png');
});

test('a delete from the detail removes the object and clears the selection', async ({ page }) => {
  const ids = await stubStorage(page);
  await page.route(
    (url) => url.pathname === '/api/storage/resources/logo.png',
    async (route) => {
      ids.splice(ids.indexOf('logo.png'), 1);
      await route.fulfill({ json: { data: { id: 'logo.png', deleted: true } } });
    },
  );
  await page.goto('/storage?id=logo.png');

  await page.getByRole('button', { name: 'Delete logo.png' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete resource' });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/storage$/);
  await expect(page.getByRole('link', { name: 'Open logo.png' })).toHaveCount(0);
});

test('a held delete lists its holders and the holder link opens the hooks screen', async ({
  page,
}) => {
  await stubStorage(page);
  const message =
    "stored template 'jq/gate' cannot be deleted — held by:\n  hook 'h' names 'jq/gate' at condition";
  await page.route(
    (url) => url.pathname === '/api/storage/resources/jq/gate',
    (route) =>
      route.fulfill({
        status: 409,
        json: {
          error: message,
          holders: [
            {
              kind: 'hook',
              name: 'h',
              locator: { template: 'jq/gate', site: 'condition' },
              summary: "hook 'h' names 'jq/gate' at condition",
            },
          ],
        },
      }),
  );
  await page.goto('/storage?id=jq%2Fgate');

  await page.getByRole('button', { name: 'Delete jq/gate' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete resource' });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(dialog.getByText('Still used by — remove these first:')).toBeVisible();
  const holders = dialog.getByRole('list', { name: 'Holders of jq/gate' });
  await holders.getByRole('link', { name: "hook 'h' names 'jq/gate' at condition" }).click();
  await expect(page).toHaveURL(/\/hooks\?hook=h$/);
});

test('Clear cache announces its result', async ({ page }) => {
  await stubStorage(page);
  await page.route(
    (url) => url.pathname === '/api/clear-templates-cache',
    (route) => route.fulfill({ json: { data: { cleared: true, fanout: FANOUT } } }),
  );
  await page.goto('/storage');

  await page.getByRole('button', { name: 'Clear cache' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Template cache cleared.' }),
  ).toBeVisible();
});
