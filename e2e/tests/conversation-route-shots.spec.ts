/**
 * Design-review frames for the conversation-route overlap policy, its transcript
 * outcomes, and the thread-list bulk reset, captured against the LIVE boot skeleton
 * in BOTH themes at 1440×900:
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
 *   - `conversation-inbound-attachments` — one thread's transcript whose visitor turn
 *     carries a served image inline and a document download chip beside its text.
 *   - `conversation-inbound-reply-to` — one thread's transcript whose visitor turns quote
 *     earlier messages: one quote the thread holds, drawn with its text, and one it does
 *     not hold, drawn with the message id. It is captured as the whole transcript card.
 *   - `conversation-transcript-sends` — one thread's transcript carrying send records: a
 *     send made during a turn, drawn inside that turn's exchange; a sent message out of any
 *     turn, its delivery detail open on the part it went out in; a question asked as
 *     sensitive whose reply came over the channel and was not stored; a platform notice; a
 *     channel notice whose send failed; and a send whose outcome is unknown, its delivery
 *     detail open on the attempt and the error. It is captured as the whole transcript card,
 *     which runs past the viewport.
 *   - `conversation-bulk-reset-select` — the thread list's multi-select surface: the
 *     per-row checkboxes, the header select-all ticked, and the "Reset selected (N)"
 *     danger action.
 *   - `conversation-bulk-reset-confirm` — the "Reset selected threads" confirm dialog,
 *     whose copy and confirm label name the selected count.
 *   - `conversation-bulk-reset-result` — the per-item result: the "N threads reset."
 *     summary beside a failed row carrying its reason and a Retry, from a fan-out with
 *     one thread held by a turn in flight.
 *
 * The route dialog cases below the frames pick the target, the channel and the execution
 * key from served lists under a served session, and read the create body or the lines the
 * key picker draws.
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
import { crc32, deflateSync } from 'node:zlib';

import { expect, type Locator, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import {
  ACCOUNT_EMPTY_NOTE,
  accountSession,
  bodyOf,
  gateOffSession,
  nextRequest,
  scopedKeySession,
  serveWrite,
  stubKeyList,
  stubRead,
  stubSession,
} from './session-stubs';

needs();

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
  reply_texts: null,
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
  inbound_attachments: null,
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

/** The served-media references the inbound-attachments frame carries: 43 urlsafe-base64
 * id chars after the route prefix, the platform's own capability url shape. */
const ATTACHMENT_IMAGE_URL = `/api/interactions/media/${'b'.repeat(43)}`;
const ATTACHMENT_DOCUMENT_URL = `/api/interactions/media/${'c'.repeat(43)}`;

/** The stubbed served image: a small two-tone PNG (RGB, no filter) built from arithmetic
 * only, so the inline image loads to the same visible picture on every run rather than a
 * black block or a broken-load notice. */
function placeholderPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const light = Math.floor(((x + y) / (width + height)) * 4) % 2 === 0;
      raw.set(light ? [203, 213, 225] : [148, 163, 184], row + 1 + x * 3);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ATTACHMENT_IMAGE_PNG = placeholderPng(240, 150);

/** The transcript record the inbound-attachments frame captures: a visitor turn carrying
 * a byte-backed image and a document beside its text. */
const ATTACHMENT_RECORD = {
  ...RECORD_BASE,
  message_id: 'm-201',
  inbound_text: 'here are the files you asked for',
  inbound_attachments: [
    { kind: 'image', url: ATTACHMENT_IMAGE_URL, caption: 'the layout' },
    { kind: 'document', url: ATTACHMENT_DOCUMENT_URL, filename: 'report.pdf' },
  ],
  answer_status: 'answered',
  answer: 'Thanks — received.',
  successor_id: null,
  delivery_status: 'delivered',
  created_at: 1_800_000_010,
};

/** The transcript records the inbound-reply-to frame captures: an answered turn, a turn
 * quoting that answer (held, so its text shows), and a turn quoting a message the thread
 * does not hold. */
const REPLY_TO_ANSWER = 'There are two options: the daily digest or the weekly summary.';
const REPLY_TO_RECORDS = [
  {
    ...RECORD_BASE,
    message_id: 'm-301',
    inbound_text: 'which reports can I get',
    answer_status: 'answered',
    answer: REPLY_TO_ANSWER,
    successor_id: null,
    delivery_status: 'delivered',
    created_at: 1_800_000_020,
  },
  {
    ...RECORD_BASE,
    message_id: 'm-302',
    inbound_text: 'the second one, please',
    inbound_reply_to: { message_id: 'wamid.demo-301', status: 'found', text: REPLY_TO_ANSWER },
    answer_status: 'answered',
    answer: 'Done: the weekly summary is on.',
    successor_id: null,
    delivery_status: 'delivered',
    created_at: 1_800_000_021,
  },
  {
    ...RECORD_BASE,
    message_id: 'm-303',
    inbound_text: 'and is this one still right?',
    inbound_reply_to: { message_id: 'wamid.demo-117', status: 'not_found', text: null },
    answer_status: 'answered',
    answer: 'I cannot see that earlier message here. Could you send it again?',
    successor_id: null,
    delivery_status: 'delivered',
    created_at: 1_800_000_022,
  },
];

/** The send records the sends frame captures, oldest first. */
const SEND_BASE = {
  ...RECORD_BASE,
  origin: 'send',
  inbound_text: '',
  answer_status: null,
  successor_id: null,
  turn_message_id: null,
} as const;

const SENDS_RECORDS = [
  {
    ...RECORD_BASE,
    message_id: 'm-301',
    inbound_text: 'is the nightly export done',
    answer_status: 'answered',
    answer: 'Yes — the export finished at 02:10.',
    successor_id: null,
    delivery_status: 'delivered',
    created_at: 1_800_000_020,
  },
  {
    ...SEND_BASE,
    message_id: 'm-302',
    sent_by: 'notify',
    turn_message_id: 'm-301',
    answer: 'Checking the export log now.',
    delivery_status: 'delivered',
    sends: [{ part: 0, chars: 28, provider_message_ids: ['SM-302'] }],
    created_at: 1_800_000_021,
  },
  {
    ...SEND_BASE,
    message_id: 'm-303',
    sent_by: 'notify',
    answer: 'Your weekly summary is ready.',
    delivery_status: 'delivered',
    sends: [{ part: 0, chars: 29, provider_message_ids: ['SM-303'] }],
    created_at: 1_800_000_030,
  },
  {
    ...SEND_BASE,
    message_id: 'm-304',
    sent_by: 'ask',
    answer: 'Please reply with the one-time code from your account page.',
    ask: { answer_format: 'text', attempts: 1, interaction_id: 'int-304', sensitive: true },
    ask_reply: {
      answer: null,
      answered_at: '2027-01-15T08:00:45Z',
      medium_message_id: 'SM-in-304',
    },
    delivery_status: 'delivered',
    sends: [{ part: 0, chars: 59, provider_message_ids: ['SM-304'] }],
    created_at: 1_800_000_040,
  },
  {
    ...SEND_BASE,
    message_id: 'm-305',
    sent_by: 'notice',
    answer: 'This conversation was linked to your other channel.',
    delivery_status: 'delivered',
    sends: [{ part: 0, chars: 51, provider_message_ids: ['SM-305'] }],
    created_at: 1_800_000_050,
  },
  {
    ...SEND_BASE,
    message_id: 'm-306',
    sent_by: 'channel',
    answer: 'That form has closed.',
    delivery_status: 'failed',
    attempts: 1,
    error: 'ChannelDeliveryError: the provider refused the recipient',
    created_at: 1_800_000_060,
  },
  {
    ...SEND_BASE,
    message_id: 'm-307',
    sent_by: 'notify',
    answer: 'Your export link expires tomorrow.',
    delivery_status: 'outcome_unknown',
    attempts: 1,
    error: 'the send did not answer within 30s; the outcome is unknown',
    created_at: 1_800_000_070,
  },
];

/** The route the bulk-reset frames drive their thread list on — one of the table
 * routes, so the `/api/conversations` stub already lists it and the list renders. */
const BULK_ROUTE = 'assistant-line';

/** The three loaded threads the bulk-reset frames select over: enough to show the
 * select-all header, a multi-count action, and a mixed success/failure result. */
const BULK_THREADS = [
  {
    thread_id: `${BULK_ROUTE}/+10000000001`,
    client_address: '+10000000001',
    last_activity_at: 1_800_000_201,
    message_count: 4,
    last_delivery_status: 'delivered',
  },
  {
    thread_id: `${BULK_ROUTE}/+10000000002`,
    client_address: '+10000000002',
    last_activity_at: 1_800_000_202,
    message_count: 2,
    last_delivery_status: 'delivered',
  },
  {
    thread_id: `${BULK_ROUTE}/+10000000003`,
    client_address: '+10000000003',
    last_activity_at: 1_800_000_203,
    message_count: 7,
    last_delivery_status: 'failed',
  },
] as const;

/** The one thread whose reset the result frame fails: its DELETE rejects with a 409
 * (a turn in flight), so the batch shows a success summary beside one failed row. */
const BULK_FAILED_THREAD = `${BULK_ROUTE}/+10000000003`;

/** The reason the failed row surfaces — the skeleton's `{ error }` message shape. */
const BULK_FAILURE_REASON = 'This thread has a turn in flight; try again once it settles.';

/** The accessible name of the multi-count action, shared by the select and confirm frames. */
const BULK_RESET_ACTION = `Reset selected (${String(BULK_THREADS.length)})`;

/** The confirm dialog's confirm label, which names the selected count. */
const BULK_CONFIRM_LABEL = `Reset ${String(BULK_THREADS.length)} threads`;

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

const SENDS_URL = `/conversations?route=${encodeURIComponent(TRANSCRIPT_ROUTE)}&thread=${encodeURIComponent(TRANSCRIPT_THREAD)}`;

/** Serve the transcript thread with `records` (oldest first) as its whole history. */
async function stubSendsTranscript(
  page: Page,
  records: readonly (typeof SENDS_RECORDS)[number][],
): Promise<void> {
  const newest = records.at(-1);
  if (newest === undefined) throw new Error('the sends transcript needs at least one record');
  await stubGet(page, '/api/conversations', pageOf(TABLE_ROUTES));
  await stubGet(
    page,
    `/api/conversations/${TRANSCRIPT_ROUTE}/threads`,
    pageOf([
      {
        thread_id: TRANSCRIPT_THREAD,
        client_address: TRANSCRIPT_ADDRESS,
        last_activity_at: newest.created_at,
        message_count: records.length,
        last_delivery_status: newest.delivery_status,
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
    // The transcript reads newest first and reverses the page to reading order.
    pageOf([...records].reverse(), { order: 'desc', person_id: null }),
  );
}

/** Open the delivery detail of the exchange whose text includes `text`. */
async function openDeliveryDetail(page: Page, text: string): Promise<void> {
  await page
    .getByTestId('conversation-exchange')
    .filter({ hasText: text })
    .getByTestId('exchange-admin-detail')
    .locator('summary')
    .click();
}

/** Scroll the page so `target` sits at the top of the viewport. */
async function scrollToTop(target: Locator): Promise<void> {
  await target.evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
  });
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
  /** The one element captured whole (it may run past the viewport); unset, the shot is the
   * fixed viewport. */
  readonly capture?: (page: Page) => Locator;
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
      await stubGet(page, '/api/storage', {
        present: true,
        provider: 'demo',
        module: 'demo',
        surfaces: ['storage', 'templates'],
      });
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
        pageOf(TRANSCRIPT_RECORDS, { order: 'desc', person_id: null }),
      );
    },
    action: async (page) => {
      await page.getByText(/Superseded by/).scrollIntoViewIfNeeded();
    },
    ready: (page) => page.getByText(/Merged into/),
  },
  {
    // One thread's transcript whose visitor turn carries typed inbound attachments — a
    // served image inline and a document download chip — rendered beside the text.
    name: 'conversation-inbound-attachments',
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
            last_activity_at: 1_800_000_010,
            message_count: 1,
            last_delivery_status: 'delivered',
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
        pageOf([ATTACHMENT_RECORD], { order: 'desc', person_id: null }),
      );
      // The served-media capability url the image loads from: fulfil it so the inline
      // image resolves to a real bitmap rather than a broken-load notice.
      await page.route(
        (url) => url.pathname.startsWith('/api/interactions/media/'),
        async (route) => {
          await route.fulfill({ contentType: 'image/png', body: ATTACHMENT_IMAGE_PNG });
        },
      );
    },
    action: async (page) => {
      const image = page.getByRole('img', { name: 'the layout' });
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBe(240);
      await scrollToTop(page.getByRole('heading', { name: TRANSCRIPT_ADDRESS }));
    },
    ready: (page) => page.getByRole('link', { name: 'report.pdf' }),
  },
  {
    // One thread's transcript whose visitor turns quote earlier messages: a held quote with
    // its text above the message, and a quote the thread does not hold, naming its id.
    name: 'conversation-inbound-reply-to',
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
            last_activity_at: 1_800_000_022,
            message_count: REPLY_TO_RECORDS.length,
            last_delivery_status: 'delivered',
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
        pageOf([...REPLY_TO_RECORDS].reverse(), { order: 'desc', person_id: null }),
      );
    },
    action: async (page) => {
      await scrollToTop(page.getByRole('heading', { name: TRANSCRIPT_ADDRESS }));
    },
    ready: (page) => page.getByText('wamid.demo-117'),
    capture: (page) =>
      page
        .locator('.tai-card')
        .filter({ has: page.getByTestId('conversation-transcript') })
        .last(),
  },
  {
    // Every send kind on one thread: a turn with the send made during it inside its exchange,
    // a sent message out of any turn and a send whose outcome is unknown with their delivery
    // details open, a sensitive question's reply with no body, a platform notice and a failed
    // channel notice.
    name: 'conversation-transcript-sends',
    url: SENDS_URL,
    setup: async (page) => {
      await stubSendsTranscript(page, SENDS_RECORDS);
    },
    action: async (page) => {
      await openDeliveryDetail(page, 'Your weekly summary is ready.');
      await openDeliveryDetail(page, 'Your export link expires tomorrow.');
    },
    ready: (page) => page.getByTestId('conversation-transcript').getByText('Sent, outcome unknown'),
    capture: (page) =>
      page
        .locator('.tai-card')
        .filter({ has: page.getByTestId('conversation-transcript') })
        .last(),
  },
  {
    // The thread list's multi-select surface: the per-row checkboxes, the header
    // select-all ticked over every loaded row, and the "Reset selected (N)" danger
    // action it reveals. The DELETE capability the surface gates on is granted by
    // the admin boot credential, as the create/edit dialogs are.
    name: 'conversation-bulk-reset-select',
    url: `/conversations?route=${encodeURIComponent(BULK_ROUTE)}`,
    setup: async (page) => {
      await stubGet(page, '/api/conversations', pageOf(TABLE_ROUTES));
      await stubGet(page, `/api/conversations/${BULK_ROUTE}/threads`, pageOf(BULK_THREADS));
    },
    action: async (page) => {
      await page.getByRole('checkbox', { name: 'Select all threads' }).click();
      await page.getByRole('button', { name: BULK_RESET_ACTION }).waitFor({ state: 'visible' });
    },
    ready: (page) => page.getByRole('button', { name: BULK_RESET_ACTION }),
  },
  {
    // The "Reset selected threads" confirm dialog, whose copy and confirm label both
    // name the selected count before any thread is forgotten.
    name: 'conversation-bulk-reset-confirm',
    url: `/conversations?route=${encodeURIComponent(BULK_ROUTE)}`,
    setup: async (page) => {
      await stubGet(page, '/api/conversations', pageOf(TABLE_ROUTES));
      await stubGet(page, `/api/conversations/${BULK_ROUTE}/threads`, pageOf(BULK_THREADS));
    },
    action: async (page) => {
      await page.getByRole('checkbox', { name: 'Select all threads' }).click();
      await page.getByRole('button', { name: BULK_RESET_ACTION }).click();
      await page.getByRole('dialog').waitFor({ state: 'visible' });
    },
    ready: (page) => page.getByRole('button', { name: BULK_CONFIRM_LABEL }),
  },
  {
    // The per-item result: the fan-out over the per-thread DELETE door with one
    // thread held by a turn in flight, so the summary ("N threads reset.") shows
    // beside a failed row carrying its reason and a Retry. The threads door reads a
    // live set a successful delete drops from; the one in-flight thread's DELETE
    // rejects with a 409, surfacing loudly instead of being hidden.
    name: 'conversation-bulk-reset-result',
    url: `/conversations?route=${encodeURIComponent(BULK_ROUTE)}`,
    setup: async (page) => {
      await stubGet(page, '/api/conversations', pageOf(TABLE_ROUTES));
      const present = new Map<string, (typeof BULK_THREADS)[number]>(
        BULK_THREADS.map((thread) => [thread.thread_id, thread]),
      );
      await page.route(
        (url) => url.pathname === `/api/conversations/${BULK_ROUTE}/threads`,
        async (route) => {
          if (route.request().method() !== 'GET') {
            await route.fallback();
            return;
          }
          await route.fulfill({ json: { data: pageOf([...present.values()]) } });
        },
      );
      await page.route(
        (url) => url.pathname === `/api/conversations/${BULK_ROUTE}/thread`,
        async (route) => {
          if (route.request().method() !== 'DELETE') {
            await route.fallback();
            return;
          }
          const threadId = new URL(route.request().url()).searchParams.get('thread_id') ?? '';
          if (threadId === BULK_FAILED_THREAD) {
            await route.fulfill({ status: 409, json: { error: BULK_FAILURE_REASON } });
            return;
          }
          present.delete(threadId);
          await route.fulfill({
            json: {
              data: {
                removed: 1,
                route_name: BULK_ROUTE,
                thread_id: threadId,
                states_erased: 0,
              },
            },
          });
        },
      );
    },
    action: async (page) => {
      await page.getByRole('checkbox', { name: 'Select all threads' }).click();
      await page.getByRole('button', { name: BULK_RESET_ACTION }).click();
      await page.getByRole('button', { name: BULK_CONFIRM_LABEL }).click();
      await page
        .getByTestId('conversation-bulk-reset-result')
        .getByRole('button', { name: 'Retry' })
        .waitFor({ state: 'visible' });
    },
    ready: (page) => page.getByTestId('conversation-bulk-reset-result'),
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

        // Let fonts + layout settle, then capture the frame's element or the fixed viewport.
        await page.waitForTimeout(500);
        const path = `${OUT_DIR}/${frame.name}-${theme}.png`;
        if (frame.capture) await frame.capture(page).screenshot({ path });
        else await page.screenshot({ path });
      });
    }
  });
}

test.beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true });
});

// ---- The route dialog's pickers and execution-key binding ----------------------
// The dialog picks each name from the deployment's own list. These cases serve the
// lists, the session and the create write through `page.route`, so they read the same
// on any boot.

/** The agent, channel and identity a picked route binds. */
const PICKED = { agent: 'assistant', channel: 'web', identity: '+10000000000' } as const;

/** The reach a scoped session needs to read the routes and create one through the pickers. */
const ROUTE_DIALOG_REACH = [
  { path: '/api/conversations', methods: ['GET'] },
  { path: '/api/conversations/{route_name}', methods: ['POST'] },
  { path: '/api/agents', methods: ['GET'] },
  { path: '/api/tools', methods: ['GET'] },
  { path: '/api/channels', methods: ['GET'] },
  { path: '/api/auth/tokens-payload', methods: ['GET'] },
] as const;

/** Serve the agent, tool and channel lists the pickers read. */
async function stubPickerLists(page: Page): Promise<void> {
  await stubGet(page, '/api/agents', {
    items: [
      {
        name: PICKED.agent,
        description: '',
        tool_name: `run_${PICKED.agent}`,
        input_schema: {},
        spec_runnable: false,
      },
    ],
    total: 1,
  });
  await stubGet(page, '/api/tools', ['studio_demo_echo']);
  await stubGet(page, '/api/channels', {
    channels: [{ name: PICKED.channel, identity_hint: 'The address visitors message.' }],
  });
}

/** Pick `option` in the combobox named `name` inside `dialog`. */
async function pick(page: Page, dialog: Locator, name: string, option: string): Promise<void> {
  await dialog.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Open the create dialog and fill a channel route to an agent through the pickers. */
async function fillPickedRoute(page: Page, routeName: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Create route' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Route name').fill(routeName);
  await pick(page, dialog, 'Target kind', 'Agent');
  await pick(page, dialog, 'Agent', PICKED.agent);
  await pick(page, dialog, 'Door', 'Channel');
  await pick(page, dialog, 'Channel', PICKED.channel);
  await dialog.getByLabel('Our identity').fill(PICKED.identity);
  return dialog;
}

const isRouteWrite = (pathname: string): boolean =>
  pathname.startsWith('/api/conversations/') && pathname.split('/').length === 4;

/** The create door's answer for a channel route named `routeName`. */
function written(routeName: string, executionKey: string): { readonly data: unknown } {
  return {
    data: {
      route_name: routeName,
      created: true,
      callback_secret: null,
      route: {
        ...ROUTE_BASE,
        route_name: routeName,
        target_name: PICKED.agent,
        channel: PICKED.channel,
        our_identity: PICKED.identity,
        execution_key: executionKey,
        overlap: OVERLAP_DEFAULT,
      },
    },
  };
}

test.describe('route dialog pickers', () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await seedCredential(page);
    await stubGet(page, '/api/conversations', pageOf([]));
    await stubPickerLists(page);
  });

  test('a key session over an empty key list creates the route as its own identity', async ({
    page,
  }) => {
    await stubSession(page, scopedKeySession('alice', ROUTE_DIALOG_REACH));
    await stubKeyList(page, { keys: [] });
    await serveWrite(page, 'POST', isRouteWrite, written('picked-line', 'alice'));
    await page.goto('/conversations');

    const dialog = await fillPickedRoute(page, 'picked-line');
    await pick(page, dialog, 'Execution key', "alice — this session's identity");
    const write = nextRequest(page, 'POST', isRouteWrite);
    await dialog.getByRole('button', { name: 'Create route' }).click();

    const body = bodyOf(await write);
    expect(body).toMatchObject({
      execution_key: 'alice',
      target_kind: 'agent',
      target_name: PICKED.agent,
      door: 'channel',
      channel: PICKED.channel,
      our_identity: PICKED.identity,
    });
  });

  test('the Agent and Channel pickers narrow by typed text and choose from the keyboard', async ({
    page,
  }) => {
    const agent = (name: string) => ({
      name,
      description: '',
      tool_name: `run_${name}`,
      input_schema: {},
      spec_runnable: false,
    });
    await stubGet(page, '/api/agents', {
      items: [agent(PICKED.agent), agent('relay-agent'), agent('status-agent')],
      total: 3,
    });
    await stubGet(page, '/api/channels', {
      channels: [
        { name: PICKED.channel, identity_hint: 'The address visitors message.' },
        { name: 'chat-line', identity_hint: null },
      ],
    });
    await page.goto('/conversations');
    await page.getByRole('button', { name: 'Create route' }).click();
    const dialog = page.getByRole('dialog');
    await pick(page, dialog, 'Target kind', 'Agent');

    const agentTrigger = dialog.getByRole('combobox', { name: 'Agent', exact: true });
    await agentTrigger.click();
    const agentSearch = page.getByRole('combobox', { name: 'Search agents' });
    await expect(agentSearch).toBeFocused();
    await expect(page.getByRole('option')).toHaveCount(3);
    await agentSearch.fill('STATUS');
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option', { name: 'status-agent' })).toHaveAttribute(
      'data-highlighted',
    );
    await agentSearch.fill('nobody');
    await expect(
      page.getByRole('status').filter({ hasText: 'Nothing matches “nobody”.' }),
    ).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(0);
    await agentSearch.fill('relay');
    await agentSearch.press('Enter');
    await expect(agentSearch).toBeHidden();
    await expect(agentTrigger).toContainText('relay-agent');

    await pick(page, dialog, 'Door', 'Channel');
    const channelTrigger = dialog.getByRole('combobox', { name: 'Channel', exact: true });
    await channelTrigger.click();
    const channelSearch = page.getByRole('combobox', { name: 'Search channels' });
    await expect(channelSearch).toBeFocused();
    await channelSearch.fill('chat');
    await expect(page.getByRole('option')).toHaveCount(1);
    await channelSearch.press('Enter');
    await expect(channelSearch).toBeHidden();
    await expect(channelTrigger).toContainText('chat-line');
  });

  test('a session that cannot list agents reads the note in place of the agent list', async ({
    page,
  }) => {
    await stubRead(page, '/api/agents', { status: 403, error: 'Forbidden' });
    await page.goto('/conversations');

    await page.getByRole('button', { name: 'Create route' }).click();
    const dialog = page.getByRole('dialog');
    await pick(page, dialog, 'Target kind', 'Agent');
    await expect(
      dialog.getByText(
        'This session cannot list agents. Picking one needs read access to GET /api/agents; ask an administrator to grant it.',
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("a stored key that is not the session's identity is flagged before save", async ({
    page,
  }) => {
    const bound = { ...ROUTE_BASE, route_name: 'bound-line', channel: PICKED.channel };
    await stubGet(
      page,
      '/api/conversations',
      pageOf([{ ...bound, execution_key: 'svc-x', overlap: OVERLAP_DEFAULT }]),
    );
    await stubSession(page, scopedKeySession('alice', ROUTE_DIALOG_REACH));
    await stubKeyList(page, { keys: [] });
    await page.goto('/conversations');

    await page.getByRole('button', { name: 'Edit route bound-line' }).click();
    await expect(
      page
        .getByRole('dialog')
        .getByText(
          "svc-x is not this session's identity (alice), so the server will refuse it on save.",
        ),
    ).toBeVisible();
  });

  test('an account session over an empty key list reads the note and is offered no identity', async ({
    page,
  }) => {
    await stubSession(page, accountSession);
    await stubKeyList(page, { keys: [] });
    await page.goto('/conversations');

    await page.getByRole('button', { name: 'Create route' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(ACCOUNT_EMPTY_NOTE, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Execution key' })).toHaveCount(0);
  });

  test('with access control off the dialog shows no key field and sends the fill identity', async ({
    page,
  }) => {
    await stubSession(page, gateOffSession);
    await serveWrite(page, 'POST', isRouteWrite, written('open-line', '__no_auth__'));
    await page.goto('/conversations');

    const dialog = await fillPickedRoute(page, 'open-line');
    await expect(dialog.getByText('Execution key', { exact: true })).toHaveCount(0);
    const create = dialog.getByRole('button', { name: 'Create route' });
    await expect(create).toBeEnabled();
    const write = nextRequest(page, 'POST', isRouteWrite);
    await create.click();

    expect(bodyOf(await write).execution_key).toBe('__no_auth__');
  });
});
