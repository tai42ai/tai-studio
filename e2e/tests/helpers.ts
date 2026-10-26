/**
 * Shared helpers for the live suites. The suites drive the Studio SERVED BY
 * THE SKELETON (the boot recipe) — real login, real server-injected import map,
 * real plugin bundles.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { STUDIO_API_KEY } from '../playwright.config';

/** The login key: the target's key on a `TAI_E2E_TARGET` run, else the seeded test-only
 * key (matches boot.sh's default). Resolved once in the config so every path agrees. */
export const API_KEY = STUDIO_API_KEY;

/** The `user_id` behind {@link API_KEY}. */
export const EXECUTION_KEY_ID = process.env.STUDIO_USER_ID ?? 'studio-e2e';

/** The sessionStorage key `useAuth` reads/writes for the "remember" opt-in. */
const SESSION_KEY = 'tai-studio.apiKey';

/**
 * Pre-seed the credential into sessionStorage BEFORE any page script runs, so the
 * shell's `AuthProvider` boots authenticated and survives full-page navigations
 * (each `page.goto` is a real reload — an in-memory-only token would be lost). Used
 * by the suites that are not specifically exercising the login UI.
 */
export async function seedCredential(page: Page, key: string = API_KEY): Promise<void> {
  await page.addInitScript(
    ([storageKey, value]) => {
      window.sessionStorage.setItem(storageKey, value);
    },
    [SESSION_KEY, key] as const,
  );
}

/** Log in through the real credential screen (paste key + remember + submit). */
export async function loginViaUi(page: Page, key: string = API_KEY): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('API key').fill(key);
  // "Remember on this device" persists to sessionStorage so later navigations in
  // this tab stay authenticated.
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Sign in' }).click();
  // No explicit returnTo, so the login default is `/` and the landing route lands
  // the full-access session on the Dashboard.
  await page.waitForURL('**/observability');
}

/** Escape a value for literal use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pick an execution key in `scope`'s picker. The portalled listbox matches at page
 * level; the id is escaped and boundary-anchored — a bare prefix fails strict mode.
 */
export async function pickExecutionKey(
  page: Page,
  scope: Locator,
  keyId: string = EXECUTION_KEY_ID,
): Promise<void> {
  await scope.getByRole('combobox', { name: 'Execution key' }).click();
  await page.getByRole('option', { name: new RegExp(`^${escapeRegExp(keyId)}(?:\\s|$)`) }).click();
}

/** The loud plugin/registry error card is an `alert` role carrying this copy. */
export async function expectPluginErrorCard(page: Page, contains: RegExp): Promise<void> {
  const alert = page.getByRole('alert').filter({ hasText: contains });
  await expect(alert).toBeVisible();
}

/**
 * Open the tools list's row for `name`, paging the explorer forward until it is on
 * screen. The explorer paginates CLIENT-SIDE (24 entries per page by default) and
 * this boot projects well over a page of tools. Paging is local state — never a
 * route change or a reload — so a just-registered plugin panel stays in module
 * state.
 */
export async function openToolRow(page: Page, name: string): Promise<void> {
  const link = page.getByRole('link', { name: `Open tool ${name}`, exact: true });
  const pager = page.getByRole('navigation', { name: 'Tools pagination' });
  const next = pager.getByRole('button', { name: 'Next page' });
  const previous = pager.getByRole('button', { name: 'Previous page' });
  // The pager renders for any non-empty list, so this also gates on the list itself
  // having painted.
  await expect(next, 'the tools explorer never painted a non-empty list').toBeVisible();
  // Late tag and folder reads can refile entries after the first paint, shifting rows
  // across pages, so a sweep that ended without the target is rewound and repeated once.
  for (let sweep = 0; sweep < 2; sweep += 1) {
    if (sweep > 0) {
      while ((await previous.getAttribute('aria-disabled')) !== 'true') await previous.click();
    }
    for (;;) {
      if ((await link.count()) > 0) {
        await link.click();
        return;
      }
      // The last page marks Next `aria-disabled` rather than dropping it from the tab
      // order, and its click handler is inert there — so that attribute is the bound.
      if ((await next.getAttribute('aria-disabled')) === 'true') break;
      await next.click();
    }
  }
  throw new Error(`no "Open tool ${name}" row on any page of the tools explorer`);
}

/**
 * Page the authed pending door (`GET /api/interactions`) in the browser and resolve
 * the `interaction_id` of the pending question whose text equals `question`.
 * Matching on a UNIQUE question makes this robust. Polls until the question appears
 * (the asking tool run may still be in flight) or a deadline. Runs in-page so it
 * uses the same-origin credential path the app uses.
 */
export async function findInteractionId(
  page: Page,
  question: string,
  key: string = API_KEY,
): Promise<string> {
  const id = await page.evaluate(
    async ({ apiKey, target }) => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        for (let pageNum = 1; pageNum <= 100; pageNum += 1) {
          const res = await fetch(`/api/interactions?page=${String(pageNum)}&pageSize=50`, {
            headers: { 'x-api-key': apiKey, accept: 'application/json' },
          });
          if (!res.ok) return null;
          const body = (await res.json()) as {
            data?: { items?: unknown; next_page?: unknown };
          };
          const items = Array.isArray(body.data?.items) ? body.data.items : [];
          for (const item of items) {
            const obj = item as { question?: unknown; interaction_id?: unknown };
            if (obj.question === target && typeof obj.interaction_id === 'string') {
              return obj.interaction_id;
            }
          }
          if (body.data?.next_page == null) break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return null;
    },
    { apiKey: key, target: question },
  );
  if (id === null) throw new Error(`no pending interaction found for question: ${question}`);
  return id;
}

/** Answer a pending interaction through the real authed /answer door. */
export async function answerInteraction(
  page: Page,
  interactionId: string,
  answer: unknown,
  key: string = API_KEY,
): Promise<void> {
  const res = await page.request.post(`/api/interactions/${interactionId}/answer`, {
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    data: { answer },
  });
  expect(res.status()).toBe(200);
}

/** The look-up answer the add-server frames stub for `https://mcp.example.com/mcp`. */
export const ADD_SERVER_LOOKUP = {
  url: 'https://mcp.example.com/mcp',
  resource: 'https://mcp.example.com/mcp',
  resource_name: 'Remote files',
  issuer: 'https://login.example.com',
  authorization_servers: ['https://login.example.com'],
  client_issuer: null,
  registration_supported: true,
  automatic_client: true,
  scopes_supported: ['files.read', 'files.write'],
  suggested_id: 'remote_files',
  suggested_display_name: 'Remote files',
  redirect_uri: null,
};

/**
 * On the Connectors page, click the header's "Add a custom server" and drive the "Add
 * MCP server" dialog to its review step. The single look-up call is answered by a route stub: the stack under test has no
 * OAuth-protected server to look up, and the frame is of the screen, not the server.
 */
export async function openAddServerReview(page: Page): Promise<Locator> {
  await page.route(
    (url) => url.pathname === '/api/connectors/providers/discover',
    async (route) => {
      await route.fulfill({ json: { data: ADD_SERVER_LOOKUP } });
    },
  );
  // The header's action, by name inside the page header: an empty directory draws a
  // second "Add a custom server" in its empty state.
  await page
    .locator('.tai-page-header')
    .getByRole('button', { name: 'Add a custom server' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Add MCP server' });
  await dialog.getByLabel('Server address').fill(ADD_SERVER_LOOKUP.url);
  await dialog.getByRole('button', { name: 'Look up' }).click();
  await expect(dialog.getByRole('button', { name: 'Add server' })).toBeVisible();
  return dialog;
}

/** The preset the held-delete frame shows, and the route that holds it. */
const HELD_PRESET = 'relay-echo';
const HELD_ROUTE = 'chat-line';

/**
 * Open the delete confirm for a preset a conversation route still holds, its holder
 * list drawn. The preset list, its detail and its delete-holder read are served here, so
 * the frame needs no seeded preset and writes nothing; every other read falls through
 * to the live skeleton.
 */
export async function openHeldPresetDelete(page: Page): Promise<Locator> {
  const record = {
    name: HELD_PRESET,
    base_tool: 'studio_demo_echo',
    description: 'Echoes a fixed message.',
    active_version: 1,
    conflicted: false,
    conflicted_reason: null,
    extensions: [],
    input_schema: null,
    input_map: null,
    output_schema: null,
    output_map: null,
    used_by: [],
    uses: [],
  };
  const served: Record<string, unknown> = {
    '/api/presets': [record],
    [`/api/presets/${HELD_PRESET}`]: { ...record, fixed_kwargs: {} },
    [`/api/presets/${HELD_PRESET}/referees`]: {
      action: 'delete',
      holders: [
        {
          kind: 'conversation route',
          tag: 'conversations',
          name: HELD_ROUTE,
          locator: {},
          summary: `conversation route '${HELD_ROUTE}'`,
        },
      ],
    },
  };
  await page.route(
    (url) => Object.hasOwn(served, url.pathname),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({ json: { data: served[pathname] } });
    },
  );
  await page.goto(`/presets?preset=${HELD_PRESET}`);
  await page.getByRole('button', { name: `Delete preset ${HELD_PRESET}` }).click();
  const dialog = page.getByRole('dialog', { name: `Delete preset — ${HELD_PRESET}` });
  await expect(
    dialog.getByRole('link', { name: `conversation route '${HELD_ROUTE}'` }),
  ).toBeVisible();
  return dialog;
}

/**
 * Open the Connectors connect flow at its Connect step for a stubbed provider with one
 * sub-service and no connection yet: the stepper above the connect form. The providers
 * and connections reads are served here, so the frame needs no seeded provider and
 * writes nothing; every other read falls through to the live skeleton.
 */
export async function openConnectFlow(page: Page): Promise<Locator> {
  const served: Record<string, unknown> = {
    '/api/connectors/providers': {
      providers: [
        {
          id: 'acme_files',
          display_name: 'Acme files',
          description: 'Read and write files in an Acme workspace.',
          icon_url: null,
          kind: 'oauth',
          origin: 'system',
          category: 'tools',
          sub_services: [{ id: 'default', display_name: 'Files', description: '', scopes: [] }],
          config_fields: [],
        },
      ],
      categories: [{ id: 'tools', display_name: 'Tools', sort_order: 1 }],
    },
    '/api/connectors/connections': { items: [], total: 0, unhealthy: 0 },
  };
  await page.route(
    (url) => Object.hasOwn(served, url.pathname),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({ json: { data: served[pathname] } });
    },
  );
  await page.goto('/connectors');
  await page
    .getByRole('row')
    .filter({ has: page.locator('[data-directory-row="provider:acme_files"]') })
    .getByRole('button', { name: 'Connect', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Connect Acme files' });
  await expect(dialog.getByLabel('Alias')).toBeVisible();
  return dialog;
}

/**
 * Open the conversation route create dialog with every binding field drawn: the target
 * kind set to Agent and the door to Channel, so the agent and channel pickers, the
 * address field and the execution key show. The lists are the live skeleton's.
 */
export async function openRouteDialog(page: Page): Promise<Locator> {
  await page.goto('/conversations');
  await page.getByRole('button', { name: 'Create route' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create route' });
  for (const [name, option] of [
    ['Target kind', 'Agent'],
    ['Door', 'Channel'],
  ] as const) {
    await dialog.getByRole('combobox', { name, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }
  await expect(dialog.getByRole('combobox', { name: 'Channel', exact: true })).toBeVisible();
  return dialog;
}
