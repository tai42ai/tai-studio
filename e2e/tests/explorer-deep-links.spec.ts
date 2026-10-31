/**
 * A link straight to a filed item, against the LIVE boot skeleton's tool-metadata overlay:
 * a folder is stored and an item filed in it through the API, then the screen is opened
 * at the item's own URL. The explorer opens on the item's folder, names it in the folder
 * path, and draws the item as the selected one. The folder, the overlay row and the
 * preset are removed in a `finally` block through the API.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import {
  awaitPreset,
  bootApi,
  createFolder,
  createPreset,
  deleteFolder,
  deletePreset,
  dropOverlayRow,
  writeOverlayRow,
} from './tool-meta-api';

needs('kind:studio_plugins:reference_plugin', 'mutable');

/** A tool the reference plugin registers on the boot. */
const TOOL = 'studio_demo_echo';

/** The explorer opened on `folder`, with `link` drawn as the selected item. */
async function expectOpenedOn(page: Page, folder: string, link: string): Promise<void> {
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toContainText(folder);
  const name = page.getByRole('link', { name: link, exact: true });
  await expect(name).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-selected="true"]').filter({ has: name })).toBeVisible();
}

test('a link to a filed tool opens the tools explorer on its folder with the tool selected', async ({
  page,
}) => {
  const folder = `e2e-linked-${Date.now().toString(36)}`;
  const api = await bootApi();
  let folderId: string | undefined;
  let filed = false;
  try {
    folderId = await createFolder(api, folder);
    filed = true;
    await writeOverlayRow(api, TOOL, { folder_id: folderId });

    await seedCredential(page);
    await page.goto(`/tools?tool=${TOOL}`);

    await expectOpenedOn(page, folder, `Open tool ${TOOL}`);
  } finally {
    if (filed) await dropOverlayRow(api, TOOL);
    if (folderId !== undefined) await deleteFolder(api, folderId);
    await api.dispose();
  }
});

test.describe('presets', () => {
  needs('kind:studio_plugins:reference_plugin', 'mutable', 'setting:presets');

  test('a link to a filed preset opens the presets explorer on its folder with the preset selected', async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const folder = `e2e-linked-${suffix}`;
    const preset = `e2e-linked-preset-${suffix}`;
    const api = await bootApi();
    let presetCreated = false;
    let folderId: string | undefined;
    let filed = false;
    try {
      await createPreset(api, preset, TOOL, 'Echoes a fixed text.');
      presetCreated = true;
      await awaitPreset(api, preset);
      folderId = await createFolder(api, folder);
      filed = true;
      await writeOverlayRow(api, preset, { folder_id: folderId });

      await seedCredential(page);
      await page.goto(`/presets?preset=${preset}`);

      await expectOpenedOn(page, folder, `Open preset ${preset}`);
    } finally {
      if (filed) await dropOverlayRow(api, preset);
      if (folderId !== undefined) await deleteFolder(api, folderId);
      if (presetCreated) await deletePreset(api, preset);
      await api.dispose();
    }
  });
});
