/**
 * The hook fire path — the execution key a hook RUNS AS — against the LIVE boot
 * skeleton. The fire door is topic-level (server-derived), shown in the list, NOT
 * chosen at register, so these legs register with a bound key and read the door
 * back from the row. (Pass-role refusal, unreachable as admin, is pinned in the
 * unit suite.)
 *
 * UNRUN in this studio-only workspace (no tai-skeleton backend) — a PLAN_7 gate.
 * The door-display and verifier-bind assertions below depend on the skeleton
 * populating the topic → door map; PLAN_7 validates them against the live server.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { API_KEY, EXECUTION_KEY_ID, loginViaUi, pickExecutionKey } from './helpers';

/** The register form — the page also carries a topic filter and the bind form. */
function registerForm(page: Page): Locator {
  return page.getByRole('form', { name: 'Register hook' });
}

/** Fill the register form's required fields and bind the seeded execution key. */
async function fillRegisterForm(
  page: Page,
  { name, topic, tool }: { name: string; topic: string; tool: string },
): Promise<void> {
  const form = registerForm(page);
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Topic').fill(topic);
  await form.getByLabel('Tool', { exact: true }).fill(tool);
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
  await fillRegisterForm(page, { name, topic: 'e2e.hook.plain', tool: 'echo' });
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
  const topic = `e2e.hook.verified.${suffix}`;
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
  await fillRegisterForm(page, { name, topic, tool: 'echo' });
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
      condition: '.identity.description == "on-call"',
    },
  });
  expect(mint.status()).toBe(200);

  await page.goto('/hooks');
  const name = `e2e-refused-${Date.now().toString(36)}`;
  const form = registerForm(page);
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Topic').fill('e2e.hook.refused');
  await form.getByLabel('Tool', { exact: true }).fill('echo');
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
