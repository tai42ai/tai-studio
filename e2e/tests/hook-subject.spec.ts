/**
 * The hook form's Subject group, against the LIVE boot skeleton with the reads it depends
 * on served through `page.route`: the conversation routes its target list is drawn from,
 * the storage-presence signal and the template catalog its key expression offers stored
 * templates from, and (for the edit leg) the hooks list. The register write is served
 * too, so the case reads the body the form sends.
 *
 * Legs: a subject filled with a target, a kind and a stored-template key expression with
 * a render parameter is sent as such; and the Edit door on a hook whose subject key is a
 * stored template shows that template and its parameters and saves them back unchanged.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { pickExecutionKey, seedCredential } from './helpers';
import { bodyOf, nextRequest, serveWrite, stubRead } from './session-stubs';

needs('kind:studio_plugins:reference_plugin');

/** The stored templates the catalog lists. */
const CATALOG = ['subject-key', 'actor-key'] as const;

/** The conversation route the subject's target is chosen from. */
const ROUTE = {
  route_name: 'assistant-line',
  door: 'channel',
  channel: 'web',
  target_kind: 'agent',
  target_name: 'assistant',
  start_expr: null,
  reply_expr: null,
  execution_key: 'studio-e2e',
  execution_key_fingerprint: 'fp-demo',
  initial_mode: 'agent',
  our_identity: '+10000000000',
  callback_url: null,
  turns_per_hour_override: null,
  reply_texts: null,
  callback_secret: null,
  locale: null,
  overlap: { running: 'continue', deliver: 'one', settle_seconds: 0 },
} as const;

/** The subject a hook keys its state writes to: a stored template with one parameter. */
const STORED_SUBJECT = {
  target_kind: 'agent',
  target_name: 'assistant',
  kind: 'person',
  key_expr: { id: CATALOG[1], kwargs: { field: 'actor' } },
} as const;

/** An existing hook whose subject key is {@link STORED_SUBJECT}'s stored template. */
const HOOK = {
  name: 'keyed-events',
  topic: 'events.created',
  tool: 'studio_demo_echo',
  execution_key: 'studio-e2e',
  execution_key_fingerprint: 'e2e00000000000000000000000000000',
  tool_kwargs: {},
  condition: null,
  start_expr: null,
  cancel_expr: null,
  resume_expr: null,
  extras_expr: null,
  subject: STORED_SUBJECT,
} as const;

const KEY = 'Key expression';

const isHooks = (pathname: string): boolean => pathname === '/api/hooks';

/** Serve the reads the Subject group draws from, and the register write. */
async function stubSubjectReads(page: Page, hooks: readonly unknown[]): Promise<void> {
  await seedCredential(page);
  await stubRead(page, '/api/conversations', {
    data: { items: [ROUTE], total: 1, page: 1, page_size: 100, next_page: null, truncated: false },
  });
  await stubRead(page, '/api/storage', {
    data: { present: true, provider: 'demo', module: 'demo', surfaces: ['storage', 'templates'] },
  });
  await stubRead(page, '/api/templates', { data: CATALOG });
  await stubRead(page, '/api/hooks', {
    data: { items: hooks, total: hooks.length, topic_verifiers: {}, trigger_auth: {} },
  });
  await serveWrite(page, 'POST', isHooks, { data: { name: HOOK.name, registered: true } });
}

/** The render-parameter group of the key expression. */
function keyParameters(scope: Locator): Locator {
  return scope.getByRole('group', { name: `${KEY} render parameters` });
}

test('a subject with a stored-template key expression is sent with its template and parameters', async ({
  page,
}) => {
  await stubSubjectReads(page, []);
  await page.goto('/hooks');

  const form = page.getByRole('form', { name: 'Register hook' });
  await form.getByLabel('Name').fill(HOOK.name);
  await form.getByLabel('Topic').fill(HOOK.topic);
  await form.getByRole('combobox', { name: 'Tool' }).click();
  await page.getByRole('combobox', { name: 'Search tools' }).fill(HOOK.tool);
  await page.getByRole('option', { name: new RegExp(`(^|\\()${HOOK.tool}\\)?$`) }).click();
  await pickExecutionKey(page, form);

  await form.getByRole('button', { name: 'Subject (optional)' }).click();
  await form.getByRole('combobox', { name: 'Target', exact: true }).click();
  await page.getByRole('option', { name: 'agent · assistant', exact: true }).click();
  await form.getByLabel('Subject kind').fill(STORED_SUBJECT.kind);
  await form
    .getByRole('radiogroup', { name: `${KEY} source` })
    .getByRole('radio', { name: 'Stored template' })
    .click();
  await form.getByRole('combobox', { name: KEY, exact: true }).click();
  await page.getByRole('option', { name: CATALOG[1], exact: true }).click();
  await form
    .getByRole('group', { name: KEY, exact: true })
    .getByRole('button', { name: 'Add render parameters' })
    .click();
  const parameters = keyParameters(form);
  await parameters.getByRole('textbox', { name: `${KEY} render parameters key 1` }).fill('field');
  await parameters.getByRole('textbox', { name: `${KEY} render parameters value 1` }).fill('actor');

  const write = nextRequest(page, 'POST', isHooks);
  await form.getByRole('button', { name: 'Register' }).click();

  expect(bodyOf(await write).subject).toEqual(STORED_SUBJECT);
});

test('the Edit door shows a stored-template subject key and saves it back unchanged', async ({
  page,
}) => {
  await stubSubjectReads(page, [HOOK]);
  await page.goto('/hooks');

  await page.getByRole('button', { name: `Edit hook ${HOOK.name}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit hook' });
  await expect(
    dialog.getByRole('radiogroup', { name: `${KEY} source` }).getByRole('radio', {
      name: 'Stored template',
    }),
  ).toBeChecked();
  await expect(dialog.getByRole('combobox', { name: KEY, exact: true })).toContainText(CATALOG[1]);
  const parameters = keyParameters(dialog);
  await expect(
    parameters.getByRole('textbox', { name: `${KEY} render parameters key 1` }),
  ).toHaveValue('field');
  await expect(
    parameters.getByRole('textbox', { name: `${KEY} render parameters value 1` }),
  ).toHaveValue('actor');

  const write = nextRequest(page, 'POST', isHooks);
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  expect(bodyOf(await write).subject).toEqual(STORED_SUBJECT);
});
