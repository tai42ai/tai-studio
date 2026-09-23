/**
 * run-tool blocking flow, against the LIVE boot skeleton.
 *
 * The contract: run-tool is a synchronous POST that holds the request open; a
 * tool that triggers a human interaction blocks server-side until answered, the
 * panel shows a running state meanwhile, and once the answer arrives the run
 * completes and the RESULT lands on the panel in the typed result viewer.
 *
 * This drives the real auto-form run panel for `ask`, confirms the pending
 * question surfaces on the interactions stream, answers it through the authed
 * /answer door (the second-actor path — exactly how a blocked run is released),
 * and asserts the completed result renders in the typed viewer.
 *
 * (The client-timeout "still executing server-side" state uses a 120s timeout —
 * covered by the shell's unit suite, not this live e2e.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, type Page, test } from '@playwright/test';

import {
  answerInteraction,
  API_KEY,
  EXECUTION_KEY_ID,
  findInteractionId,
  seedCredential,
} from './helpers';

const RUN_PANEL = fileURLToPath(
  new URL('../../packages/features/tools/src/RunPanel.tsx', import.meta.url),
);

/**
 * The positive control for the `tool-run-timeout` absence assertion below.
 *
 * That assertion is a `toHaveCount(0)`, which a testid NOTHING renders satisfies
 * just as well as a state that correctly stayed away — rename the id in
 * `RunPanel.tsx` and the check goes on passing while covering nothing. The live
 * state itself cannot be driven from here: it needs the 120 s client timeout in
 * `run.ts` to expire, a compile-time constant with no env knob, and the suites
 * run serially against one skeleton. So the control joins the name instead:
 * the id the spec names must be the id the panel paints.
 */
test('the timeout testid the absence check names is the one the panel renders', () => {
  const source = readFileSync(RUN_PANEL, 'utf8');
  expect([...source.matchAll(/data-testid="tool-run-timeout"/g)]).toHaveLength(1);
  // Negative control: the reader answers on the file's real contents, not on any
  // string it is handed.
  expect([...source.matchAll(/data-testid="tool-run-never-rendered"/g)]).toHaveLength(0);
});

test('an interactive tool blocks; answering completes the run and the result lands on the panel', async ({
  page,
}) => {
  await seedCredential(page);

  // A unique question so the list-door lookup matches this run's pending question
  // and never a stale one.
  const question = `Approve the e2e run ${String(Date.now())}?`;

  await page.goto('/tools?tool=ask');
  // The ask auto-form (no plugin panel) renders its schema fields.
  await page.getByLabel(/^question/i).fill(question);
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // The panel enters the loud running state while the POST is held open.
  await expect(page.getByText('Running — the tool is executing on the server.')).toBeVisible();

  // The blocked-server-side question is pending, so the list door (GET
  // /api/interactions) returns it — findInteractionId pages that door for its id.
  const interactionId = await findInteractionId(page, question);
  expect(interactionId).toMatch(/[0-9a-f-]{36}/);

  // Answer through the real authed door — this releases the blocked run.
  await answerInteraction(page, interactionId, 'yes proceed');

  // The completed result lands on the panel and renders in the typed viewer. The
  // text answer renders as escaped preformatted text (no HTML sink).
  const resultSection = page.getByRole('heading', { name: 'Result' });
  await expect(resultSection).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('yes proceed')).toBeVisible();
});

test("a failing tool surfaces the server's OWN message loudly on the panel (never swallowed)", async ({
  page,
}) => {
  await seedCredential(page);
  await page.goto('/tools?tool=studio_demo_fail');

  // A unique reason, so the assertion cannot be satisfied by a stale or generic
  // alert. `studio_demo_fail` raises with whatever `reason` carries and the
  // run-tool door returns that text unchanged, so this exact string is what the
  // panel owes the operator — a swallowed or re-worded failure fails here.
  const reason = `intentional e2e failure ${String(Date.now())}`;
  await page.getByLabel(/^reason/i).fill(reason);
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // The GENERIC loud error surface specifically — the "still executing
  // server-side" notice is a `role="alert"` of its own, as is a background-run
  // failure, and any of them would satisfy a bare alert assertion.
  const errorState = page.getByRole('alert').filter({ hasText: 'Something went wrong' });
  await expect(errorState).toBeVisible({ timeout: 15_000 });
  await expect(errorState).toContainText(reason);
  await expect(page.getByTestId('tool-run-timeout')).toHaveCount(0);
  // The run failed, so the typed result viewer must not have rendered.
  await expect(page.getByRole('heading', { name: 'Result' })).toHaveCount(0);
});

/**
 * The run panel's optional Subject section, driven against the LIVE skeleton. These
 * assert the REAL `POST /api/run-tool` body: the collapsed default sends no subject, and
 * an expanded, filled section sends the chosen conversation subject.
 */

/** Capture the next `POST /api/run-tool` request body while `run` fires it. */
async function runToolBody(page: Page, run: () => Promise<void>) {
  const request = page.waitForRequest(
    (req) => req.url().includes('/api/run-tool') && req.method() === 'POST',
  );
  await run();
  return (await request).postDataJSON() as { subject?: unknown };
}

test('the Subject section collapsed by default sends no subject on a plain run', async ({
  page,
}) => {
  await seedCredential(page);
  await page.goto('/tools?tool=studio_demo_form');
  await page.getByLabel('name', { exact: true }).fill('Ada');

  // The Subject section is collapsed, so a plain run must send no `subject`.
  const body = await runToolBody(page, async () => {
    await page.getByRole('button', { name: 'Run', exact: true }).click();
  });
  expect(body.subject).toBeUndefined();
});

test('an expanded, filled Subject section sends the chosen subject on the run', async ({
  page,
}) => {
  await seedCredential(page);

  // A real conversation route so the Subject target select offers a target to pick; its
  // tool target needs no LLM to bind (the attach check accepts a mapped tool door).
  const routeName = `subject-e2e-${String(Date.now())}`;
  const created = await page.request.post(`/api/conversations/${routeName}`, {
    headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    data: {
      door: 'api',
      target_kind: 'tool',
      target_name: 'studio_demo_echo',
      start_expr: { content: '{ message: .message }' },
      reply_expr: { content: '{ text: .result }' },
      execution_key: EXECUTION_KEY_ID,
      callback_url: 'https://run-tool-subject.invalid/cb',
    },
  });
  expect(created.status()).toBe(200);

  await page.goto('/tools?tool=studio_demo_form');
  await page.getByLabel('name', { exact: true }).fill('Ada');

  await page.getByRole('button', { name: 'Subject (optional)' }).click();
  // The target select's accessible name is its Field label ('Target'); the wrapping
  // Field id outranks the section's `aria-label`.
  await page.getByRole('combobox', { name: 'Target' }).click();
  await page.getByRole('option', { name: 'tool · studio_demo_echo' }).click();
  await page.getByLabel('Subject kind').fill('person');
  await page.getByLabel('Subject key').fill('a-42');

  const body = await runToolBody(page, async () => {
    await page.getByRole('button', { name: 'Run', exact: true }).click();
  });
  expect(body.subject).toEqual({
    target_kind: 'tool',
    target_name: 'studio_demo_echo',
    kind: 'person',
    key: 'a-42',
  });
});

test('the Subject toggle is reachable and operable from the keyboard', async ({ page }) => {
  await seedCredential(page);
  await page.goto('/tools?tool=studio_demo_form');
  await expect(page.getByRole('button', { name: 'Run in background' })).toBeVisible();

  const toggle = page.getByRole('button', { name: 'Subject (optional)' });
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Subject kind')).toBeVisible();
});

/**
 * The read-only caller-ask surfaces the run panel shows when a synchronous run parked.
 * A `to="caller"` async ask needs a resuming driver bound, so these drive the reference
 * plugin's `parking_ask` — it binds its resume continuation and asks the caller — and read
 * back the REAL caller-asks envelope the run-tool door returns: the asks list (its prompt +
 * copyable id), the bounded truncated many-ask layout with keyboard reach, and a user-only
 * park's "no open asks" note.
 */

/** Seed a tool conversation route so the run panel's Subject target select offers a target. */
async function createToolRoute(page: Page, name: string): Promise<void> {
  const created = await page.request.post(`/api/conversations/${name}`, {
    headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    data: {
      door: 'api',
      target_kind: 'tool',
      target_name: 'studio_demo_echo',
      start_expr: { content: '{ message: .message }' },
      reply_expr: { content: '{ text: .result }' },
      execution_key: EXECUTION_KEY_ID,
      callback_url: 'https://parking-ask-subject.invalid/cb',
    },
  });
  expect(created.status()).toBe(200);
}

/** Expand the Subject section and fill it against the seeded tool route, so a caller ask
 *  the run parks is subject-indexed. */
async function fillSubject(page: Page, kind: string, key: string): Promise<void> {
  await page.getByRole('button', { name: 'Subject (optional)' }).click();
  await page.getByRole('combobox', { name: 'Target' }).click();
  // The serial suite accumulates several routes on the one skeleton, each an option with
  // the same `tool · studio_demo_echo` label; any resolves the target, so take the first.
  await page.getByRole('option', { name: 'tool · studio_demo_echo' }).first().click();
  await page.getByLabel('Subject kind').fill(kind);
  await page.getByLabel('Subject key').fill(key);
}

test('a caller-ask run renders the read-only asks list with the prompt and its copyable id', async ({
  page,
}) => {
  await seedCredential(page);
  await createToolRoute(page, `parking-list-${String(Date.now())}`);

  const prompt = `Approve the caller ask ${String(Date.now())}?`;
  await page.goto('/tools?tool=parking_ask');
  await page.getByLabel(/^prompt$/i).fill(prompt);
  await fillSubject(page, 'thread', `k-${String(Date.now())}`);
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  const list = page.getByTestId('asks-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(list.getByTestId('ask-row')).toHaveCount(1);
  await expect(list.getByText(prompt)).toBeVisible();
  // The id an operator copies into a resume_parked run carries its accessible label.
  await expect(list.getByLabel(/^Ask id [0-9a-f-]{36}$/)).toBeVisible();
});

test('a run that parks only a user ask shows the read-only "no open asks" note', async ({
  page,
}) => {
  await seedCredential(page);

  const prompt = `User park ${String(Date.now())}?`;
  await page.goto('/tools?tool=parking_ask');
  await page.getByLabel(/^prompt$/i).fill(prompt);
  // Addressed to the user, not the caller: the run parks with no caller ask for the
  // panel to list, so it shows the empty note rather than an asks list.
  await page.getByLabel(/^to$/i).fill('user');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  await expect(page.getByTestId('run-parked-note')).toHaveText(
    'This run parked with no open asks.',
    { timeout: 15_000 },
  );
  await expect(page.getByTestId('asks-list')).toHaveCount(0);

  // Resolve the parked user ask so it never lingers as a pending human question on the
  // shared skeleton's inbox badge.
  const interactionId = await findInteractionId(page, prompt);
  await answerInteraction(page, interactionId, 'done');
});

test('many long caller asks truncate in a bounded, inner-scrolling list; each id stays reachable', async ({
  page,
}) => {
  await seedCredential(page);
  await createToolRoute(page, `parking-many-${String(Date.now())}`);

  const longPrompt = 'A very long caller-ask prompt that must clip to one line '.repeat(3).trim();
  await page.goto('/tools?tool=parking_ask');
  await page.getByLabel(/^prompt$/i).fill(longPrompt);
  await page.getByLabel(/^count$/i).fill('12');
  await fillSubject(page, 'thread', `k-${String(Date.now())}`);
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  const list = page.getByTestId('asks-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(list.getByTestId('ask-row')).toHaveCount(12);

  // The list scrolls within its own bounded height rather than growing the panel.
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  // A pane that scrolls must be reachable without a pointer (WCAG 2.1.1): while it
  // overflows the list IS a focusable, named scroll region, so a keyboard user can land
  // on it and drive it. The read-only rows carry no tab stops of their own, so this is
  // the only way to reach the hidden asks by keyboard.
  const region = page.getByRole('region', { name: 'Caller asks' });
  await expect(region).toHaveAttribute('tabindex', '0');
  // The region IS the asks list itself (its own scrolling box), not a wrapper.
  await expect(region).toHaveAttribute('data-testid', 'asks-list');
  await region.focus();
  await expect(region).toBeFocused();
  // Arrow keys scroll the focused region, bringing the clipped-off asks into view.
  expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // Each prompt clips to one line but keeps its full text as a title tooltip.
  const firstPrompt = list.getByTestId('ask-row').first().locator('p').first();
  await expect(firstPrompt).toHaveAttribute('title', /A very long caller-ask prompt/);
  expect(await firstPrompt.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');

  // Every row stays reachable despite the truncation: each id an operator copies into a
  // resume_parked run keeps its accessible label and whole-in-one-gesture selection, so a
  // clipped prompt never hides the row's actionable value from assistive tech.
  await expect(list.getByLabel(/^Ask id [0-9a-f-]{36}$/)).toHaveCount(12);
  const firstId = list.getByLabel(/^Ask id [0-9a-f-]{36}$/).first();
  expect(await firstId.evaluate((el) => getComputedStyle(el).userSelect)).toBe('all');
});
