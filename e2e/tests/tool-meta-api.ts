/**
 * Seeding and removing tool-metadata overlay data (`/api/tool-meta`) and presets through
 * the boot key's API, for the explorer suites that need stored folders, filed items and
 * tags. Every create has its remover; the removers record a failure softly, so a cleanup
 * in a `finally` block never hides the test's own failure.
 */
import { type APIRequestContext, expect, request as apiRequest } from '@playwright/test';

import { BASE_URL } from '../playwright.config';
import { API_KEY } from './helpers';

/** An API context that signs in with the boot key, for seeding and removing overlay data. */
export async function bootApi(): Promise<APIRequestContext> {
  return apiRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
  });
}

/** The JSON `data` of a successful API response. */
export async function dataOf<T>(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
): Promise<T> {
  expect(response.ok(), `${response.url()} answered ${String(response.status())}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

/** The ids of the stored folders named in `names`. */
export async function folderIdsNamed(
  api: APIRequestContext,
  names: readonly string[],
): Promise<string[]> {
  const overlay = await dataOf<{ folders: { id: string; name: string }[] }>(
    await api.get('/api/tool-meta'),
  );
  return overlay.folders.filter((folder) => names.includes(folder.name)).map((f) => f.id);
}

/** Create the root-level folder `name` through the API and return its id. */
export async function createFolder(api: APIRequestContext, name: string): Promise<string> {
  const record = await dataOf<{ id: string }>(
    await api.post('/api/tool-meta/folders', { data: { name, parent_id: null } }),
  );
  return record.id;
}

/** Delete a stored folder. A failure is recorded softly, so it never hides the test's own. */
export async function deleteFolder(api: APIRequestContext, id: string): Promise<void> {
  const response = await api.delete(`/api/tool-meta/folders/${id}`);
  expect
    .soft(response.ok(), `deleting folder ${id} answered ${String(response.status())}`)
    .toBe(true);
}

/** Store the overlay fields of `tool` (its folder, tags, display name). */
export async function writeOverlayRow(
  api: APIRequestContext,
  tool: string,
  fields: { readonly folder_id?: string | null; readonly tags?: readonly string[] },
): Promise<void> {
  await dataOf(await api.patch(`/api/tool-meta/tools/${tool}`, { data: fields }));
}

/** Drop the overlay row of `tool` (idempotent). A failure is recorded softly, as above. */
export async function dropOverlayRow(api: APIRequestContext, tool: string): Promise<void> {
  const response = await api.delete(`/api/tool-meta/tools/${tool}`);
  expect
    .soft(response.ok(), `dropping the ${tool} overlay row answered ${String(response.status())}`)
    .toBe(true);
}

/** Create the preset `name` over `baseTool`. */
export async function createPreset(
  api: APIRequestContext,
  name: string,
  baseTool: string,
  description: string,
): Promise<void> {
  await dataOf(
    await api.post('/api/presets', { data: { name, base_tool: baseTool, description } }),
  );
}

/** Poll until the preset reads back (the store commits and reloads a beat after the create). */
export async function awaitPreset(api: APIRequestContext, name: string): Promise<void> {
  await expect
    .poll(async () => (await api.get(`/api/presets/${name}`)).status(), { timeout: 10_000 })
    .toBe(200);
}

/** Delete the preset `name`. A failure is recorded softly, as above. */
export async function deletePreset(api: APIRequestContext, name: string): Promise<void> {
  const response = await api.delete(`/api/presets/${name}`);
  expect
    .soft(response.ok(), `deleting preset ${name} answered ${String(response.status())}`)
    .toBe(true);
}
