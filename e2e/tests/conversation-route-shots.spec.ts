/**
 * Design-review frames for the conversation-route create/edit dialog
 * (`packages/features/conversations/src/RouteFormDialog.tsx`), captured against the LIVE
 * boot skeleton in BOTH themes at 1440×900. Two frames per theme:
 *
 *   - `conversation-route-create` — the CREATE dialog open, its target set to a tool so the
 *     `payload_expr` field renders, authored inline (the `x-tai42-expression` jq editor).
 *   - `conversation-route-edit` — the EDIT dialog open on an existing tool route whose
 *     templated-text `payload_expr`/`reply_expr` prefill the two expression fields.
 *
 * The routes landing reads only its routes list (the sibling admin tabs read their door
 * only when opened), so the list is served through `page.route`; the storage-presence and
 * stored-template reads are stubbed too, deterministically, in case a nested control reads
 * them. The dialog's write capability is granted by the boot credential, as for the preset
 * and hook create dialogs.
 *
 * The PNGs land in `ROUTE_SHOTS_DIR` (default: the gitignored `test-results/`), so a
 * reviewer can point it at any directory for out-of-tree evidence without the shots ever
 * being committed. Fixtures use a domain-agnostic assistant/echo vocabulary.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, type Locator, type Page, test } from '@playwright/test';

import { seedCredential } from './helpers';

/** The dialog is a 1440-wide modal over the routes landing. */
const VIEWPORT = { width: 1440, height: 900 } as const;

const OUT_DIR =
  process.env.ROUTE_SHOTS_DIR ??
  fileURLToPath(new URL('../test-results/conversation-route-shots', import.meta.url));

/** The loud shared error card. Its presence in the dialog means the capture is broken. */
const ERROR_CARD = '[role="alert"]:has-text("Something went wrong")';

/** An existing tool route with templated-text payload/reply, prefilling the edit dialog. */
const EDIT_ROUTE = {
  route_name: 'assistant-line',
  door: 'channel',
  channel: 'whatsapp',
  our_identity: '+10000000000',
  target_kind: 'tool',
  target_name: 'studio_demo_echo',
  execution_key: 'studio-e2e',
  execution_key_fingerprint: 'fp-demo',
  initial_mode: 'agent',
  payload_expr: { content: '{ text: .message.text }' },
  reply_expr: { content: '{ text: .result.text }' },
};

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

interface Frame {
  readonly name: string;
  /** Route stubs installed before navigation. */
  readonly setup: (page: Page) => Promise<void>;
  /** Drive the page into the state to capture (open the dialog, set the target). */
  readonly action: (page: Page) => Promise<void>;
  /** The POPULATED signal proving the intended state rendered. */
  readonly ready: (page: Page) => Locator;
}

const FRAMES: readonly Frame[] = [
  {
    // The create dialog: target set to a tool so the payload expression renders inline.
    name: 'conversation-route-create',
    setup: async (page) => {
      await stubGet(page, '/api/conversations', { items: [], total: 0 });
      await stubGet(page, '/api/storage', { present: true, provider: 'demo', module: 'demo' });
      await stubGet(page, '/api/templates', []);
    },
    action: async (page) => {
      await page.getByRole('button', { name: 'Create route' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('combobox', { name: 'Target' }).click();
      await page.getByRole('option', { name: 'Tool' }).click();
      await dialog.getByText('Payload expression').waitFor({ state: 'visible' });
    },
    ready: (page) => page.getByRole('dialog').getByText('Payload expression'),
  },
  {
    // The edit dialog on an existing tool route: its payload/reply expressions prefill.
    name: 'conversation-route-edit',
    setup: async (page) => {
      await stubGet(page, '/api/conversations', { items: [EDIT_ROUTE], total: 1 });
      await stubGet(page, '/api/storage', { present: true, provider: 'demo', module: 'demo' });
      await stubGet(page, '/api/templates', []);
    },
    action: async (page) => {
      await page.getByRole('button', { name: `Edit route ${EDIT_ROUTE.route_name}` }).click();
      await page.getByRole('dialog').getByText('Payload expression').waitFor({ state: 'visible' });
    },
    ready: (page) => page.getByRole('dialog').getByText('Reply expression'),
  },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Conversation route dialog frames (${theme})`, () => {
    test.use({ colorScheme: theme, viewport: VIEWPORT });

    for (const frame of FRAMES) {
      test(frame.name, async ({ page }) => {
        await seedCredential(page);
        await frame.setup(page);
        await page.goto('/conversations', { waitUntil: 'domcontentloaded' });
        await frame.action(page);
        await frame.ready(page).waitFor({ state: 'visible' });

        // The colour-scheme emulation must have resolved to a genuinely themed render, and
        // the dialog must carry no error card — otherwise the shot is meaningless. The check
        // is scoped to the dialog: the routes landing is served clean here, but scoping keeps
        // the frame about the dialog itself.
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByRole('dialog').locator(ERROR_CARD)).toHaveCount(0);

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
