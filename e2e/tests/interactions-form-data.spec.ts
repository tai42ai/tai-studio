/**
 * Interactions inbox — the form preview for a per-send `data` + `pages` ask, against
 * the LIVE boot skeleton with the paged pending door and the SSE stream stubbed via
 * `page.route` (the boot skeleton seeds no pending questions), exactly as
 * `interactions.spec.ts` drives the inbox.
 *
 * A pending `form` question carrying `format_payload.schema` + `data` (prefilled values
 * and a per-send option list) + `pages` renders: the schema controls prefilled from
 * `data.values`; a re-optioned field (`date`) as a CHOICE of the send's values rather
 * than a free control; the "Options for this send" value→label mapping; and the
 * "Pages" outline. Abstract fixtures only. The shot pair is the evidence the
 * orchestrator reads (both themes, by tokens).
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { test, expect, type Page } from '@playwright/test';

import { seedCredential } from './helpers';

/** Where the preview shots land: `FORM_SHOTS_DIR` when set, else the gitignored
 * `test-results/` beside the suite. */
const OUT_DIR =
  process.env.FORM_SHOTS_DIR ??
  fileURLToPath(new URL('../test-results/form-shots', import.meta.url));
const VIEWPORT = { width: 1440, height: 900 } as const;

/** One pending form ask: an abstract three-field schema, `count`/`notes` prefilled, a
 * per-send option list on `date`, and two ordered pages. */
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
        date: { type: 'string' },
        count: { type: 'integer' },
        notes: { type: 'string' },
      },
    },
    data: {
      values: { count: 3, notes: 'a note' },
      options: {
        date: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      },
    },
    pages: [
      { title: 'Basics', fields: ['date', 'count'] },
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

test('the form preview shows prefilled values, the per-send options, and the pages outline', async ({
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

  // Block 1 — prefilled values: the schema controls are filled from `data.values`.
  await expect(card.getByLabel('count')).toHaveValue('3');
  await expect(card.getByLabel('notes')).toHaveValue('a note');

  // Block 2 — the re-optioned `date`: a choice of the send's values (two options render
  // as radios; SchemaForm falls back to a select above three), never a free text input
  // an operator could type an out-of-list value into.
  await expect(card.getByRole('radio', { name: 'a' })).toBeVisible();
  await expect(card.getByRole('radio', { name: 'b' })).toBeVisible();
  await expect(card.getByRole('textbox', { name: 'date' })).toHaveCount(0);

  // Block 3 — "Options for this send": the per-send value→label mapping, read-only, so
  // the control's raw values are legible.
  const options = card.getByTestId('form-send-options');
  await expect(options).toContainText('Options for this send');
  await expect(options).toContainText('date');
  await expect(options).toContainText('Option A (a), Option B (b)');

  // Block 4 — "Pages": the step outline, each title over the fields it groups.
  const pages = card.getByTestId('form-pages');
  await expect(pages).toContainText('Pages');
  await expect(pages).toContainText('Basics');
  await expect(pages).toContainText('— date, count');
  await expect(pages).toContainText('Extras');
  await expect(pages).toContainText('— notes');

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
