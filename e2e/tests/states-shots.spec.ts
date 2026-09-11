/**
 * The States docs frames, captured against the LIVE boot skeleton. This is the
 * e2e-suite twin of the docs-screenshot pipeline's six States frames
 * (`e2e/scripts/docs-screenshots.mjs`): it seeds the platform state store through the
 * real HTTP API — the same bodies the `docs-screenshots.sh` state-store seeding writes — then captures
 * each of the six frames the docs "## States" section shows, in BOTH themes at
 * 1440×900. Every frame waits on a POPULATED signal (a seeded row, a tab's own
 * control, the record's audit) and refuses to ship an error card, so a broken screen
 * fails the test rather than producing a misleading shot.
 *
 * The PNGs land in `STATES_SHOTS_DIR` (default: the gitignored `test-results/`), so a
 * reviewer can point it at any directory for out-of-tree evidence without the shots
 * ever being committed.
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

/** The docs frames pin this viewport; the states surface is a 1440-wide master/detail. */
const VIEWPORT = { width: 1440, height: 900 } as const;

/** The skeleton origin. Mirrors playwright.config.ts's `baseURL`, so the seeding request
 * context reaches the same skeleton the pages drive (a reused server on a non-default
 * port is honoured through `STUDIO_PORT`). */
const STUDIO_PORT = process.env.STUDIO_PORT ?? '8765';
const BASE_URL = `http://127.0.0.1:${STUDIO_PORT}`;

/** Where the PNGs are written. An absolute out-of-tree path is passed through the
 * env; the default keeps CI artifacts inside the gitignored `test-results/` tree. */
const OUT_DIR =
  process.env.STATES_SHOTS_DIR ??
  fileURLToPath(new URL('../test-results/states-shots', import.meta.url));

/** The seeded state and its template — the same names the docs demo uses. */
const STATE = 'notes';
const TEMPLATE = 'preferences';
const TARGET_KIND = 'tool';
const TARGET_NAME = 'studio_demo_echo';
const REC_BASE = `/api/states/${STATE}/records/${TARGET_KIND}/${TARGET_NAME}`;
const CONSUMER_HOOK = 'notes-updater';

/** The loud shared error card. Its presence means the capture is broken. */
const ERROR_CARD = '[role="alert"]:has-text("Something went wrong")';

/**
 * Seed the platform state store exactly as the docs pipeline does: one declared state,
 * one template document attached to it, two subject records (one written whole, one grown
 * by a `set_by_key` delta so its Writes audit carries an `api`-origin row), and one
 * consumer hook whose subject kind the state declares. Idempotent against a persisted
 * backend — the declaration/record PUTs upsert, the template PUT carries `replace=true`,
 * the delta's fixed `op_id` dedupes, and the attachment + hook are re-created after a
 * best-effort delete. Each step's response is asserted, so a broken seed fails here.
 */
async function seedStateStore(api: APIRequestContext): Promise<void> {
  const ok = async (
    res: Awaited<ReturnType<APIRequestContext['put']>>,
    what: string,
  ): Promise<void> => {
    if (!res.ok()) {
      throw new Error(`${what} failed (${String(res.status())}): ${await res.text()}`);
    }
  };

  await ok(
    await api.put(`/api/states/${STATE}`, {
      data: {
        name: STATE,
        description: 'Per-subject notes — a keyed list of items, one document per subject.',
        schema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              title: 'Items',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', title: 'Id' },
                  text: { type: 'string', title: 'Text' },
                },
                required: ['id'],
              },
            },
          },
        },
        subject_kinds: ['thread', 'person'],
        default_subject_kind: 'thread',
      },
    }),
    'declare state',
  );

  await ok(
    await api.put(`/api/state-templates/${TEMPLATE}?replace=true`, {
      data: {
        kind: 'state-template',
        name: TEMPLATE,
        description: 'Per-subject display preferences.',
        schema: { type: 'object', properties: { locale: { type: 'string', title: 'Locale' } } },
        parameters: {},
        regimes: [],
      },
    }),
    'upload template document',
  );

  await api.delete(`/api/states/${STATE}/attachments/${TEMPLATE}`).catch(() => undefined);
  await ok(
    await api.put(`/api/states/${STATE}/attachments/${TEMPLATE}`, {
      data: { path: ['prefs'], parameters: {}, declarations: {} },
    }),
    'attach template',
  );

  await ok(
    await api.put(`${REC_BASE}/thread/t-001`, {
      data: { items: [{ id: 'n1', text: 'Acme welcome note — captured for the docs demo.' }] },
    }),
    'write record thread/t-001',
  );
  await ok(
    await api.put(`${REC_BASE}/thread/t-002`, { data: { items: [] } }),
    'seed record thread/t-002',
  );
  await ok(
    await api.post(`${REC_BASE}/thread/t-002/deltas`, {
      data: {
        // A per-invocation op_id: the record PUT above resets `items` on every seed, so a
        // FIXED op_id would let the op-ledger dedupe the delta after the reset and leave
        // the document empty. A fresh id re-applies the delta each time, so the frame
        // always shows a populated document with an `api` delta write in its audit.
        op_id: `notes-t002-delta-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
        ops: [
          {
            op: 'set_by_key',
            path: ['items'],
            key_field: 'id',
            value: { id: 'n2', text: 'Follow-up recorded through the API delta door.' },
          },
        ],
      },
    }),
    'apply set_by_key delta to thread/t-002',
  );

  await api.delete(`/api/hooks/${CONSUMER_HOOK}`).catch(() => undefined);
  await ok(
    await api.post('/api/hooks', {
      data: {
        name: CONSUMER_HOOK,
        topic: STATE,
        tool: TARGET_NAME,
        execution_key: process.env.STUDIO_USER_ID ?? 'studio-e2e',
        subject: {
          target_kind: TARGET_KIND,
          target_name: TARGET_NAME,
          kind: 'thread',
          key_expr: { content: '.thread_id' },
        },
      },
    }),
    'register consumer hook',
  );

  // Post-conditions — the reads each frame depends on, so a silent seed regression
  // (an empty list, a missing consumer, an audit with no api row) fails here.
  const states = await api.get('/api/states');
  if (!(await states.text()).includes(`"${STATE}"`)) {
    throw new Error(`state '${STATE}' is not in the states list`);
  }
  const consumers = await api.get(`/api/states/${STATE}/consumers`);
  if (!(await consumers.text()).includes(CONSUMER_HOOK)) {
    throw new Error(`consumer hook '${CONSUMER_HOOK}' is not in the state's consumers`);
  }
  const writes = await api.get(`${REC_BASE}/thread/t-002/writes`);
  if (!(await writes.text()).includes('"api"')) {
    throw new Error(`record thread/t-002 has no api write in its audit trail`);
  }
}

test.beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const api = await apiRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
  });
  try {
    await seedStateStore(api);
  } finally {
    await api.dispose();
  }
});

/** The six frames the docs "## States" section shows, each with a POPULATED-content
 * signal (never a bare timeout) and, where the frame drives the page into a state, the
 * action that gets it there. */
interface Frame {
  readonly name: string;
  readonly path: string;
  readonly ready: (page: Page) => Locator;
  readonly action?: (page: Page) => Promise<void>;
}

const FRAMES: readonly Frame[] = [
  {
    // The states master list: the declared `notes` row with its subject-kind badges and
    // record/consumer counts.
    name: 'states-list',
    path: '/states',
    ready: (page) => page.getByTestId('state-row-notes'),
  },
  {
    // The Declaration tab: the base schema field tree beside the subject section (the
    // attached `preferences` subtree read-only). Waits on the subject-kinds control.
    name: 'states-declaration',
    path: '/states?state=notes',
    ready: (page) => page.locator('[aria-label="Subject kinds"]'),
  },
  {
    // The Templates tab: the state's attachments above the platform state templates.
    name: 'states-templates',
    path: '/states?state=notes&tab=templates',
    ready: (page) => page.getByText('preferences').first(),
  },
  {
    // The Records tab: the subject lookup form above the state's subjects (the default
    // kind `thread` loads on mount, so the seeded key proves the list rendered).
    name: 'states-records',
    path: '/states?state=notes&tab=records',
    ready: (page) => page.getByText('t-001').first(),
  },
  {
    // The Consumers tab: everything that binds the state; waits on the seeded hook.
    name: 'states-consumers',
    path: '/states?state=notes&tab=consumers',
    ready: (page) => page.getByText(CONSUMER_HOOK).first(),
  },
  {
    // The record page for `thread/t-002`: its document, the fold card, and the Writes
    // audit (the `set_by_key` delta gave it an `api` row). Waits on the loaded document
    // (Erase shows only for a real record), then the `api` write badge.
    name: 'states-record',
    path: '/states?state=notes&subject=thread:t-002&target=tool:studio_demo_echo',
    ready: (page) => page.getByRole('button', { name: 'Erase' }),
    action: async (page) => {
      await page.getByText('api', { exact: true }).first().waitFor({ state: 'visible' });
    },
  },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`States docs frames (${theme})`, () => {
    test.use({ colorScheme: theme, viewport: VIEWPORT });

    for (const frame of FRAMES) {
      test(frame.name, async ({ page }) => {
        await seedCredential(page);
        await page.goto(frame.path, { waitUntil: 'domcontentloaded' });
        await frame.ready(page).waitFor({ state: 'visible' });
        if (frame.action) await frame.action(page);

        // The colour-scheme emulation must have resolved to a genuinely themed render,
        // and no error card may be on screen — otherwise the shot is meaningless.
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator(ERROR_CARD)).toHaveCount(0);

        // Let fonts + layout settle, then capture the fixed-viewport frame.
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT_DIR}/${frame.name}-${theme}.png` });
      });
    }
  });
}
