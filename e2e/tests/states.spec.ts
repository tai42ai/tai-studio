/**
 * The platform state store, driven end to end through the Studio against the LIVE boot
 * skeleton (the `states` router + the packaged states chain the boot recipe now serves).
 * One composed scenario, several serial legs: declare a state through the Declare dialog;
 * upload a module document and mount it (the Mount dialog's Declarations group); look up a
 * subject and CREATE its record through the schema form; EDIT it and read the `api`-door
 * write back off the Writes audit with the platform-stamped actor; FOLD the subject into
 * another; see a hook bind the state on the Consumers tab with its Open link; confirm the
 * 409 Replace on a duplicate module upload; and ERASE the record behind its danger confirm.
 *
 * Serial: each leg builds on the state the previous one left on the shared skeleton, so a
 * failing leg skips the rest (the composed scenario's own semantics). `beforeAll` clears a
 * prior run's artifacts so a re-run against a persisted backend starts clean.
 */
import { test, expect, request as apiRequest, type Page } from '@playwright/test';

import { API_KEY, EXECUTION_KEY_ID, seedCredential } from './helpers';

/** The skeleton origin, mirroring playwright.config.ts's `baseURL`. */
const STUDIO_PORT = process.env.STUDIO_PORT ?? '8765';
const BASE_URL = `http://127.0.0.1:${STUDIO_PORT}`;

/** The state, module, subject and consumer this scenario authors. Distinct from the
 * docs-shot fixtures (`states-shots.spec.ts` seeds `notes`/`preferences`), so the two
 * suites never collide on the shared backend. */
const STATE = 'e2e_notes';
const MODULE = 'reminders';
const TARGET_KIND = 'agent';
const TARGET_NAME = 'assistant';
const SUBJECT_KEY = 'e2e-t-1';
const FOLD_INTO_KEY = 'e2e-t-2';
const CONSUMER_HOOK = 'e2e-notes-updater';

/** The base schema the Declare dialog authors: one `note` string, so the record form is a
 * single simple field over the effective schema the mounted module composes into. */
const BASE_SCHEMA = {
  type: 'object',
  properties: {
    note: { type: 'string', title: 'Note' },
  },
};

/** The module document uploaded through the catalog. It declares a `channel` field, so the
 * Mount dialog renders its Declarations group. */
const MODULE_DOC = {
  kind: 'state-module',
  name: MODULE,
  description: 'Per-subject reminder settings.',
  schema: {
    type: 'object',
    properties: { snooze_minutes: { type: 'integer', title: 'Snooze minutes' } },
  },
  parameters: {},
  declarations: {
    schema: { type: 'object', properties: { channel: { type: 'string', title: 'Channel' } } },
  },
  regimes: [],
};

/** The record-page URL for the authored subject (`<kind>:<key>` + `<target_kind>:<name>`). */
const RECORD_PATH = `/states?state=${STATE}&subject=thread:${SUBJECT_KEY}&target=${TARGET_KIND}:${TARGET_NAME}`;

/** The catalog's file input (the `Upload module` label wraps it). Scoped past the master
 * list's own hidden upload input, which is also on the page in split mode. */
function catalogUploadInput(page: Page) {
  return page.locator('label:has-text("Upload module") input[type="file"]');
}

/** A module document as a Playwright upload payload. */
function moduleFile(doc: Record<string, unknown> = MODULE_DOC) {
  return {
    name: `${MODULE}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  };
}

test.describe.serial('the platform state store, end to end', () => {
  test.beforeAll(async () => {
    // Clear a prior run so a re-run against a persisted backend starts clean: the hook
    // must go before the state (a bound consumer refuses the declaration delete), and the
    // module after the state (a mounted module refuses its delete).
    const api = await apiRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    });
    try {
      await api.delete(`/api/hooks/${CONSUMER_HOOK}`).catch(() => undefined);
      await api.delete(`/api/states/${STATE}`).catch(() => undefined);
      await api.delete(`/api/state-modules/${MODULE}`).catch(() => undefined);
    } finally {
      await api.dispose();
    }
  });

  test('declares a state through the Declare dialog', async ({ page }) => {
    await seedCredential(page);
    await page.goto('/states');

    await page.getByRole('button', { name: 'Declare state' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Declare a state' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Name').fill(STATE);
    await dialog.getByLabel('Description').fill('Per-subject notes for the e2e scenario.');
    await dialog.getByLabel('Base schema JSON').fill(JSON.stringify(BASE_SCHEMA));

    // Two subject kinds; the default auto-fills to the first (thread), which is the wanted
    // default, so the Default-kind picker needs no touch.
    const kinds = dialog.getByLabel('Subject kinds');
    await kinds.pressSequentially('thread');
    await kinds.press('Enter');
    await kinds.pressSequentially('person');
    await kinds.press('Enter');
    await expect(dialog.getByLabel('Default subject kind')).toContainText('thread');

    await dialog.getByRole('button', { name: 'Declare' }).click();

    // The dialog closes and the shell opens the new state's detail pane.
    await expect(dialog).toBeHidden();
    await page.waitForURL(new RegExp(`[?&]state=${STATE}(&|$)`));
    const detail = page.getByTestId('state-detail');
    await expect(detail.getByRole('heading', { name: STATE })).toBeVisible();
    // The declared kinds badge the header.
    await expect(detail.getByText('thread', { exact: true }).first()).toBeVisible();
    await expect(detail.getByText('person', { exact: true }).first()).toBeVisible();
  });

  test('uploads a module document and mounts it with its declarations group', async ({ page }) => {
    await seedCredential(page);
    await page.goto(`/states?state=${STATE}&tab=modules`);

    // Upload the module document into the catalog; its row then lists it.
    await catalogUploadInput(page).setInputFiles(moduleFile());
    await expect(page.getByText(MODULE).first()).toBeVisible();

    // Mount it: pick the module + a non-root path, and prove the Declarations group renders
    // (the module declares a `channel`), then commit. Scope past the master list's own
    // table/buttons in the split's left pane — the detail pane owns the Modules tab.
    const detail = page.getByTestId('state-detail');
    await detail.getByRole('button', { name: 'Mount module' }).first().click();
    const dialog = page.getByRole('dialog', { name: `Mount module on '${STATE}'` });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Module').click();
    await page.getByRole('option', { name: new RegExp(`^${MODULE}\\b`) }).click();
    // Mount at the document root: the module's fragment composes a NEW subtree at its path,
    // so the picker's default (root) never shadows an existing property.
    await dialog.getByLabel('Mount path').click();
    await page.getByRole('option', { name: '(root)', exact: true }).click();
    // The module's declaration schema renders as its own group.
    await expect(dialog.getByText('Declarations', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Channel')).toBeVisible();

    await dialog.getByRole('button', { name: 'Mount', exact: true }).click();
    await expect(dialog).toBeHidden();

    // The mounts table (the first table in the detail pane) now carries the module at root.
    const mounts = detail.getByRole('table').first();
    await expect(mounts.getByText(MODULE)).toBeVisible();
    await expect(mounts.getByText('(root)')).toBeVisible();
  });

  test('looks up a subject and creates its record through the schema form', async ({ page }) => {
    await seedCredential(page);
    await page.goto(`/states?state=${STATE}&tab=records`);

    // Address one subject by kind (default thread) + key + target, and open its record page.
    const lookup = page.getByRole('heading', { name: 'Look up a record' }).locator('..');
    await lookup.getByLabel('Key').fill(SUBJECT_KEY);
    await lookup.getByLabel('Target name').fill(TARGET_NAME);
    await page.getByRole('button', { name: 'Lookup' }).click();

    // The lookup opens the subject's record page (the router percent-encodes the `:` in
    // the subject param, so gate on the record surface, not the URL literal).
    await expect(
      page.getByRole('heading', { name: `thread ${SUBJECT_KEY}`, exact: false }),
    ).toBeVisible();
    // No document yet — Create through the schema-seeded form (never a blind PUT {}).
    await page.getByRole('button', { name: 'Create' }).click();
    // Exact label: the state name `e2e_notes` makes a substring `Note` match the
    // "Back to e2e_notes" link too.
    await page.getByLabel('Note', { exact: true }).fill('First note through the schema form.');
    await page.getByRole('button', { name: 'Save' }).click();

    // The stored document renders in the record's document tree.
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(
      page.getByText('First note through the schema form.', { exact: false }),
    ).toBeVisible();
  });

  test('edits the record and the api write shows in the Writes audit with the platform actor', async ({
    page,
  }) => {
    await seedCredential(page);
    await page.goto(RECORD_PATH);

    await page.getByRole('button', { name: 'Edit' }).click();
    const note = page.getByLabel('Note', { exact: true });
    await note.fill('Edited note — the second api write.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Edited note', { exact: false })).toBeVisible();

    // The Writes audit carries the api-door writes, each stamped with the request
    // principal as its actor (the platform completes the origin — a door cannot forge it).
    const writes = page.getByRole('heading', { name: 'Writes' }).locator('..');
    await expect(writes.getByText('api', { exact: true }).first()).toBeVisible();
    await expect(writes.getByText(EXECUTION_KEY_ID, { exact: true }).first()).toBeVisible();
  });

  test('folds the subject into another', async ({ page }) => {
    await seedCredential(page);
    await page.goto(RECORD_PATH);

    const fold = page.getByRole('heading', { name: 'Fold into' }).locator('..');
    await expect(fold.getByRole('button', { name: 'Fold' })).toBeVisible();
    await fold.getByLabel('Key', { exact: true }).fill(FOLD_INTO_KEY);
    await fold.getByRole('button', { name: 'Fold' }).click();

    // A resolved fold clears the target-key field (the mutation's success reset).
    await expect(fold.getByLabel('Key', { exact: true })).toHaveValue('');
  });

  test('shows the hook consumer with an Open link on the Consumers tab', async ({ page }) => {
    // Register a hook whose subject kind the state declares, so the platform's hook
    // consumer-lister binds it to this state. Registered through the real authed door.
    const registered = await page.request.post('/api/hooks', {
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      data: {
        name: CONSUMER_HOOK,
        topic: STATE,
        tool: 'studio_demo_echo',
        execution_key: EXECUTION_KEY_ID,
        subject: {
          target_kind: 'tool',
          target_name: 'studio_demo_echo',
          kind: 'thread',
          key_expr: '.thread_id',
        },
      },
    });
    expect(registered.status()).toBe(200);

    await seedCredential(page);
    await page.goto(`/states?state=${STATE}&tab=consumers`);

    // The hook binds the state, shown as a bound row with an Open link to the Hooks screen.
    const row = page.getByRole('row', { name: new RegExp(CONSUMER_HOOK) });
    await expect(row).toBeVisible();
    // Exact: the Actions cell's "Open hook …" button also carries the substring `hook`.
    await expect(row.getByRole('cell', { name: 'hook', exact: true })).toBeVisible();
    await row.getByRole('button', { name: new RegExp(`Open hook ${CONSUMER_HOOK}`) }).click();
    await page.waitForURL('**/hooks');
  });

  test('prompts the 409 Replace confirm on a duplicate module upload', async ({ page }) => {
    await seedCredential(page);
    await page.goto(`/states?state=${STATE}&tab=modules`);
    await expect(page.getByText(MODULE).first()).toBeVisible();

    // Re-uploading the same name is a first-write clash: the catalog surfaces the deliberate
    // Replace confirm rather than a silent overwrite, and a confirm applies the replace.
    await catalogUploadInput(page).setInputFiles(moduleFile());
    const dialog = page.getByRole('dialog', { name: `Replace module '${MODULE}'?` });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Replace module' }).click();
    await expect(dialog).toBeHidden();
  });

  test('erases the record behind a danger confirm', async ({ page }) => {
    await seedCredential(page);
    await page.goto(RECORD_PATH);

    await page.getByRole('button', { name: 'Erase' }).click();
    const dialog = page.getByRole('dialog', { name: 'Erase record' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Erase' }).click();

    // Erasing returns the subject to the empty-document affordance.
    await expect(page.getByText('No record for this subject yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
  });
});
