/**
 * Interactions inbox — the form preview for a per-send `data` + `pages` ask, and the
 * caller's platform-drawn texts on both the form and the non-form questions, against the
 * LIVE boot skeleton with the paged pending door and the SSE stream stubbed via
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
 * for this send" value→label mapping, with an option's second line (`description`) after
 * its label and none for a null one; a `control: chips` choice as a ChipGroup (single
 * for a string enum, multi for an array of enum strings); a `control: textarea` string as
 * a `<textarea>` with a live length counter; a drawable `rangeStart` date pair as ONE
 * range control (and the two-field degrade when a sibling's `visibleWhen` names an end);
 * the two pages as REAL navigable steps (a "Step N of M" status with the caller's
 * `button_label` / `wording.form.back` words, only the current step's fields shown).
 *
 * A pending non-form question renders its answer control with the caller's one `wording`
 * catalogue where the inbox draws one: a `select`'s choice prompt (`wording.choice.label`)
 * and submit button (`wording.answer.submit`), a `confirm`'s affirmative and negative
 * buttons (`wording.answer.confirm` / `.decline`), a `text`'s reply placeholder
 * (`wording.answer.reply_hint`), an `external` link's open button (`wording.answer.open`);
 * a page-less `form` draws its terminal button (`wording.form.submit`) and a field's picker
 * placeholder (`wording.form.fields[name].choice_label`). Abstract fixtures only. The form
 * shot pair is captured in both themes, by tokens, for visual review.
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
 * `amount`→decimal, `note`→text), a `control: chips` choice as a string enum (`priority`)
 * and an array of enum strings (`tags`), a `control: textarea` string with a drawn
 * maximum (`summary`), a drawable date range (`trip_start`/`trip_end`) and a date pair a
 * sibling's `visibleWhen` keeps as two fields (`win_start`/`win_end` + `win_note`), and
 * four ordered pages. `code` is prefilled `"007"` to show a numeric field keeps the typed
 * string (a keyboard hint, never a number coercion). The `pages` carry the caller's
 * primary-button words (`button_label`) and `wording.form.back` carries the caller's Back
 * word. */
const FORM_INTERACTION = {
  interaction_id: 'form-preview-1',
  group_id: 'form-preview-1',
  answer_format: 'form',
  question: 'Fill in the details',
  created_at: '2026-08-01T00:00:00.000Z',
  timeout_at: '2026-08-09T00:00:00.000Z',
  sensitive: false,
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
        // `control: chips` — a string enum draws as a single-select chip grid, an array
        // of enum strings as a multi-select chip grid.
        priority: { type: 'string', enum: ['low', 'medium', 'high'], control: 'chips' },
        tags: {
          type: 'array',
          items: { type: 'string', enum: ['alpha', 'beta', 'gamma'] },
          control: 'chips',
        },
        // `control: textarea` — a multi-line text control; `maxLength` draws a live counter.
        summary: { type: 'string', control: 'textarea', maxLength: 200 },
        // A drawable date range: the END names its START in `rangeStart`; both are
        // `format: date`, neither is depended on, so the pair draws as ONE range control.
        trip_start: { type: 'string', format: 'date', title: 'Trip start' },
        trip_end: {
          type: 'string',
          format: 'date',
          title: 'Trip end',
          rangeStart: 'trip_start',
        },
        // A date pair that CANNOT merge: `win_note`'s `visibleWhen` names the end, so
        // merging would strand its predicate — the pair stays two date fields (the
        // documented degrade), and the sibling resolves against the scalar end control.
        win_start: { type: 'string', format: 'date', title: 'Window start' },
        win_end: {
          type: 'string',
          format: 'date',
          title: 'Window end',
          rangeStart: 'win_start',
        },
        win_note: {
          type: 'string',
          title: 'Window note',
          visibleWhen: { field: 'win_end', notEmpty: true },
        },
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
        // The caller's word for the page's primary (advance) button, else "Next".
        button_label: 'Continue',
      },
      { title: 'Controls', fields: ['priority', 'tags', 'summary'] },
      { title: 'Dates', fields: ['trip_start', 'trip_end', 'win_start', 'win_end', 'win_note'] },
      // The caller's word for the LAST page's primary (submit) button, else "Submit".
      { title: 'Extras', fields: ['notes'], button_label: 'Send' },
    ],
    // The caller's one wording catalogue. The inbox draws the form inline, so of the form
    // chapter it reads `back` here (the stepped form's Back button).
    wording: { form: { back: 'Previous' } },
  },
};

/** The paged base the form preview seeds from — one pending form question. */
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

/** One pending form question whose per-send options carry a second line: `early` with a
 * `description`, `late` with a null one. */
const SECOND_LINE_PAGE = {
  data: {
    items: [
      {
        interaction_id: 'form-second-line-1',
        group_id: 'form-second-line-1',
        answer_format: 'form',
        question: 'Pick a slot',
        created_at: '2026-08-01T00:00:00.000Z',
        timeout_at: '2026-08-09T00:00:00.000Z',
        sensitive: false,
        format_payload: {
          schema: { type: 'object', properties: { slot: { type: 'string' } } },
          data: {
            options: {
              slot: [
                { value: 'early', label: 'Early', description: 'Opens at 9:00' },
                { value: 'late', label: 'Late', description: null },
              ],
            },
          },
        },
      },
    ],
    total: 1,
    page: 1,
    page_size: 50,
    next_page: null,
    truncated: false,
  },
};

/** Five pending questions, each drawing a caller-labelled control from the one `wording`
 * catalogue: a 4-option `select` (a Select past three options, prompt from
 * `wording.choice.label`, submit from `wording.answer.submit`), a `confirm` (affirmative
 * from `wording.answer.confirm`, negative from `wording.answer.decline`), a `text` (reply
 * placeholder from `wording.answer.reply_hint`, submit from `wording.answer.submit`), an
 * `external` link (open button from `wording.answer.open`), and a page-less `form` (terminal
 * button from `wording.form.submit`, a select field's placeholder from
 * `wording.form.fields[name].choice_label`). */
const LABELS_PAGE = {
  data: {
    items: [
      {
        interaction_id: 'sel-1',
        group_id: 'sel-1',
        sensitive: false,
        answer_format: 'select',
        question: 'Which lane should we use?',
        created_at: '2026-08-01T00:00:00.000Z',
        timeout_at: '2026-08-09T00:00:00.000Z',
        format_payload: {
          options: ['north', 'south', 'east', 'west'],
          wording: { choice: { label: 'Pick a lane' }, answer: { submit: 'Send pick' } },
        },
      },
      {
        interaction_id: 'cf-1',
        group_id: 'cf-1',
        sensitive: false,
        answer_format: 'confirm',
        question: 'Ready to proceed?',
        created_at: '2026-08-01T00:00:01.000Z',
        timeout_at: '2026-08-09T00:00:00.000Z',
        format_payload: { wording: { answer: { confirm: 'Approve', decline: 'Not now' } } },
      },
      {
        interaction_id: 'tx-1',
        group_id: 'tx-1',
        sensitive: false,
        answer_format: 'text',
        question: 'Any extra notes?',
        created_at: '2026-08-01T00:00:02.000Z',
        timeout_at: '2026-08-09T00:00:00.000Z',
        format_payload: {
          wording: { answer: { reply_hint: 'Type your reply here', submit: 'Send answer' } },
        },
      },
      {
        interaction_id: 'ex-1',
        group_id: 'ex-1',
        sensitive: false,
        answer_format: 'external',
        question: 'Review the external portal',
        created_at: '2026-08-01T00:00:03.000Z',
        timeout_at: '2026-08-09T00:00:00.000Z',
        format_payload: {
          url: 'https://example.com/portal',
          wording: { answer: { open: 'Open portal' } },
        },
      },
      {
        interaction_id: 'sf-1',
        group_id: 'sf-1',
        sensitive: false,
        answer_format: 'form',
        question: 'Choose a lane and submit',
        created_at: '2026-08-01T00:00:04.000Z',
        timeout_at: '2026-08-09T00:00:00.000Z',
        format_payload: {
          // A six-option enum draws as a select (above the radio threshold), so its
          // placeholder is observable; a page-less form takes `wording.form.submit`.
          schema: {
            type: 'object',
            properties: {
              lane: {
                type: 'string',
                enum: ['north', 'south', 'east', 'west', 'up', 'down'],
                title: 'Lane',
              },
            },
          },
          wording: {
            form: { submit: 'Send it', fields: { lane: { choice_label: 'Pick a lane' } } },
          },
        },
      },
    ],
    total: 5,
    page: 1,
    page_size: 50,
    next_page: null,
    truncated: false,
  },
};

/** A tail-only stream: an open SSE body with no backlog and no delta frames. */
const STREAM_BODY = [':keepalive', '', ''].join('\n');

/** Stub the inbox doors around a given pending page (the credential, an empty channels
 * catalog, the paged pending set, and a tail-only stream). */
async function stubInbox(page: Page, pending: unknown = PENDING_PAGE): Promise<void> {
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
        body: JSON.stringify(pending),
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

test('the form preview shows prefilled values, the per-send options, the drawn controls, and navigable stepped pages', async ({
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

  // The form renders as a REAL stepper: a "Step N of M — Title" status and the caller's
  // navigation words, showing only the current page's fields. The first step is "Basics".
  const stepStatus = card.getByTestId('form-step-status');
  await expect(stepStatus).toContainText('Step 1 of 4 — Basics');

  // Block 1 — prefilled values on the Basics step: the schema controls are filled from
  // `data.values`. The `format: date` field renders the browser's native date control,
  // prefilled with the ISO `YYYY-MM-DD` value it posts unchanged.
  const startsOn = card.getByLabel('starts_on');
  await expect(startsOn).toHaveAttribute('type', 'date');
  await expect(startsOn).toHaveValue('2026-08-05');
  await expect(card.getByLabel('count')).toHaveValue('3');
  // `notes` belongs to the last page, so the stepper does not show it on step one.
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

  // Block 3c — the caller's primary-button word: the Basics page's `button_label` is
  // "Continue", so the advance button reads it in place of the surface's own "Next".
  const advance = card.getByRole('button', { name: 'Continue' });
  await expect(advance).toBeVisible();
  await expect(card.getByRole('button', { name: 'Next' })).toHaveCount(0);

  // The light shot of the Basics step — a genuine themed first paint, captured before any
  // navigation so it reads the step the schema controls fill.
  await mkdir(OUT_DIR, { recursive: true });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: `${OUT_DIR}/form-preview-light.png` });

  // Block 4 — advance to "Controls": the `control: chips` and `control: textarea` draws.
  await advance.click();
  await expect(stepStatus).toContainText('Step 2 of 4 — Controls');

  // A string enum with `control: chips` draws as a single-select chip grid: a field group
  // named by its field, wrapping a radiogroup of `role="radio"` pill chips. Choosing one checks it.
  const priority = card.getByRole('group', { name: 'priority' });
  await expect(priority).toBeVisible();
  await expect(card.getByRole('radiogroup')).toBeVisible();
  const medium = card.getByRole('radio', { name: 'medium' });
  await expect(medium).toHaveClass(/tai-chip/);
  await expect(medium).toHaveAttribute('aria-checked', 'false');
  await medium.click();
  await expect(medium).toHaveAttribute('aria-checked', 'true');

  // An array of enum strings with `control: chips` draws as a multi-select chip grid: a
  // group named by its field, of `aria-pressed` toggle-button pill chips. Any number toggle.
  const tags = card.getByRole('group', { name: 'tags' });
  await expect(tags).toBeVisible();
  const alpha = card.getByRole('button', { name: 'alpha' });
  await expect(alpha).toHaveClass(/tai-chip/);
  await expect(alpha).toHaveAttribute('aria-pressed', 'false');
  await alpha.click();
  await expect(alpha).toHaveAttribute('aria-pressed', 'true');

  // A string with `control: textarea` draws as a multi-line `<textarea>`; its `maxLength`
  // caps input AND draws a live "n / max" counter that follows the typed length.
  const summary = card.getByLabel('summary');
  await expect(summary).toHaveAttribute('maxlength', '200');
  expect(await summary.evaluate((el) => el.tagName)).toBe('TEXTAREA');
  await expect(card.getByText('0 / 200')).toBeVisible();
  await summary.fill('hello');
  await expect(card.getByText('5 / 200')).toBeVisible();

  // Block 5 — advance to "Dates": the date-range draws (merged pair, and the two-field
  // degrade). This page carries no `button_label`, so the advance button is "Next".
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(stepStatus).toContainText('Step 3 of 4 — Dates');

  // The drawable pair (`trip_start`/`trip_end`) renders as ONE range control: a group
  // labelled with both ends' titles, holding the two native date inputs side by side.
  const tripRange = card.getByRole('group', { name: 'Trip start – Trip end' });
  await expect(tripRange).toBeVisible();
  await expect(card.getByLabel('Trip start', { exact: true })).toHaveAttribute('type', 'date');
  await expect(card.getByLabel('Trip end', { exact: true })).toHaveAttribute('type', 'date');

  // The pair a sibling depends on (`win_note.visibleWhen` names `win_end`) does NOT merge:
  // there is no combined range group, and the two ends draw as separate date fields so the
  // sibling's predicate resolves against the scalar end control.
  await expect(card.getByText('Window start – Window end')).toHaveCount(0);
  const winEnd = card.getByLabel('Window end');
  await expect(card.getByLabel('Window start')).toHaveAttribute('type', 'date');
  await expect(winEnd).toHaveAttribute('type', 'date');
  // The sibling is hidden until its `visibleWhen` field is non-empty; filling the end
  // (the separate scalar control) reveals it.
  await expect(card.getByLabel('Window note')).toHaveCount(0);
  await winEnd.fill('2026-09-10');
  await expect(card.getByLabel('Window note')).toBeVisible();

  // Block 6 — advance to "Extras": the last page shows its only field, `notes`, prefilled
  // from `data.values`, and its primary button carries the caller's `button_label` "Send"
  // in place of the surface's own "Submit".
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(stepStatus).toContainText('Step 4 of 4 — Extras');
  await expect(card.getByLabel('notes')).toHaveValue('a note');
  await expect(card.getByRole('button', { name: 'Send' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Submit' })).toHaveCount(0);

  // Block 7 — the caller's Back word: `wording.form.back` is "Previous", so the back
  // button reads it in place of the surface's own "Back"; it steps back one page.
  const back = card.getByRole('button', { name: 'Previous' });
  await expect(back).toBeVisible();
  await expect(card.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await back.click();
  await expect(stepStatus).toContainText('Step 3 of 4 — Dates');

  // The dark shot: a GENUINE themed first paint. A reload resets the stepper to the
  // Basics step and repaints every native control for the dark scheme — a runtime
  // colour-scheme toggle without a reload is not enough, because Chromium leaves a
  // native form control (`<input>`, `<textarea>`) painted for its load-time scheme, so
  // its token-driven `var()` background does not repaint; a dark frame captured that way
  // shows a light input fill under dark text even though the control is themed.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(card).toBeVisible();
  await expect(stepStatus).toContainText('Step 1 of 4 — Basics');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: `${OUT_DIR}/form-preview-dark.png` });
});

test("the per-send options legend shows an option's second line, and none for a null description", async ({
  page,
}) => {
  await stubInbox(page, SECOND_LINE_PAGE);
  await page.goto('/interactions');

  const card = page.getByTestId('interaction-card').filter({ hasText: 'Pick a slot' });
  await expect(card).toBeVisible();

  // A non-blank `description` reads ` — <description>` after `label (value)`; a null one
  // adds nothing, so that option reads `label (value)` alone.
  const options = card.getByTestId('form-send-options');
  await expect(options).toContainText('slot');
  await expect(options).toContainText('Early (early) — Opens at 9:00, Late (late)');
});

test("a non-form question draws its answer control with the caller's platform-drawn text", async ({
  page,
}) => {
  await stubInbox(page, LABELS_PAGE);
  await page.goto('/interactions');
  await expect(page.getByRole('heading', { name: 'Interactions' })).toBeVisible();

  // A `select` past three options draws a Select, and the caller's `wording.choice.label`
  // is both the field's label (the trigger's accessible name) and the placeholder it echoes
  // with a trailing ellipsis — in place of the surface's own "Choose an option"; its submit
  // button reads `wording.answer.submit`.
  const selectCard = page
    .getByTestId('interaction-card')
    .filter({ hasText: 'Which lane should we use?' });
  await expect(selectCard.getByRole('combobox', { name: 'Pick a lane' })).toBeVisible();
  await expect(selectCard.getByText('Pick a lane…')).toBeVisible();
  await expect(selectCard.getByRole('button', { name: 'Send pick' })).toBeVisible();
  await expect(selectCard.getByRole('button', { name: 'Submit' })).toHaveCount(0);

  // A `confirm` draws its affirmative button with `wording.answer.confirm` in place of the
  // surface's own "Yes", and its negative with `wording.answer.decline` in place of "No".
  const confirmCard = page.getByTestId('interaction-card').filter({ hasText: 'Ready to proceed?' });
  await expect(confirmCard.getByRole('button', { name: 'Approve' })).toBeVisible();
  await expect(confirmCard.getByRole('button', { name: 'Yes' })).toHaveCount(0);
  await expect(confirmCard.getByRole('button', { name: 'Not now' })).toBeVisible();
  await expect(confirmCard.getByRole('button', { name: 'No', exact: true })).toHaveCount(0);

  // A `text` question draws `wording.answer.reply_hint` as the reply input's placeholder
  // (the "Your answer" label stands) and `wording.answer.submit` on its button.
  const textCard = page.getByTestId('interaction-card').filter({ hasText: 'Any extra notes?' });
  await expect(textCard.getByLabel('Your answer')).toHaveAttribute(
    'placeholder',
    'Type your reply here',
  );
  await expect(textCard.getByRole('button', { name: 'Send answer' })).toBeVisible();
  await expect(textCard.getByRole('button', { name: 'Submit' })).toHaveCount(0);

  // An `external` link draws `wording.answer.open` as the open button's label, in place of
  // its default (the URL itself).
  const externalCard = page
    .getByTestId('interaction-card')
    .filter({ hasText: 'Review the external portal' });
  await expect(externalCard.getByRole('link', { name: 'Open portal' })).toBeVisible();

  // A page-less `form` draws its terminal button from `wording.form.submit` (in place of
  // the surface's own "Submit") and the select field's placeholder from
  // `wording.form.fields[name].choice_label` (in place of the default "Select…").
  const formCard = page
    .getByTestId('interaction-card')
    .filter({ hasText: 'Choose a lane and submit' });
  await expect(formCard.getByRole('button', { name: 'Send it' })).toBeVisible();
  await expect(formCard.getByRole('button', { name: 'Submit' })).toHaveCount(0);
  await expect(formCard.getByRole('combobox', { name: 'Lane' })).toContainText('Pick a lane');
});
