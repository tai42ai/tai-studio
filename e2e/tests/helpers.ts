/**
 * Shared helpers for the live suites. The suites drive the Studio SERVED BY
 * THE SKELETON (the boot recipe) — real login, real server-injected import map,
 * real plugin bundles.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** The seeded, obviously test-only key (matches boot.sh's default). */
export const API_KEY = process.env.STUDIO_API_KEY ?? 'sk-e2e-DO-NOT-USE-IN-PRODUCTION-000';

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
 * Read the authed interactions SSE stream in the browser and resolve the
 * `interaction_id` of the pending question whose text equals `question`. Matching
 * on a UNIQUE question makes this robust against any stale backlog. Runs in-page so
 * it uses the same-origin credential path the app uses.
 */
export async function findInteractionId(
  page: Page,
  question: string,
  key: string = API_KEY,
): Promise<string> {
  const id = await page.evaluate(
    async ({ apiKey, target }) => {
      // Unique query token per open — identical concurrent SSE URLs coalesce
      // onto one connection in some engines (canonical constraint: the
      // api-client's sseOpenToken).
      const res = await fetch(`/api/interactions/stream?_=${Date.now().toString(36)}`, {
        headers: { 'x-api-key': apiKey, accept: 'text/event-stream' },
      });
      const reader = res.body?.getReader();
      if (reader === undefined) return null;
      const decoder = new TextDecoder();
      let buffer = '';
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let sep = buffer.indexOf('\n\n');
        while (sep >= 0) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
          if (dataLine !== undefined) {
            try {
              const obj = JSON.parse(dataLine.slice(6)) as {
                question?: unknown;
                interaction_id?: unknown;
              };
              if (obj.question === target && typeof obj.interaction_id === 'string') {
                await reader.cancel();
                return obj.interaction_id;
              }
            } catch {
              /* keepalive / non-JSON frame */
            }
          }
          sep = buffer.indexOf('\n\n');
        }
      }
      await reader.cancel();
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
