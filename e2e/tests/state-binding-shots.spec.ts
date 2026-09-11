/**
 * The state-binding docs frames, captured against the LIVE boot skeleton. Twin of the
 * states-shots pipeline: it seeds one state, one state-template document carrying
 * template jq (an `input` and an `update`), attaches it, then captures the new screens
 * in BOTH themes at 1440×900 —
 *
 *   - the state-template screen's Template tab and Jq tab (read-only document view),
 *   - the states master list,
 *   - a platform door screen (the preset create dialog) with the State binding section
 *     expanded, in three editor states: empty, a state attached (subject + attach-on-use
 *     hint), and an update's adapter mapping.
 *
 * The PNGs land in `STATE_BINDING_SHOTS_DIR` (default: the gitignored `test-results/`),
 * so a reviewer can point it at any directory for out-of-tree evidence. Each frame
 * runs its `action` (if any) THEN waits on a POPULATED signal, and refuses to ship an
 * error card. Fixtures use a domain-agnostic accumulator vocabulary (counters/tally/
 * bump), never a business scenario.
 *
 * These screens read the state-template + door `state_binding` surfaces: the spec is
 * born-red until the composed backend serves them, then green.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';

import { API_KEY, seedCredential } from './helpers';

const VIEWPORT = { width: 1440, height: 900 } as const;
const STUDIO_PORT = process.env.STUDIO_PORT ?? '8765';
const BASE_URL = `http://127.0.0.1:${STUDIO_PORT}`;

const OUT_DIR =
  process.env.STATE_BINDING_SHOTS_DIR ??
  fileURLToPath(new URL('../test-results/state-binding-shots', import.meta.url));

const STATE = 'counters';
const TEMPLATE = 'tally';
const SUBJECT_EXPR = '.subject_id';
const ERROR_CARD = '[role="alert"]:has-text("Something went wrong")';

/** Seed a state + a state-template carrying template jq, and attach it. Idempotent. */
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
        schema: {
          type: 'object',
          properties: { label: { type: 'string', title: 'Label' } },
        },
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
        schema: { type: 'object', properties: { total: { type: 'number', title: 'Total' } } },
        parameters: {},
        regimes: [{ path: ['total'], regime: 'single' }],
        template_jq: {
          current: {
            description: 'The running total.',
            purpose: 'input',
            params: [],
            jq: { content: '.total' },
          },
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

test.beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const api = await apiRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
  });
  try {
    await seedBindingFixture(api);
  } finally {
    await api.dispose();
  }
});

interface Frame {
  readonly name: string;
  readonly path: string;
  readonly ready: (page: Page) => Locator;
  readonly action?: (page: Page) => Promise<void>;
}

/** Open the preset create dialog and expand the State binding section. */
async function openPresetBinding(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Create preset' }).click();
  await page.getByRole('button', { name: 'Bind state (optional)' }).click();
}

/** Set the subject through the app-injected jq editor so the frame shows a valid binding. */
async function fillSubject(page: Page, expr: string): Promise<void> {
  await page.getByTestId('binding-jq-subject').getByRole('textbox').first().fill(expr);
}

const FRAMES: readonly Frame[] = [
  {
    name: 'states-list',
    path: '/states',
    ready: (page) => page.getByTestId('state-row-counters'),
  },
  {
    name: 'state-template-template-tab',
    path: `/states?template=${TEMPLATE}`,
    action: async (page) => {
      await page.getByText('Write policies').waitFor({ state: 'visible' });
    },
    ready: (page) => page.getByRole('tab', { name: 'Template' }),
  },
  {
    name: 'state-template-jq-tab',
    path: `/states?template=${TEMPLATE}`,
    action: async (page) => {
      await page.getByRole('tab', { name: 'Jq' }).click();
      await page.getByText('bump').first().waitFor({ state: 'visible' });
      // The jq viewer is a native <details>/<summary> disclosure (keyboard-operable,
      // exposes expanded state) named by aria-label — open it and wait for the
      // expanded `details[open]` state so the frame captures the revealed jq.
      await page.getByLabel('Show jq for bump').click();
      await page
        .locator('details[open]:has(summary[aria-label="Show jq for bump"])')
        .waitFor({ state: 'visible' });
    },
    ready: (page) => page.getByRole('tab', { name: 'Jq' }),
  },
  {
    name: 'door-binding-empty',
    path: '/presets',
    action: openPresetBinding,
    ready: (page) => page.getByText('No state bound'),
  },
  {
    name: 'door-binding-attached',
    path: '/presets',
    action: async (page) => {
      await openPresetBinding(page);
      await page.getByRole('button', { name: 'Attach a state' }).click();
      await page.getByRole('combobox', { name: 'State' }).click();
      await page.getByRole('option', { name: STATE }).click();
      await page.getByRole('checkbox', { name: TEMPLATE }).click();
      await fillSubject(page, SUBJECT_EXPR);
    },
    ready: (page) => page.getByTestId('binding-jq-subject'),
  },
  {
    name: 'door-binding-adapter',
    path: '/presets',
    action: async (page) => {
      await openPresetBinding(page);
      await page.getByRole('button', { name: 'Attach a state' }).click();
      await page.getByRole('combobox', { name: 'State' }).click();
      await page.getByRole('option', { name: STATE }).click();
      await page.getByRole('checkbox', { name: TEMPLATE }).click();
      await fillSubject(page, SUBJECT_EXPR);
      await page.getByRole('button', { name: 'Add update' }).click();
    },
    ready: (page) => page.getByTestId('adapter-row-total'),
  },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`State-binding docs frames (${theme})`, () => {
    test.use({ colorScheme: theme, viewport: VIEWPORT });

    for (const frame of FRAMES) {
      test(frame.name, async ({ page }) => {
        await seedCredential(page);
        await page.goto(frame.path, { waitUntil: 'domcontentloaded' });
        if (frame.action) await frame.action(page);
        await frame.ready(page).waitFor({ state: 'visible' });

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator(ERROR_CARD)).toHaveCount(0);

        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT_DIR}/${frame.name}-${theme}.png` });
      });
    }
  });
}
