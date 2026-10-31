/**
 * One tool-metadata overlay shared by every explorer screen, against the LIVE boot
 * skeleton: a preset stored through the API is filed into a stored folder from its Edit
 * dialog on the Tools screen, and the Presets screen, reached by in-app navigation with
 * no reload, lists it inside that folder at once.
 *
 * The Presets screen is visited first, so it has already read the overlay with the preset
 * at the root. Once the Tools screen's save has been read back, later overlay reads are
 * held unanswered: what the Presets screen draws is then the overlay the Tools save left
 * in the shared cache, not a fresh read of its own. The held reads are dropped, and the
 * folder, the overlay row and the preset removed through the API, in a `finally` block.
 */
import { expect, type Route } from '@playwright/test';

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
} from './tool-meta-api';

needs('kind:studio_plugins:reference_plugin', 'mutable', 'setting:presets');

const isOverlayRead = (url: URL): boolean => url.pathname === '/api/tool-meta';

test('a preset filed on the Tools screen lists inside its folder on the Presets screen without a reload', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const folder = `e2e-shared-${suffix}`;
  const preset = `e2e-shared-preset-${suffix}`;
  const api = await bootApi();
  let presetCreated = false;
  let folderId: string | undefined;
  try {
    await createPreset(api, preset, 'studio_demo_echo', 'Echoes a fixed text.');
    presetCreated = true;
    await awaitPreset(api, preset);
    folderId = await createFolder(api, folder);

    await seedCredential(page);
    await page.goto('/presets');
    const openPreset = page.getByRole('link', { name: `Open preset ${preset}`, exact: true });
    await expect(openPreset).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('link', { name: 'Tools' }).click();
    const filter = page.getByRole('textbox', { name: 'Filter tools' });
    await filter.fill(preset);
    await filter.press('Enter');
    await page.getByRole('button', { name: `Edit tool ${preset}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Edit ${preset}` });
    await dialog.getByRole('combobox', { name: 'Folder' }).click();
    await page.getByRole('option', { name: folder, exact: true }).click();
    const readBack = page.waitForResponse(
      (response) => isOverlayRead(new URL(response.url())) && response.request().method() === 'GET',
    );
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await readBack;

    await page.route(isOverlayRead, (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      // Held unanswered: the screen draws only what the shared cache already holds.
      return new Promise<void>(() => undefined);
    });
    await nav.getByRole('link', { name: 'Presets' }).click();

    await expect(page.getByRole('button', { name: folder, exact: true })).toBeVisible();
    await expect(openPreset).toHaveCount(0);
    await page.getByRole('button', { name: folder, exact: true }).click();
    await expect(openPreset).toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await dropOverlayRow(api, preset);
    if (folderId !== undefined) await deleteFolder(api, folderId);
    if (presetCreated) await deletePreset(api, preset);
    await api.dispose();
  }
});
