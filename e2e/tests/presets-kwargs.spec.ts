/**
 * The composed-path e2e for the fixed-kwargs editor on the preset doors. It drives the
 * SDK editor on the REAL create + save-version dialogs end to end — a text row, a number
 * row, a secret-reference row picking an existing env key, a save-version edit, and the
 * raw JSON view — then asserts the PERSISTED `fixed_kwargs` on the stored preset (the
 * exact `!ENV ${VAR}` marker verbatim, never a resolved value).
 *
 * The base tool is `studio_demo_form`, whose params (name/count/mood/loud) give the editor
 * a text, number, string-reference and boolean target; a preset's kwargs must name real
 * base-tool params, so the row keys are those. The secret-reference row references an
 * EXISTING env key seeded through the real config door; the editor never writes a secret.
 */
import {
  type APIRequestContext,
  expect,
  type Page,
  request as apiRequest,
  test,
} from '@playwright/test';

import { API_KEY, seedCredential } from './helpers';

const STUDIO_PORT = process.env.STUDIO_PORT ?? '8765';
const BASE_URL = `http://127.0.0.1:${STUDIO_PORT}`;

const BASE_TOOL = 'studio_demo_form';
const ENV_KEY = 'SERVICE_API_TOKEN';
const MARKER = `!ENV \${${ENV_KEY}}`;

/** Read a stored preset record, tolerating the two "not ready yet" windows the store has. */
async function readPreset(api: APIRequestContext, name: string): Promise<unknown> {
  const res = await api.get(`/api/presets/${name}`);
  // The preset commits a beat after the create POST returns (a transient 404), and the
  // create drives the versioning store through its reload gate, which stamps a retriable
  // 503 `{ reloading: true }` on reads in flight. Both are "poll again", never an error.
  if (res.status() === 404) return null;
  if (res.status() === 503) {
    const gate = (await res.json().catch(() => null)) as { reloading?: unknown } | null;
    if (gate?.reloading === true) return null;
    throw new Error('read preset failed (503)');
  }
  if (!res.ok()) throw new Error(`read preset failed (${String(res.status())})`);
  const { data } = (await res.json()) as { data: { fixed_kwargs?: unknown } };
  return data;
}

/** Poll the stored preset until it is readable, then return its `fixed_kwargs`. */
async function persistedKwargs(api: APIRequestContext, name: string): Promise<unknown> {
  const captured: { value: { fixed_kwargs?: unknown } | null } = { value: null };
  await expect
    .poll(
      async () => {
        const record = (await readPreset(api, name)) as { fixed_kwargs?: unknown } | null;
        if (record !== null) captured.value = record;
        return captured.value;
      },
      { timeout: 10_000 },
    )
    .not.toBeNull();
  if (captured.value === null) throw new Error('expected a persisted preset');
  return captured.value.fixed_kwargs;
}

/** Pick a base tool through the create form's ToolPicker. */
async function selectBaseTool(page: Page, dialog: ReturnType<Page['getByRole']>): Promise<void> {
  await dialog.getByRole('combobox', { name: /Base tool/ }).click();
  await page.getByRole('option', { name: BASE_TOOL }).first().click();
}

/** Set the Kind select of the LAST-added row. */
async function setLastRowKind(
  page: Page,
  dialog: ReturnType<Page['getByRole']>,
  kind: string,
): Promise<void> {
  await dialog.getByRole('combobox', { name: 'Type' }).last().click();
  await page.getByRole('option', { name: kind }).click();
}

test.describe('fixed-kwargs editor on the preset doors (composed path)', () => {
  test('authors text, number and secret-reference rows, then edits one on save-version', async ({
    page,
  }) => {
    const api = await apiRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    });
    const preset = `digest-${String(Date.now())}`;
    try {
      // Seed an EXISTING env key the reference row can pick (the editor never writes one).
      expect((await api.post('/api/config/env', { data: { [ENV_KEY]: 's3cr3t' } })).ok()).toBe(
        true,
      );
      const envBody = (await (await api.get('/api/config/env')).json()) as {
        data: { env: Record<string, string>; secret_keys: string[] };
      };
      expect([...Object.keys(envBody.data.env), ...envBody.data.secret_keys]).toContain(ENV_KEY);

      await seedCredential(page);
      await page.goto('/presets', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Create preset' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'Name' }).fill(preset);
      await dialog.getByRole('textbox', { name: /Description/ }).fill('Posts the daily digest.');
      await selectBaseTool(page, dialog);

      // A text row.
      await dialog.getByRole('button', { name: 'Add kwarg' }).click();
      await dialog.getByLabel('Key', { exact: true }).last().fill('name');
      await dialog.getByLabel('Value', { exact: true }).last().fill('Ada');

      // A number row.
      await dialog.getByRole('button', { name: 'Add kwarg' }).click();
      await dialog.getByLabel('Key', { exact: true }).last().fill('count');
      await setLastRowKind(page, dialog, 'Number');
      await dialog.getByLabel('Value', { exact: true }).last().fill('3');

      // A secret-reference row picking the seeded env key.
      await dialog.getByRole('button', { name: 'Add kwarg' }).click();
      await dialog.getByLabel('Key', { exact: true }).last().fill('mood');
      await setLastRowKind(page, dialog, 'Secret reference');
      await dialog.getByRole('combobox', { name: 'Secret reference' }).click();
      await page.getByRole('option', { name: ENV_KEY }).click();
      await dialog.getByRole('button', { name: 'Change reference' }).waitFor({ state: 'visible' });

      await dialog.getByRole('button', { name: 'Create preset' }).click();

      // The marker is stored verbatim beside the plain kwargs; the server never resolves it here.
      expect(await persistedKwargs(api, preset)).toEqual({ name: 'Ada', count: 3, mood: MARKER });

      // --- Save a new version editing the text row; the other rows carry forward. ---
      await page.getByRole('button', { name: 'New version' }).click();
      const saveDialog = page.getByRole('dialog', { name: new RegExp('Save version') });
      await saveDialog.getByLabel('Value', { exact: true }).first().fill('Grace');
      await saveDialog.getByRole('button', { name: 'Save as new version' }).click();
      await page
        .getByRole('button', { name: 'Save as new version' })
        .waitFor({ state: 'detached' });

      await expect
        .poll(async () => persistedKwargs(api, preset), { timeout: 10_000 })
        .toEqual({ name: 'Grace', count: 3, mood: MARKER });
    } finally {
      await api.delete(`/api/presets/${preset}`).catch(() => undefined);
      await api.dispose();
    }
  });

  test('authors kwargs through the raw JSON view and persists them on switch back to Fields', async ({
    page,
  }) => {
    const api = await apiRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    });
    const preset = `jsonview-${String(Date.now())}`;
    try {
      await seedCredential(page);
      await page.goto('/presets', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Create preset' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'Name' }).fill(preset);
      await dialog.getByRole('textbox', { name: /Description/ }).fill('A JSON-authored preset.');
      await selectBaseTool(page, dialog);

      // Author the kwargs in the raw JSON view, then switch back to Fields.
      await dialog.getByRole('button', { name: 'JSON' }).click();
      await dialog
        .getByLabel('Fixed kwargs JSON')
        .fill(JSON.stringify({ name: 'Ada', count: 5, loud: true }));
      await dialog.getByRole('button', { name: 'Fields' }).click();
      // The switch parsed the text into rows (the first key is now an editable field).
      await expect(dialog.getByLabel('Key', { exact: true }).first()).toHaveValue('name');

      await dialog.getByRole('button', { name: 'Create preset' }).click();

      expect(await persistedKwargs(api, preset)).toEqual({ name: 'Ada', count: 5, loud: true });
    } finally {
      await api.delete(`/api/presets/${preset}`).catch(() => undefined);
      await api.dispose();
    }
  });
});
