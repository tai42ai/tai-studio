/**
 * The tool-organization folder tree on the Tools screen, against the LIVE boot skeleton's
 * tool-metadata overlay (`/api/tool-meta`, backed by the compose Postgres).
 *
 * Legs: a writer creates a folder inline from a tool's Edit dialog and files the tool in
 * it; the dialog reopens on the stored display name and folder; the folder is renamed, a
 * delete of the non-empty folder is refused with the server's reason, and once the tool is
 * unfiled the folder deletes. A session that may not write the overlay sees a stored folder
 * but is offered no Edit and no folder action on it; a refused save and a refused inline
 * folder create each show the server's error in place.
 *
 * Every leg that stores overlay data removes it in a `finally` block through the API, so a
 * failed attempt leaves the store as it found it and a retry on the same stack starts clean.
 *
 * The Presets screen draws the same tree for its own population: a stored preset, seeded
 * through the API, is filed from its Edit details dialog and listed inside its folder
 * there; an empty folder shows on both screens, and a folder that holds only another tool
 * shows on the Tools screen and not on the Presets screen.
 */
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  request as apiRequest,
} from '@playwright/test';

import { needs, test } from '../needs';
import { BASE_URL } from '../playwright.config';
import { API_KEY, seedCredential } from './helpers';
import { onlyReachSession, serveWrite, stubSession } from './session-stubs';

needs('kind:studio_plugins:reference_plugin', 'mutable');

/** A tool the reference plugin registers on the boot. */
const TOOL = 'studio_demo_echo';

/** An API context that signs in with the boot key, for seeding and removing overlay data. */
async function bootApi(): Promise<APIRequestContext> {
  return apiRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
  });
}

/** The JSON `data` of a successful API response. */
async function dataOf<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok(), `${response.url()} answered ${String(response.status())}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

/** The ids of the stored folders named in `names`. */
async function folderIdsNamed(api: APIRequestContext, names: readonly string[]): Promise<string[]> {
  const overlay = await dataOf<{ folders: { id: string; name: string }[] }>(
    await api.get('/api/tool-meta'),
  );
  return overlay.folders.filter((folder) => names.includes(folder.name)).map((f) => f.id);
}

/** Create the root-level folder `name` through the API and return its id. */
async function createFolder(api: APIRequestContext, name: string): Promise<string> {
  const record = await dataOf<{ id: string }>(
    await api.post('/api/tool-meta/folders', { data: { name, parent_id: null } }),
  );
  return record.id;
}

/** Delete a stored folder. A failure is recorded softly, so it never hides the test's own. */
async function deleteFolder(api: APIRequestContext, id: string): Promise<void> {
  const response = await api.delete(`/api/tool-meta/folders/${id}`);
  expect
    .soft(response.ok(), `deleting folder ${id} answered ${String(response.status())}`)
    .toBe(true);
}

/** Drop the overlay row of `tool` (idempotent). A failure is recorded softly, as above. */
async function dropOverlayRow(api: APIRequestContext, tool: string): Promise<void> {
  const response = await api.delete(`/api/tool-meta/tools/${tool}`);
  expect
    .soft(response.ok(), `dropping the ${tool} overlay row answered ${String(response.status())}`)
    .toBe(true);
}

/** Show only `TOOL` in the tools explorer by committing the filter. */
async function filterToTool(page: Page): Promise<void> {
  const filter = page.getByRole('textbox', { name: 'Filter tools' });
  await filter.fill(TOOL);
  await filter.press('Enter');
  await expect(page.getByRole('link', { name: `Open tool ${TOOL}`, exact: true })).toBeVisible();
}

/** Clear the committed filter so the root folder rows show again. */
async function clearFilter(page: Page): Promise<void> {
  const filter = page.getByRole('textbox', { name: 'Filter tools' });
  await filter.fill('');
  await filter.press('Enter');
}

/** Open the root-level folder `name` in the explorer. */
async function enterFolder(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('link', { name: `Open tool ${TOOL}`, exact: true })).toBeVisible();
}

/** Return to the explorer's root through the folder path. */
async function backToRoot(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button').first().click();
}

/** Open `TOOL`'s Edit dialog. */
async function openEdit(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: `Edit tool ${TOOL}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Edit ${TOOL}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Choose `option` in the Edit dialog's Folder select and save. */
async function fileAndSave(page: Page, dialog: Locator, option: string): Promise<void> {
  await dialog.getByRole('combobox', { name: 'Folder' }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

test('a writer files a tool in a folder made from the Edit dialog, then renames and deletes it', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const folder = `e2e-folder-${suffix}`;
  const renamed = `e2e-renamed-${suffix}`;
  const displayName = `Echo ${suffix}`;
  const api = await bootApi();

  try {
    await seedCredential(page);
    await page.goto('/tools');
    await filterToTool(page);

    // Create the folder inline from the dialog's Folder field; the new folder is chosen.
    let dialog = await openEdit(page);
    await dialog.getByLabel('Display name').fill(displayName);
    await dialog.getByRole('button', { name: 'New folder' }).click();
    await dialog.getByLabel('New folder name').fill(folder);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog.getByRole('combobox', { name: 'Folder' })).toContainText(folder);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    // The tool now lives in the folder; there the dialog reopens on the stored values.
    await clearFilter(page);
    await enterFolder(page, folder);
    dialog = await openEdit(page);
    await expect(dialog.getByLabel('Display name')).toHaveValue(displayName);
    await expect(dialog.getByRole('combobox', { name: 'Folder' })).toContainText(folder);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // The folder shows at the root with its actions; rename it.
    await backToRoot(page);
    await page.getByRole('button', { name: `Rename folder ${folder}` }).click();
    const rename = page.getByRole('dialog', { name: 'Rename folder' });
    await rename.getByLabel('Folder name').fill(renamed);
    await rename.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(rename).toBeHidden();
    await expect(page.getByRole('button', { name: renamed, exact: true })).toBeVisible();

    // A folder that still holds a tool cannot be deleted: the server's refusal, which
    // names the folder by its stored id, is shown in the confirm dialog.
    const [renamedId] = await folderIdsNamed(api, [renamed]);
    expect(renamedId, `folder ${renamed} is stored`).toBeDefined();
    await page.getByRole('button', { name: `Delete folder ${renamed}` }).click();
    let confirm = page.getByRole('dialog', { name: `Delete ${renamed}?` });
    await confirm.getByRole('button', { name: 'Delete folder' }).click();
    await expect(confirm.getByRole('alert')).toContainText(
      `folder '${String(renamedId)}' is not empty`,
    );
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();

    // Unfile the tool and drop its display name, then the empty folder deletes.
    await enterFolder(page, renamed);
    dialog = await openEdit(page);
    await dialog.getByLabel('Display name').fill('');
    await fileAndSave(page, dialog, 'No folder');
    await backToRoot(page);
    await page.getByRole('button', { name: `Delete folder ${renamed}` }).click();
    confirm = page.getByRole('dialog', { name: `Delete ${renamed}?` });
    await confirm.getByRole('button', { name: 'Delete folder' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('button', { name: renamed, exact: true })).toHaveCount(0);
  } finally {
    // Drop the tool's overlay row and any folder the test left stored.
    await dropOverlayRow(api, TOOL);
    for (const id of await folderIdsNamed(api, [folder, renamed])) await deleteFolder(api, id);
    await api.dispose();
  }
});

test('a session that may not write the overlay sees a folder but no Edit and no folder action', async ({
  page,
}) => {
  const folder = `e2e-viewer-${Date.now().toString(36)}`;
  const api = await bootApi();
  let folderId: string | undefined;

  try {
    folderId = await createFolder(api, folder);
    await seedCredential(page);
    await stubSession(
      page,
      onlyReachSession('alice', [
        { path: '/api/tools', methods: ['GET'] },
        { path: '/api/tool-meta', methods: ['GET'] },
      ]),
    );
    await page.goto('/tools');

    // The stored folder is drawn, and none of its write actions is offered.
    await expect(page.getByRole('button', { name: folder, exact: true })).toBeVisible();
    for (const action of ['Rename', 'Move', 'Delete']) {
      await expect(page.getByRole('button', { name: `${action} folder ${folder}` })).toHaveCount(0);
    }

    await filterToTool(page);
    await expect(page.getByRole('button', { name: `Edit tool ${TOOL}`, exact: true })).toHaveCount(
      0,
    );
  } finally {
    if (folderId !== undefined) await deleteFolder(api, folderId);
    await api.dispose();
  }
});

test('a refused save keeps the dialog open with the server error', async ({ page }) => {
  const refusal = 'tool metadata write refused for this test';
  await seedCredential(page);
  await serveWrite(page, 'PATCH', (path) => path.startsWith('/api/tool-meta/tools/'), {
    status: 422,
    error: refusal,
  });
  await page.goto('/tools');
  await filterToTool(page);
  const dialog = await openEdit(page);
  await dialog.getByLabel('Display name').fill('Never stored');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText(refusal)).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('a refused inline folder create shows the server error under the open draft', async ({
  page,
}) => {
  const refusal = 'a folder with this name already exists here';
  await seedCredential(page);
  await serveWrite(page, 'POST', (path) => path === '/api/tool-meta/folders', {
    status: 409,
    error: refusal,
  });
  await page.goto('/tools');
  await filterToTool(page);
  const dialog = await openEdit(page);
  await dialog.getByRole('button', { name: 'New folder' }).click();
  const draft = dialog.getByLabel('New folder name');
  await draft.fill('refused-folder');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByText(refusal)).toBeVisible();
  // The draft stays open on the typed name, and nothing was chosen.
  await expect(draft).toHaveValue('refused-folder');
  await expect(dialog.getByRole('combobox', { name: 'Folder' })).not.toContainText(
    'refused-folder',
  );
});

test.describe('the Presets screen draws the folders that concern presets', () => {
  needs('kind:studio_plugins:reference_plugin', 'mutable', 'setting:presets');

  /** Poll until the preset reads back (the store commits and reloads a beat after the create). */
  async function awaitPreset(api: APIRequestContext, name: string): Promise<void> {
    await expect
      .poll(async () => (await api.get(`/api/presets/${name}`)).status(), { timeout: 10_000 })
      .toBe(200);
  }

  test('a preset filed from its Edit details dialog lists inside its folder', async ({ page }) => {
    const suffix = Date.now().toString(36);
    const preset = `e2e-preset-${suffix}`;
    const names = {
      own: `e2e-presets-${suffix}`,
      othersOnly: `e2e-tools-only-${suffix}`,
      empty: `e2e-empty-${suffix}`,
    };
    const otherTool = 'studio_demo_form';
    const api = await bootApi();
    const folderIds: string[] = [];
    const filed: string[] = [];
    let presetCreated = false;
    try {
      await dataOf(
        await api.post('/api/presets', {
          data: { name: preset, base_tool: TOOL, description: 'Echoes a fixed greeting.' },
        }),
      );
      presetCreated = true;
      await awaitPreset(api, preset);
      const folderId: Record<string, string> = {};
      for (const [key, name] of Object.entries(names)) {
        const id = await createFolder(api, name);
        folderId[key] = id;
        folderIds.push(id);
      }
      filed.push(otherTool);
      await dataOf(
        await api.patch(`/api/tool-meta/tools/${otherTool}`, {
          data: { folder_id: folderId.othersOnly },
        }),
      );

      // Presets screen, before filing: the preset sits at the root; the empty folder shows,
      // the folder holding only another tool does not.
      await seedCredential(page);
      await page.goto('/presets');
      const openPreset = page.getByRole('link', { name: `Open preset ${preset}`, exact: true });
      await expect(openPreset).toBeVisible();
      await expect(page.getByRole('button', { name: names.empty, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: names.own, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: names.othersOnly, exact: true })).toHaveCount(
        0,
      );

      // File the preset from its Edit details dialog, whose Folder offers the full tree.
      await openPreset.click();
      filed.push(preset);
      await page.getByRole('button', { name: `Edit details for ${preset}` }).click();
      const dialog = page.getByRole('dialog', { name: `Edit details — ${preset}` });
      await dialog.getByRole('combobox', { name: 'Folder' }).click();
      await expect(page.getByRole('option', { name: names.othersOnly, exact: true })).toBeVisible();
      await page.getByRole('option', { name: names.own, exact: true }).click();
      await dialog.getByRole('button', { name: 'Save details' }).click();
      await expect(dialog).toBeHidden();

      // The preset left the root and lists inside its folder.
      await page.goto('/presets');
      await expect(page.getByRole('button', { name: names.own, exact: true })).toBeVisible();
      await expect(openPreset).toHaveCount(0);
      await page.getByRole('button', { name: names.own, exact: true }).click();
      await expect(openPreset).toBeVisible();

      // The Tools screen draws the whole tree.
      await page.goto('/tools');
      for (const name of Object.values(names)) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
      }
    } finally {
      for (const tool of filed) await dropOverlayRow(api, tool);
      for (const id of folderIds) await deleteFolder(api, id);
      if (presetCreated) await api.delete(`/api/presets/${preset}`);
      await api.dispose();
    }
  });
});
