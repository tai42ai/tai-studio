/**
 * Design-review frames for the conversation-route overlap policy and its transcript
 * outcomes, captured against the LIVE boot skeleton in BOTH themes at 1440×900:
 *
 *   - `conversation-route-create` — the CREATE dialog open, its `Overlap` group scrolled
 *     into view, blank, showing the group hint (the defaults live in the hint, not the
 *     controls).
 *   - `conversation-route-edit` — the EDIT dialog on a route whose stored policy is
 *     `cancel` / `all` / `5`, so all three overlap fields carry values.
 *   - `conversation-routes-table` — the routes list with the `Overlap` column: one
 *     default-policy route (the `—` placeholder) and one non-default route (the
 *     `running: cancel · deliver: all · settle: 5s` summary).
 *   - `conversation-transcript-outcomes` — one thread's transcript carrying a `merged`
 *     record (`Merged into <id>`) and a `superseded` record (`Superseded by <id>`) beside
 *     a normal answered one.
 *
 * Every door the surface reads is served through `page.route`, deterministically; other
 * routes and non-GET methods fall through to the live skeleton. The write capability is
 * granted by the boot credential, as for the preset and hook create dialogs.
 *
 * The PNGs land in `ROUTE_SHOTS_DIR` (default: the gitignored `test-results/`), so a
 * reviewer can point it at any directory for out-of-tree evidence without the shots ever
 * being committed. Fixtures use a domain-agnostic assistant/echo vocabulary.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, type Locator, type Page, test } from '@playwright/test';

import { seedCredential } from './helpers';

/** The captures are 1440-wide frames of the monitor and its modal. */
const VIEWPORT = { width: 1440, height: 900 } as const;

const OUT_DIR =
  process.env.ROUTE_SHOTS_DIR ??
  fileURLToPath(new URL('../test-results/conversation-route-shots', import.meta.url));

/** The loud shared error card. Its presence where a frame reads its door means the
 * capture is broken. */
const ERROR_CARD = '[role="alert"]:has-text("Something went wrong")';

/** The fields every stub route row shares. */
const ROUTE_BASE = {
  door: 'channel',
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
  error_reply_text: null,
  callback_secret: null,
  locale: null,
} as const;

/** The default overlap policy — a route on it shows the `—` placeholder. */
const OVERLAP_DEFAULT = { running: 'continue', deliver: 'one', settle_seconds: 0 } as const;
/** A non-default policy — cancel the running turn, carry all, settle for 5s. */
const OVERLAP_CUSTOM = { running: 'cancel', deliver: 'all', settle_seconds: 5 } as const;

/** An existing tool route whose stored overlap policy prefills all three edit fields. */
const EDIT_ROUTE = {
  ...ROUTE_BASE,
  route_name: 'assistant-line',
  channel: 'whatsapp',
  target_kind: 'tool',
  target_name: 'studio_demo_echo',
  start_expr: { content: '{ text: .message.text }' },
  reply_expr: { content: '{ text: .result.text }' },
  overlap: OVERLAP_CUSTOM,
};

/** The two routes the table frame lists: one default policy, one non-default. */
const TABLE_ROUTES = [
  { ...ROUTE_BASE, route_name: 'assistant-line', channel: 'whatsapp', overlap: OVERLAP_DEFAULT },
  { ...ROUTE_BASE, route_name: 'status-relay', channel: 'telegram', overlap: OVERLAP_CUSTOM },
];

/** The transcript frame's route, thread and three records. */
const TRANSCRIPT_ROUTE = 'assistant-line';
const TRANSCRIPT_THREAD = 'assistant-line-demo';
const TRANSCRIPT_ADDRESS = '+10000000000';

const RECORD_BASE = {
  route_name: TRANSCRIPT_ROUTE,
  door: 'channel',
  thread_id: TRANSCRIPT_THREAD,
  client_address: TRANSCRIPT_ADDRESS,
  caller_principal: null,
  origin: 'client',
  updated_at: 1_800_000_100,
} as const;

const TRANSCRIPT_RECORDS = [
  {
    ...RECORD_BASE,
    message_id: 'm-101',
    inbound_text: 'what is the current status',
    answer_status: 'answered',
    answer: 'All systems are green.',
    successor_id: null,
    delivery_status: 'delivered',
    created_at: 1_800_000_001,
  },
  {
    ...RECORD_BASE,
    message_id: 'm-102',
    inbound_text: 'one more question',
    answer_status: 'merged',
    answer: null,
    successor_id: 'm-104',
    delivery_status: 'merged',
    created_at: 1_800_000_002,
  },
  {
    ...RECORD_BASE,
    message_id: 'm-103',
    inbound_text: 'never mind that',
    answer_status: 'superseded',
    answer: null,
    successor_id: 'm-104',
    delivery_status: 'superseded',
    created_at: 1_800_000_003,
  },
];

/** Fulfil a `GET` on `pathname` with the skeleton's `{ data }` envelope; other routes and
 * non-GET methods fall through to the live skeleton. */
async function stubGet(page: Page, pathname: string, data: unknown): Promise<void> {
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({ json: { data } });
    },
  );
}

/** A single-page listing envelope shaped as the paged read doors return it. */
function pageOf(items: readonly unknown[], extra: Record<string, unknown> = {}): unknown {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 100,
    next_page: null,
    truncated: false,
    ...extra,
  };
}

interface Frame {
  readonly name: string;
  /** The landing URL (search included). Defaults to the bare monitor landing. */
  readonly url?: string;
  /** Route stubs installed before navigation. */
  readonly setup: (page: Page) => Promise<void>;
  /** Drive the page into the state to capture (open the dialog, scroll a group in). */
  readonly action: (page: Page) => Promise<void>;
  /** The POPULATED signal proving the intended state rendered. */
  readonly ready: (page: Page) => Locator;
}

const FRAMES: readonly Frame[] = [
  {
    // The create dialog: the blank Overlap group scrolled into view, its hint carrying
    // the defaults.
    name: 'conversation-route-create',
    setup: async (page) => {
      await stubGet(page, '/api/conversations', pageOf([]));
    },
    action: async (page) => {
      await page.getByRole('button', { name: 'Create route' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('group', { name: 'Overlap' }).scrollIntoViewIfNeeded();
    },
    ready: (page) => page.getByRole('dialog').getByRole('group', { name: 'Overlap' }),
  },
  {
    // The edit dialog on a route with a non-default policy: all three overlap fields show.
    name: 'conversation-route-edit',
    setup: async (page) => {
      await stubGet(page, '/api/conversations', pageOf([EDIT_ROUTE]));
      await stubGet(page, '/api/storage', { present: true, provider: 'demo', module: 'demo' });
      await stubGet(page, '/api/templates', []);
    },
    action: async (page) => {
      await page.getByRole('button', { name: `Edit route ${EDIT_ROUTE.route_name}` }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('group', { name: 'Overlap' }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('spinbutton', { name: /^Settle window/ })).toHaveValue('5');
    },
    ready: (page) => page.getByRole('dialog').getByRole('group', { name: 'Overlap' }),
  },
  {
    // The routes table with the Overlap column: a default `—` row and a non-default summary.
    name: 'conversation-routes-table',
    setup: async (page) => {
      await stubGet(page, '/api/conversations', pageOf(TABLE_ROUTES));
    },
    action: async (page) => {
      await page
        .getByRole('cell', { name: 'running: cancel · deliver: all · settle: 5s' })
        .scrollIntoViewIfNeeded();
    },
    ready: (page) =>
      page.getByRole('cell', { name: 'running: cancel · deliver: all · settle: 5s' }),
  },
  {
    // One thread's transcript, holding a merged and a superseded record beside an answered one.
    name: 'conversation-transcript-outcomes',
    url: `/conversations?route=${encodeURIComponent(TRANSCRIPT_ROUTE)}&thread=${encodeURIComponent(TRANSCRIPT_THREAD)}`,
    setup: async (page) => {
      await stubGet(page, '/api/conversations', pageOf(TABLE_ROUTES));
      await stubGet(
        page,
        `/api/conversations/${TRANSCRIPT_ROUTE}/threads`,
        pageOf([
          {
            thread_id: TRANSCRIPT_THREAD,
            client_address: TRANSCRIPT_ADDRESS,
            last_activity_at: 1_800_000_003,
            message_count: TRANSCRIPT_RECORDS.length,
            last_delivery_status: 'superseded',
          },
        ]),
      );
      await stubGet(page, `/api/conversations/${TRANSCRIPT_ROUTE}/thread/mode`, {
        mode: 'agent',
        source: 'route',
      });
      await stubGet(
        page,
        `/api/conversations/${TRANSCRIPT_ROUTE}/transcript`,
        pageOf(TRANSCRIPT_RECORDS, { order: 'desc' }),
      );
    },
    action: async (page) => {
      await page.getByText(/Superseded by/).scrollIntoViewIfNeeded();
    },
    ready: (page) => page.getByText(/Merged into/),
  },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Conversation overlap frames (${theme})`, () => {
    test.use({ colorScheme: theme, viewport: VIEWPORT });

    for (const frame of FRAMES) {
      test(frame.name, async ({ page }) => {
        await seedCredential(page);
        await frame.setup(page);
        await page.goto(frame.url ?? '/conversations', { waitUntil: 'domcontentloaded' });
        await frame.action(page);
        await frame.ready(page).waitFor({ state: 'visible' });

        // The colour-scheme emulation must have resolved to a genuinely themed render, and
        // the frame's own surface must carry no error card — otherwise the shot is
        // meaningless.
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator(ERROR_CARD)).toHaveCount(0);

        // Let fonts + layout settle, then capture the fixed-viewport frame.
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT_DIR}/${frame.name}-${theme}.png` });
      });
    }
  });
}

test.beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true });
});
