/**
 * The hook fire path — the execution key a hook RUNS AS — against the LIVE boot
 * skeleton. The fire door is topic-level (server-derived), shown in the list, NOT
 * chosen at register, so these legs register with a bound key and read the door
 * back from the row. (Pass-role refusal, unreachable as admin, is pinned in the
 * unit suite.)
 *
 * The session cases serve `GET /api/auth/me`, the api-key list and the register write
 * through `page.route`: a key session binds its own identity over an empty or refused key
 * list, an account session reads the account note with Register disabled, and with access
 * control off the form shows no key field and sends the fill identity.
 *
 * The door-display and verifier-bind assertions below depend on the skeleton
 * populating the topic → door map, so they run against the booted skeleton this
 * config starts, not against a stub.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { API_KEY, EXECUTION_KEY_ID, loginViaUi, pickExecutionKey, seedCredential } from './helpers';
import {
  ACCOUNT_EMPTY_NOTE,
  accountSession,
  bodyOf,
  gateOffSession,
  KEY_LIST_FORBIDDEN_NOTE,
  keySession,
  nextRequest,
  serveWrite,
  stubKeyList,
  stubSession,
} from './session-stubs';

needs('kind:identity', 'kind:webhook_verifiers:github', 'mutable', 'setting:hooks');

/** The register form — the page also carries a topic filter and the bind form. */
function registerForm(page: Page): Locator {
  return page.getByRole('form', { name: 'Register hook' });
}

/**
 * Choose `tool` in the register form's Tool picker: search for its raw name, then take
 * the option that reads the raw name bare or as the `Display (raw)` suffix.
 */
async function pickTool(page: Page, form: Locator, tool: string): Promise<void> {
  await form.getByRole('combobox', { name: 'Tool' }).click();
  await page.getByRole('combobox', { name: 'Search tools' }).fill(tool);
  const escaped = tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('option', { name: new RegExp(`(^|\\()${escaped}\\)?$`) }).click();
}

/** Fill the register form's required fields and bind the seeded execution key. */
async function fillRegisterForm(
  page: Page,
  { name, topic, tool }: { name: string; topic: string; tool: string },
): Promise<void> {
  const form = registerForm(page);
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Topic').fill(topic);
  await pickTool(page, form, tool);
  await pickExecutionKey(page, form);
}

/** The registered-hooks row for `name`. */
function hookRow(page: Page, name: string): Locator {
  return page.getByRole('row', { name: new RegExp(name) });
}

test('register a hook with a bound execution key, and see it run AS that key', async ({ page }) => {
  await loginViaUi(page);
  await page.goto('/hooks');

  const name = `e2e-runs-as-${Date.now().toString(36)}`;
  await fillRegisterForm(page, { name, topic: 'e2e-hook-plain', tool: 'studio_demo_echo' });
  await registerForm(page).getByRole('button', { name: 'Register' }).click();

  const row = hookRow(page, name);
  await expect(row).toBeVisible();
  await expect(row).toContainText(EXECUTION_KEY_ID);
});

test('bind a verifier to a topic, then a hook on it shows the verifier-signed door', async ({
  page,
}) => {
  await loginViaUi(page);
  await page.goto('/hooks');

  const suffix = Date.now().toString(36);
  const topic = `e2e-hook-verified-${suffix}`;
  const name = `e2e-verified-${suffix}`;

  // Bind a verifier to the topic via the ONE writer — the bind form.
  const bindForm = page.getByRole('form', { name: 'Bind topic verifier' });
  await bindForm.getByLabel('Topic').fill(topic);
  const verifierPicker = bindForm.getByRole('combobox', { name: 'Verifier' });
  await expect(
    verifierPicker,
    'this deployment registers no webhook verifier, so a verifier door cannot be exercised',
  ).toBeVisible();
  await verifierPicker.click();
  await page.getByRole('option').first().click();
  await bindForm.getByRole('button', { name: 'Bind verifier' }).click();
  await expect(page.getByTestId(`topic-verifier-${topic}`)).toBeVisible();

  // A hook on that topic inherits the topic's server-derived door.
  await fillRegisterForm(page, { name, topic, tool: 'studio_demo_echo' });
  await registerForm(page).getByRole('button', { name: 'Register' }).click();
  const row = hookRow(page, name);
  await expect(row).toBeVisible();
  await expect(row).toContainText('Verifier-signed');
});

test("a key the server refuses to bind surfaces the server's message VERBATIM", async ({
  page,
}) => {
  await loginViaUi(page);

  // A request-context-conditional key: not bindable as an execution identity.
  const conditionalKeyId = `e2e-conditional-${Date.now().toString(36)}`;
  const mint = await page.request.post('/api/auth/api-keys', {
    headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    data: {
      user_id: conditionalKeyId,
      description: 'request-context-conditional key (e2e)',
      scopes: ['*'],
      condition: { content: '.identity.description == "on-call"' },
    },
  });
  expect(mint.status()).toBe(200);

  await page.goto('/hooks');
  const name = `e2e-refused-${Date.now().toString(36)}`;
  const form = registerForm(page);
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Topic').fill('e2e-hook-refused');
  await pickTool(page, form, 'studio_demo_echo');
  await pickExecutionKey(page, form, conditionalKeyId);

  const refusal = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/hooks') &&
      response.request().method() === 'POST' &&
      !response.ok(),
  );
  await form.getByRole('button', { name: 'Register' }).click();

  const body = (await (await refusal).json()) as { error?: string };
  const message = body.error;
  if (typeof message !== 'string') {
    throw new Error(`the refusal carried no error message: ${JSON.stringify(body)}`);
  }
  // Rendered exactly as the server wrote it — never re-worded or summarised.
  await expect(form.getByRole('alert')).toContainText(message);
  await expect(hookRow(page, name)).toHaveCount(0);
});

/** Fill the register form's name, topic and tool, leaving the execution key to the case. */
async function fillHookFields(page: Page, name: string): Promise<void> {
  const form = registerForm(page);
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Topic').fill('e2e-hook-session');
  await pickTool(page, form, 'studio_demo_echo');
}

const isHooks = (pathname: string): boolean => pathname === '/api/hooks';

test.describe('the execution key a session can bind', () => {
  test('a key session over an empty key list binds its own identity', async ({ page }) => {
    await seedCredential(page);
    await stubSession(page, keySession);
    await stubKeyList(page, { keys: [] });
    const name = `e2e-own-${Date.now().toString(36)}`;
    await serveWrite(page, 'POST', isHooks, { data: { name, registered: true } });
    await page.goto('/hooks');

    await fillHookFields(page, name);
    await pickExecutionKey(page, registerForm(page));
    const write = nextRequest(page, 'POST', isHooks);
    await registerForm(page).getByRole('button', { name: 'Register' }).click();

    expect(bodyOf(await write).execution_key).toBe(EXECUTION_KEY_ID);
  });

  test('an account session over an empty key list reads the note and cannot register', async ({
    page,
  }) => {
    await seedCredential(page);
    await stubSession(page, accountSession);
    await stubKeyList(page, { keys: [] });
    await page.goto('/hooks');

    await fillHookFields(page, `e2e-account-${Date.now().toString(36)}`);
    const form = registerForm(page);
    await expect(form.getByText(ACCOUNT_EMPTY_NOTE, { exact: true })).toBeVisible();
    await expect(form.getByRole('combobox', { name: 'Execution key' })).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Register' })).toBeDisabled();
  });

  test('with access control off the form shows no key field and sends the fill identity', async ({
    page,
  }) => {
    await seedCredential(page);
    await stubSession(page, gateOffSession);
    const name = `e2e-gate-off-${Date.now().toString(36)}`;
    await serveWrite(page, 'POST', isHooks, { data: { name, registered: true } });
    await page.goto('/hooks');

    await fillHookFields(page, name);
    const form = registerForm(page);
    await expect(form.getByText('Execution key', { exact: true })).toHaveCount(0);
    const register = form.getByRole('button', { name: 'Register' });
    await expect(register).toBeEnabled();
    const write = nextRequest(page, 'POST', isHooks);
    await register.click();

    expect(bodyOf(await write).execution_key).toBe('__no_auth__');
  });

  test("a refused key list reads the note, offers no retry, and binds the session's identity", async ({
    page,
  }) => {
    await seedCredential(page);
    await stubSession(page, keySession);
    await stubKeyList(page, { status: 403, error: 'Forbidden' });
    const name = `e2e-no-grant-${Date.now().toString(36)}`;
    await serveWrite(page, 'POST', isHooks, { data: { name, registered: true } });
    await page.goto('/hooks');

    await fillHookFields(page, name);
    const form = registerForm(page);
    await expect(form.getByText(KEY_LIST_FORBIDDEN_NOTE, { exact: true })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await pickExecutionKey(page, form);
    const write = nextRequest(page, 'POST', isHooks);
    await form.getByRole('button', { name: 'Register' }).click();

    expect(bodyOf(await write).execution_key).toBe(EXECUTION_KEY_ID);
  });
});
