/**
 * Shared helpers for the live suites. The suites drive the Studio SERVED BY
 * THE SKELETON (the boot recipe) — real login, real server-injected import map,
 * real plugin bundles.
 */
import { expect, type Page } from '@playwright/test';

/** The seeded, obviously test-only key (matches boot.sh's default). */
export const API_KEY = process.env.STUDIO_API_KEY ?? 'sk-e2e-DO-NOT-USE-IN-PRODUCTION-000';

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
  await page.waitForURL('**/tools');
}

/** The loud plugin/registry error card is an `alert` role carrying this copy. */
export async function expectPluginErrorCard(page: Page, contains: RegExp): Promise<void> {
  const alert = page.getByRole('alert').filter({ hasText: contains });
  await expect(alert).toBeVisible();
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
      const res = await fetch('/api/interactions/stream', {
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
