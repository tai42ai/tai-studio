/**
 * The "Check records against the schema" card, driven end to end against the LIVE boot
 * skeleton (the `states` router + the packaged states chain the boot recipe serves). One
 * composed scenario, several serial legs: declare a state through the Declare dialog; store
 * one record that fits the base schema through the record form; run the card's Check and see
 * every record fit ("All records fit"); then ATTACH a fragment that adds a root `required`
 * field the stored record lacks — so the record no longer fits the effective schema — and run
 * the Check again to see that record listed as a MISFIT with its reason (`path — message`).
 *
 * Serial: each leg builds on the state the previous one left on the shared skeleton, so a
 * failing leg skips the rest (the composed scenario's own semantics). `beforeAll` clears a
 * prior run's artifacts so a re-run against a persisted backend starts clean. The names are
 * distinct from the other state suites (`states.spec` authors `e2e_notes`; `states-shots`
 * seeds `notes`/`preferences`), so the suites never collide on the shared backend.
 */
import { expect, type Page, request as apiRequest } from '@playwright/test';

import { needs, test } from '../needs';
import { BASE_URL } from '../playwright.config';
import { API_KEY, seedCredential } from './helpers';

needs('kind:states', 'mutable');

/** The state, template and subject this scenario authors. */
const STATE = 'e2e_check';
const TEMPLATE = 'e2e-required';
const TARGET_NAME = 'assistant';
const SUBJECT_KEY = 'e2e-c-1';

/** The base schema the Declare dialog authors: one `headline` string and NO `required`, so a
 * record carrying only a headline fits the base schema the record is first stored against. */
const BASE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', title: 'Headline' },
  },
};

/** The fragment attached at the document root. It declares a `status` property AND lists it as
 * `required`, so composing it into the base schema (base ∘ attachment) makes `status` a
 * required root field — one the already-stored `{ headline }` record lacks, turning that record
 * into a misfit against the effective schema without ever rewriting the record. */
const TEMPLATE_DOC = {
  kind: 'state-template',
  name: TEMPLATE,
  description: 'Adds a required status field at the document root.',
  schema: {
    type: 'object',
    properties: { status: { type: 'string', title: 'Status' } },
    required: ['status'],
  },
  parameters: {},
  regimes: [],
};

/** The catalog's file input (the `Upload template` label wraps it). Scoped past the master
 * list's own hidden upload input, which is also on the page in split mode. */
function catalogUploadInput(page: Page) {
  return page.locator('label:has-text("Upload template") input[type="file"]');
}

/** The template document as a Playwright upload payload. */
function templateFile() {
  return {
    name: `${TEMPLATE}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(TEMPLATE_DOC)),
  };
}

test.describe.serial('the check-records card, end to end', () => {
  test.beforeAll(async () => {
    // Clear a prior run so a re-run against a persisted backend starts clean. Referential
    // integrity forces the order: detach the template (an attached template refuses its own
    // delete), then delete the state (its records cascade) and the template.
    const api = await apiRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    });
    try {
      await api.delete(`/api/states/${STATE}/attachments/${TEMPLATE}`).catch(() => undefined);
      await api.delete(`/api/states/${STATE}`).catch(() => undefined);
      await api.delete(`/api/state-templates/${TEMPLATE}`).catch(() => undefined);
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
    await dialog.getByLabel('Description').fill('Records checked against the effective schema.');
    await dialog.getByLabel('Base schema JSON').fill(JSON.stringify(BASE_SCHEMA));

    // One subject kind; the default auto-fills to it (thread), which is the wanted default,
    // so the Default-kind picker needs no touch.
    const kinds = dialog.getByLabel('Subject kinds');
    await kinds.pressSequentially('thread');
    await kinds.press('Enter');

    await dialog.getByRole('button', { name: 'Declare' }).click();

    // The dialog closes and the shell opens the new state's detail pane.
    await expect(dialog).toBeHidden();
    await page.waitForURL(new RegExp(`[?&]state=${STATE}(&|$)`));
    const detail = page.getByTestId('state-detail');
    await expect(detail.getByRole('heading', { name: STATE })).toBeVisible();
  });

  test('stores a record that fits the base schema through the record form', async ({ page }) => {
    await seedCredential(page);
    await page.goto(`/states?state=${STATE}&tab=records`);

    // Address one subject by kind (default thread) + key + target, and open its record page.
    const lookup = page.getByRole('heading', { name: 'Look up a record' }).locator('..');
    await lookup.getByLabel('Key').fill(SUBJECT_KEY);
    await lookup.getByLabel('Target name').fill(TARGET_NAME);
    await page.getByRole('button', { name: 'Lookup' }).click();

    // The lookup opens the subject's record page (the router percent-encodes the `:` in the
    // subject param, so gate on the record surface, not the URL literal).
    await expect(
      page.getByRole('heading', { name: `thread ${SUBJECT_KEY}`, exact: false }),
    ).toBeVisible();
    // No document yet — Create through the schema-seeded form. The record carries only a
    // `headline`, which fits the base schema (no `required` yet).
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByLabel('Headline', { exact: true }).fill('A headline that fits the schema.');
    await page.getByRole('button', { name: 'Save' }).click();

    // The stored document renders in the record's document tree.
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(
      page.getByText('A headline that fits the schema.', { exact: false }),
    ).toBeVisible();
  });

  test('the check lists every record as fitting while the base schema stands', async ({ page }) => {
    await seedCredential(page);
    await page.goto(`/states?state=${STATE}&tab=records`);

    // The card walks the records of the chosen kind (default thread, the subject's kind) live.
    const button = page.getByRole('button', { name: 'Check records' });
    await button.scrollIntoViewIfNeeded();
    await button.click();

    // One record checked, none misfits, and the all-fit empty state stands.
    await expect(page.getByTestId('check-summary')).toHaveText('1 checked — 0 do not fit');
    await expect(page.getByText('All records fit')).toBeVisible();
  });

  test('attaches a fragment that adds a root required field the record lacks', async ({ page }) => {
    await seedCredential(page);
    await page.goto(`/states?state=${STATE}&tab=templates`);

    // Upload the fragment document into the catalog; its row then lists it.
    await catalogUploadInput(page).setInputFiles(templateFile());
    await expect(page.getByText(TEMPLATE).first()).toBeVisible();

    // Attach it at the document root, so its `required: ['status']` composes onto the base
    // schema's root. Scope past the master list's own table/buttons in the split's left pane —
    // the detail pane owns the Templates tab.
    const detail = page.getByTestId('state-detail');
    await detail.getByRole('button', { name: 'Attach template' }).first().click();
    const dialog = page.getByRole('dialog', { name: `Attach template to '${STATE}'` });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Template').click();
    await page.getByRole('option', { name: new RegExp(`^${TEMPLATE}\\b`) }).click();
    await dialog.getByLabel('Attachment path').click();
    await page.getByRole('option', { name: '(root)', exact: true }).click();

    await dialog.getByRole('button', { name: 'Attach', exact: true }).click();
    await expect(dialog).toBeHidden();

    // The attachments table (the first table in the detail pane) now carries the fragment at root.
    const attachments = detail.getByRole('table').first();
    await expect(attachments.getByText(TEMPLATE)).toBeVisible();
    await expect(attachments.getByText('(root)')).toBeVisible();
  });

  test('the check now lists the stored record as a misfit with its reason', async ({ page }) => {
    await seedCredential(page);
    await page.goto(`/states?state=${STATE}&tab=records`);

    const button = page.getByRole('button', { name: 'Check records' });
    await button.scrollIntoViewIfNeeded();
    await button.click();

    // One record checked, one misfit: the `{ headline }` record now lacks the root `status`
    // the attached fragment requires.
    await expect(page.getByTestId('check-summary')).toHaveText('1 checked — 1 do not fit');

    // The misfit row names the subject (its key is the record-page link) and carries the
    // reason as `path — message`: the root path `$`, and jsonschema's missing-required text.
    await expect(page.getByRole('button', { name: SUBJECT_KEY, exact: true })).toBeVisible();
    await expect(page.getByText("'status' is a required property")).toBeVisible();

    // No all-fit empty state while a misfit stands.
    await expect(page.getByText('All records fit')).toHaveCount(0);
  });

  test('opens the misfit record from its row', async ({ page }) => {
    await seedCredential(page);
    await page.goto(`/states?state=${STATE}&tab=records`);

    const button = page.getByRole('button', { name: 'Check records' });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(page.getByTestId('check-summary')).toHaveText('1 checked — 1 do not fit');

    // The misfit subject links to its record page through the shell router. Gate on the
    // record surface (the router percent-encodes the `:` in the subject param).
    await page.getByRole('button', { name: SUBJECT_KEY, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `thread ${SUBJECT_KEY}`, exact: false }),
    ).toBeVisible();
  });
});
