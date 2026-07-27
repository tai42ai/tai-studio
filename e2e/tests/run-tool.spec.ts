/**
 * run-tool blocking flow, against the LIVE boot skeleton.
 *
 * The contract: run-tool is a synchronous POST that holds the request open; a
 * tool that triggers a human interaction blocks server-side until answered, the
 * panel shows a running state meanwhile, and once the answer arrives the run
 * completes and the RESULT lands on the panel in the typed result viewer.
 *
 * This drives the real auto-form run panel for `ask_user`, confirms the pending
 * question surfaces on the interactions stream, answers it through the authed
 * /answer door (the second-actor path — exactly how a blocked run is released),
 * and asserts the completed result renders in the typed viewer.
 *
 * (The client-timeout "still executing server-side" state uses a 120s timeout —
 * covered by the shell's unit suite, not this live e2e.)
 */
import { test, expect } from '@playwright/test';
import { seedCredential, findInteractionId, answerInteraction } from './helpers';

test('an interactive tool blocks; answering completes the run and the result lands on the panel', async ({
  page,
}) => {
  await seedCredential(page);

  // A unique question so the stream lookup can never match a stale backlog entry.
  const question = `Approve the e2e run ${String(Date.now())}?`;

  await page.goto('/tools?tool=ask_user');
  // The ask_user auto-form (no plugin panel) renders its schema fields.
  await page.getByLabel(/^question/i).fill(question);
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // The panel enters the loud running state while the POST is held open.
  await expect(page.getByText('Running — the tool is executing on the server.')).toBeVisible();

  // The question surfaces on the live interactions stream (blocked server-side).
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
