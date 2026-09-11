/**
 * The composed-path e2e for the state-binding editor: it drives the SDK editor on a
 * REAL door form (the preset create dialog) end to end — expand the binding section,
 * attach a state, mount a template, set the subject through the app's injected jq
 * editor, add a template update, and map its adapter through the field form — then
 * submits and asserts the PERSISTED `state_binding` document AND the generated adapter
 * jq on the stored preset version.
 *
 * Fixtures use a domain-agnostic accumulator vocabulary (counters/tally/bump), never a
 * business scenario. It exercises the tai42 state-template + door `state_binding`
 * surfaces: born-red until the composed backend serves them, green once it does.
 */
import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

import { API_KEY, seedCredential } from './helpers';

const STUDIO_PORT = process.env.STUDIO_PORT ?? '8765';
const BASE_URL = `http://127.0.0.1:${STUDIO_PORT}`;

const STATE = 'counters';
const TEMPLATE = 'tally';
const BASE_TOOL = 'studio_demo_echo';
const PRESET = `tally-${String(Date.now())}`;
const PRESET_DEFAULT = `tally-default-${String(Date.now())}`;

async function seedBindingFixture(api: APIRequestContext): Promise<void> {
  const ok = async (
    res: Awaited<ReturnType<APIRequestContext['put']>>,
    what: string,
  ): Promise<void> => {
    if (!res.ok()) throw new Error(`${what} failed (${String(res.status())}): ${await res.text()}`);
  };
  await ok(
    await api.put(`/api/states/${STATE}`, {
      data: {
        name: STATE,
        description: 'One document per subject — a running tally.',
        schema: { type: 'object', properties: { label: { type: 'string' } } },
        subject_kinds: ['item'],
        default_subject_kind: 'item',
      },
    }),
    'declare state',
  );
  await ok(
    await api.put(`/api/state-templates/${TEMPLATE}?replace=true`, {
      data: {
        kind: 'state-template',
        name: TEMPLATE,
        description: 'A running tally.',
        schema: { type: 'object', properties: { total: { type: 'number' } } },
        parameters: {},
        regimes: [{ path: ['total'], regime: 'single' }],
        template_jq: {
          bump: {
            description: 'Add to the total.',
            purpose: 'update',
            params: ['total'],
            reads: [],
            writes: [['total']],
            jq: {
              content: '[{ op: "set", path: ["total"], value: (.record.total + .input.total) }]',
            },
          },
        },
      },
    }),
    'upload template document',
  );
  await api.delete(`/api/states/${STATE}/attachments/${TEMPLATE}`).catch(() => undefined);
  await ok(
    await api.put(`/api/states/${STATE}/attachments/${TEMPLATE}`, {
      data: { path: [], parameters: {}, declarations: {} },
    }),
    'attach template',
  );
}

async function readPresetBinding(api: APIRequestContext, preset: string): Promise<unknown> {
  const res = await api.get(`/api/presets/${preset}/versions`);
  // Two "not ready yet" windows are the signal the caller polls on (expect.poll
  // re-runs on a null value but propagates a thrown callback): the preset commits a
  // beat after the create POST returns (a transient 404), and the create drives the
  // versioning store through its reload gate, which stamps a retriable
  // `503 { reloading: true }` on reads in flight. Return null on both; any other
  // non-2xx is a real error and raises.
  if (res.status() === 404) return null;
  if (res.status() === 503) {
    const gate = (await res.json().catch(() => null)) as { reloading?: unknown } | null;
    if (gate?.reloading === true) return null;
    throw new Error('read versions failed (503)');
  }
  if (!res.ok()) throw new Error(`read versions failed (${String(res.status())})`);
  // The skeleton wraps every response in a `{ data }` envelope.
  const { data: versions } = (await res.json()) as {
    data: { is_current?: boolean; body?: { state_binding?: unknown } }[];
  };
  const current = versions.find((v) => v.is_current) ?? versions[0];
  return current?.body?.state_binding ?? null;
}

/** Type into the app-injected jq editor for a binding field (located by its wrapper testid). */
async function fillSubject(page: Page, expr: string): Promise<void> {
  const field = page.getByTestId('binding-jq-subject');
  await field.getByRole('textbox').first().fill(expr);
}

test.describe('state binding on a door form (composed path)', () => {
  test('authors a binding + adapter on the preset door and persists it', async ({ page }) => {
    const api = await apiRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    });
    try {
      await seedBindingFixture(api);

      await seedCredential(page);
      await page.goto('/presets', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Create preset' }).click();

      await page.getByRole('textbox', { name: 'Name' }).fill(PRESET);
      await page.getByRole('textbox', { name: /Description/ }).fill('Bumps a tally.');
      await selectBaseTool(page, BASE_TOOL);

      // Drive the SDK binding editor.
      await page.getByRole('button', { name: 'Bind state (optional)' }).click();
      await page.getByRole('button', { name: 'Attach a state' }).click();
      await page.getByRole('combobox', { name: 'State' }).click();
      await page.getByRole('option', { name: STATE }).click();
      await page.getByRole('checkbox', { name: TEMPLATE }).click();
      await fillSubject(page, '.subject_id');
      await page.getByRole('button', { name: 'Add update' }).click();
      // The named `bump` update's adapter maps its `total` input from the run output.
      await page.getByTestId('adapter-row-total').getByLabel('Field path').fill('total');

      // The list header's open button stays mounted while the dialog is open (the form
      // renders additively), so the shared "Create preset" label is ambiguous at the
      // page root — scope the submit to the dialog.
      await page.getByRole('dialog').getByRole('button', { name: 'Create preset' }).click();

      interface PersistedBinding {
        states: {
          state: string;
          templates: string[];
          subject_expr: { content?: string; id?: string };
          updates: {
            template_jq: string | null;
            adapter: { content?: string; id?: string } | null;
          }[];
        }[];
      }
      // Store the first non-null read the poll observes and assert on THAT, so a
      // transient reload-gate null on a second read can never null-deref below.
      const captured: { value: PersistedBinding | null } = { value: null };
      await expect
        .poll(
          async () => {
            const read = (await readPresetBinding(api, PRESET)) as PersistedBinding | null;
            if (read !== null) captured.value = read;
            return captured.value;
          },
          { timeout: 10_000 },
        )
        .not.toBeNull();
      const binding = captured.value;
      if (binding === null) throw new Error('expected a persisted binding');

      expect(binding.states).toHaveLength(1);
      const [attach] = binding.states;
      if (attach === undefined) throw new Error('expected one attached state');
      expect(attach.state).toBe(STATE);
      expect(attach.templates).toContain(TEMPLATE);
      expect(attach.subject_expr).toEqual({ content: '.subject_id' });
      expect(attach.updates[0]?.template_jq).toBe('bump');
      // The generated adapter is the canonical, parseable shape the editor emits.
      expect(attach.updates[0]?.adapter).toEqual({ content: '{ total: (.output.total) }' });
    } finally {
      await api.delete(`/api/presets/${PRESET}`).catch(() => undefined);
      await api.dispose();
    }
  });

  test('persists the shown default adapter when the operator never touches the mapping row', async ({
    page,
  }) => {
    const api = await apiRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
    });
    try {
      await seedBindingFixture(api);

      await seedCredential(page);
      await page.goto('/presets', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Create preset' }).click();

      await page.getByRole('textbox', { name: 'Name' }).fill(PRESET_DEFAULT);
      await page.getByRole('textbox', { name: /Description/ }).fill('Bumps a tally.');
      await selectBaseTool(page, BASE_TOOL);

      await page.getByRole('button', { name: 'Bind state (optional)' }).click();
      await page.getByRole('button', { name: 'Attach a state' }).click();
      await page.getByRole('combobox', { name: 'State' }).click();
      await page.getByRole('option', { name: STATE }).click();
      await page.getByRole('checkbox', { name: TEMPLATE }).click();
      await fillSubject(page, '.subject_id');
      // Add the named `bump` update and ACCEPT its shown default adapter — the mapping
      // row is never touched, so the stored adapter must equal the compiled default the
      // form displays (`{ total: (.output) }`), not an empty adapter the platform refuses.
      await page.getByRole('button', { name: 'Add update' }).click();
      await expect(page.getByTestId('adapter-row-total')).toBeVisible();

      await page.getByRole('dialog').getByRole('button', { name: 'Create preset' }).click();

      interface PersistedBinding {
        states: {
          updates: {
            template_jq: string | null;
            adapter: { content?: string; id?: string } | null;
          }[];
        }[];
      }
      const captured: { value: PersistedBinding | null } = { value: null };
      await expect
        .poll(
          async () => {
            const read = (await readPresetBinding(api, PRESET_DEFAULT)) as PersistedBinding | null;
            if (read !== null) captured.value = read;
            return captured.value;
          },
          { timeout: 10_000 },
        )
        .not.toBeNull();
      const binding = captured.value;
      if (binding === null) throw new Error('expected a persisted binding');

      const update = binding.states[0]?.updates[0];
      expect(update?.template_jq).toBe('bump');
      // The accepted-as-shown default is stored (WYSIWYG); an empty adapter would have
      // failed the platform's save-time compile check and left no persisted binding.
      expect(update?.adapter).toEqual({ content: '{ total: (.output) }' });
    } finally {
      await api.delete(`/api/presets/${PRESET_DEFAULT}`).catch(() => undefined);
      await api.dispose();
    }
  });
});

/** Pick a base tool through the preset form's ToolPicker (a combobox of tools). */
async function selectBaseTool(page: Page, tool: string): Promise<void> {
  const picker = page.getByRole('combobox', { name: /Base tool/ });
  await picker.click();
  await page.getByRole('option', { name: tool }).first().click();
}
