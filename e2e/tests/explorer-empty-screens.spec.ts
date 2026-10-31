/**
 * The Presets and Agents screens with nothing to list but a stored folder, against the
 * LIVE boot skeleton with each screen's item reads and the tool-metadata overlay served
 * through `page.route`. The screen reads that it holds no items, and the folder stays on
 * show with its Rename and Delete actions, so a writer can still tidy the tree.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import { stubRead } from './session-stubs';

needs();

const FOLDER = 'archive';

/** Serve an overlay holding {@link FOLDER} and nothing filed. */
async function stubFolderOnly(page: Page): Promise<void> {
  await seedCredential(page);
  await stubRead(page, '/api/tool-meta', {
    data: { folders: [{ id: 'folder-archive', name: FOLDER, parent_id: null }], meta: [] },
  });
}

/** The folder is drawn with both of its actions. */
async function expectFolderWithActions(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: FOLDER, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Rename folder ${FOLDER}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Delete folder ${FOLDER}` })).toBeVisible();
}

test('the presets screen with no preset keeps a stored folder and its actions', async ({
  page,
}) => {
  await stubFolderOnly(page);
  await stubRead(page, '/api/presets', { data: [] });
  await page.goto('/presets');

  await expect(page.getByText('No presets yet', { exact: true })).toBeVisible();
  await expectFolderWithActions(page);
});

test('the agents screen with no agent keeps a stored folder and its actions', async ({ page }) => {
  await stubFolderOnly(page);
  for (const pathname of ['/api/agents', '/api/agents/spec-runnable']) {
    await stubRead(page, pathname, { data: { items: [], total: 0 } });
  }
  await stubRead(page, '/api/presets', { data: [] });
  await page.goto('/agents');

  await expect(page.getByText('No agents registered', { exact: true })).toBeVisible();
  await expectFolderWithActions(page);
});
