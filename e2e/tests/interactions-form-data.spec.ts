/**
 * Interactions inbox — the form preview for a per-send `data` + `pages` ask, against
 * the LIVE boot skeleton with the paged pending door and the SSE stream stubbed via
 * `page.route` (the boot skeleton seeds no pending questions), exactly as
 * `interactions.spec.ts` drives the inbox.
 *
 * A pending `form` question carrying `format_payload.schema` + `data` (prefilled values
 * and a per-send option list) + `pages` renders: the schema controls prefilled from
 * `data.values`; a `format: date` field as the browser's native date control
 * (`<input type="date">`, prefilled with the `YYYY-MM-DD` value); one `inputMode` string
 * field per kind, each drawing its native control or keyboard hint (`email`/`url`/`tel`
 * as the matching `<input type>`, `numeric`/`decimal` as a text box with the `inputmode`
 * keyboard hint, `text` plain) with the value kept as the typed string; a re-optioned field
 * (`choice`) as a CHOICE of the send's values rather than a free control; the "Options
 * for this send" value→label mapping; and the two pages as REAL navigable steps (a
 * "Step N of M" status with Back/Next, only the current step's fields shown). Abstract
 * fixtures only. The shot pair is captured in both themes, by tokens, for visual review.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';

needs();

/** Where the preview shots land: `FORM_SHOTS_DIR` when set, else the gitignored
 * `test-results/` beside the suite. */
const OUT_DIR =
  process.env.FORM_SHOTS_DIR ??
  fileURLToPath(new URL('../test-results/form-shots', import.meta.url));
const VIEWPORT = { width: 1440, height: 900 } as const;

/** One pending form ask: an abstract schema — `starts_on` (a `format: date` string),
 * `count`/`notes` prefilled, a per-send option list on `choice`, one `inputMode` string
 * field per kind (`contact`→email, `site`→url, `phone`→tel, `code`→numeric,
 * `amount`→decimal, `note`→text), and two ordered pages. `code` is prefilled `"007"` to
 * show a numeric field keeps the typed string (a keyboard hint, never a number
 * coercion). */
const FORM_INTERACTION = {
  interaction_id: 'form-preview-1',
  group_id: 'form-preview-1',
  answer_format: 'form',
  question: 'Fill in the details',
  created_at: '2026-08-01T00:00:00.000Z',
  timeout_at: '2026-08-09T00:00:00.000Z',
  format_payload: {
    schema: {
      type: 'object',
      properties: {
        starts_on: { type: 'string', format: 'date' },
        choice: { type: 'string' },
        count: { type: 'integer' },
        contact: { type: 'string', inputMode: 'email' },
        site: { type: 'string', inputMode: 'url' },
        phone: { type: 'string', inputMode: 'tel' },
        code: { type: 'string', inputMode: 'numeric' },
        amount: { type: 'string', inputMode: 'decimal' },
        note: { type: 'string', inputMode: 'text' },
        notes: { type: 'string' },
      },
    },
    data: {
      values: { starts_on: '2026-08-05', count: 3, code: '007', notes: 'a note' },
      options: {
        choice: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      },
    },
    pages: [
      {
        title: 'Basics',
        fields: [
          'starts_on',
          'choice',
          'count',
          'contact',
          'site',
          'phone',
          'code',
          'amount',
          'note',
        ],
      },
      { title: 'Extras', fields: ['notes'] },
    ],
  },
};

/** The paged base the inbox seeds from — one pending form question. */
const PENDING_PAGE = {
  data: {
    items: [FORM_INTERACTION],
    total: 1,
    page: 1,
    page_size: 50,
    next_page: null,
    truncated: false,
  },
};

/** A tail-only stream: an open SSE body with no backlog and no delta frames. */
const STREAM_BODY = [':keepalive', '', ''].join('\n');

async function stubInbox(page: Page): Promise<void> {
  await seedCredential(page);
  // The inbox's "Delivery channels" catalog card GETs this on mount; an empty catalog
  // renders its own quiet note, keeping the shot to the form preview under test.
  await page.route(
    (url) => url.pathname === '/api/channels',
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: { channels: [] } }),
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/interactions',
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(PENDING_PAGE),
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/interactions/stream',
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: STREAM_BODY,
      });
    },
  );
}

test.use({ viewport: VIEWPORT });

test('the form preview shows prefilled values, the per-send options, and navigable stepped pages', async ({
  page,
}) => {
  await stubInbox(page);
  // Load in a genuine light context so the first paint themes light, matching the
  // frame captured below (mirrors `states-shots.spec.ts`, which pins the scheme on the
  // context before it navigates).
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/interactions');

  const card = page.getByTestId('interaction-card').filter({ hasText: 'Fill in the details' });
  await expect(card).toBeVisible();

  // The form renders as a REAL stepper: a "Step N of M — Title" status and Back/Next
  // navigation, showing only the current page's fields. The first step is "Basics".
  const stepStatus = card.getByTestId('form-step-status');
  await expect(stepStatus).toContainText('Step 1 of 2 — Basics');

  // Block 1 — prefilled values on the Basics step: the schema controls are filled from
  // `data.values`. The `format: date` field renders the browser's native date control,
  // prefilled with the ISO `YYYY-MM-DD` value it posts unchanged.
  const startsOn = card.getByLabel('starts_on');
  await expect(startsOn).toHaveAttribute('type', 'date');
  await expect(startsOn).toHaveValue('2026-08-05');
  await expect(card.getByLabel('count')).toHaveValue('3');
  // `notes` belongs to the second page, so the stepper does not show it on step one.
  await expect(card.getByLabel('notes')).toHaveCount(0);

  // Block 2 — the re-optioned `choice`: a choice of the send's values (two options render
  // as radios; SchemaForm falls back to a select above three), never a free text input
  // an operator could type an out-of-list value into.
  await expect(card.getByRole('radio', { name: 'a' })).toBeVisible();
  await expect(card.getByRole('radio', { name: 'b' })).toBeVisible();
  await expect(card.getByRole('textbox', { name: 'choice' })).toHaveCount(0);

  // Block 3 — "Options for this send": the per-send value→label mapping, read-only, so
  // the control's raw values are legible.
  const options = card.getByTestId('form-send-options');
  await expect(options).toContainText('Options for this send');
  await expect(options).toContainText('choice');
  await expect(options).toContainText('Option A (a), Option B (b)');

  // Block 3b — the `inputMode` string fields on the Basics step each draw their kind's
  // native control or keyboard hint. `email`/`url`/`tel` select the matching native
  // `<input type>`; `numeric`/`decimal` keep a text box and set the HTML `inputmode`
  // keyboard hint; `text` is a plain text box with no hint. The value stays the typed
  // string throughout — `code`, prefilled "007", keeps its leading zeros.
  await expect(card.getByLabel('contact', { exact: true })).toHaveAttribute('type', 'email');
  await expect(card.getByLabel('site', { exact: true })).toHaveAttribute('type', 'url');
  await expect(card.getByLabel('phone', { exact: true })).toHaveAttribute('type', 'tel');

  const code = card.getByLabel('code', { exact: true });
  await expect(code).toHaveAttribute('type', 'text');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await expect(code).toHaveValue('007');

  const amount = card.getByLabel('amount', { exact: true });
  await expect(amount).toHaveAttribute('type', 'text');
  await expect(amount).toHaveAttribute('inputmode', 'decimal');

  const note = card.getByLabel('note', { exact: true });
  await expect(note).toHaveAttribute('type', 'text');
  await expect(note).not.toHaveAttribute('inputmode');

  // Block 4 — the pages are REAL navigable steps: advancing to "Extras" reveals its only
  // field, `notes`, prefilled from `data.values`; stepping Back returns to "Basics".
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(stepStatus).toContainText('Step 2 of 2 — Extras');
  await expect(card.getByLabel('notes')).toHaveValue('a note');
  await card.getByRole('button', { name: 'Back' }).click();
  await expect(stepStatus).toContainText('Step 1 of 2 — Basics');

  // The shot pair, in both themes (the SPA resolves `data-theme` from the OS
  // preference). Each frame is a GENUINE themed first paint: the light one from the
  // load above, the dark one after switching the emulated scheme AND reloading. A
  // runtime colour-scheme toggle without a reload is not enough — Chromium leaves a
  // native form control (`<input>`, `<textarea>`) painted for its load-time scheme, so
  // its token-driven `var()` background does not repaint; a dark frame captured that
  // way shows a light input fill under dark text even though the control is themed.
  await mkdir(OUT_DIR, { recursive: true });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: `${OUT_DIR}/form-preview-light.png` });

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(card).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: `${OUT_DIR}/form-preview-dark.png` });
});
