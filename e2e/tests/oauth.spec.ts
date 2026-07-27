/**
 * OAuth callback + bridge surfaces, against the LIVE boot skeleton (which
 * serves the static pages with the security headers).
 *
 * Pins:
 *  - both pages are BYTE-CONSTANT — no request data is reflected into the served
 *    html/js (the zero-reflection discipline);
 *  - the callback posts to the opener with targetOrigin = the app-origin LITERAL
 *    (never "*") and refuses an opener that is not same-origin;
 *  - the standalone bridge's anchored allow-list REFUSES `eviltai42.ai` and
 *    `tai42.ai.evil.com` style targets;
 *  - the standalone bridge artifact is directory-self-contained (CI check).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const distBridgeDir = resolve(here, '../../apps/studio/dist/bridge');

/** Build a skeleton-shaped OAuth `state`: base64url(json({f,o})) + "." + hmac. The
 * bridge reads `o` WITHOUT verifying the hmac, so the signature is a placeholder. */
function craftState(origin: string): string {
  const payload = Buffer.from(JSON.stringify({ f: 'flow-1', o: origin })).toString('base64url');
  return `${payload}.deadbeefsignatureplaceholder`;
}

async function bodyOf(page: Page, path: string): Promise<string> {
  const res = await page.request.get(path);
  expect(res.status()).toBe(200);
  return res.text();
}

test('the callback + bridge pages are byte-constant (no request-data reflection)', async ({
  page,
}) => {
  for (const path of [
    '/oauth-callback.html',
    '/oauth-callback.js',
    '/oauth-bridge.html',
    '/oauth-bridge.js',
  ]) {
    const a = await bodyOf(page, `${path}?code=REFLECT_A&state=STATE_A`);
    const b = await bodyOf(page, `${path}?code=REFLECT_B&state=STATE_B`);
    expect(a).toBe(b);
    expect(a).not.toContain('REFLECT_A');
    expect(a).not.toContain('STATE_A');
  }
});

test('EVERY postMessage in the callback JS targets the OWN-ORIGIN literal, and the opener origin is checked', async ({
  page,
}) => {
  const js = await bodyOf(page, '/oauth-callback.js');

  // The call sites are read OUT OF the served bytes, so the pin does not rest on
  // one spelling of one payload variable: a renamed argument, a second call added
  // beside the first, or a wildcard written any other way all have to satisfy it.
  const calls = [...js.matchAll(/\bpostMessage\s*\(([^()]*)\)/g)].map((match) => match[1] ?? '');
  const callSites = js.match(/\bpostMessage\s*\(/g) ?? [];
  expect(calls.length).toBeGreaterThan(0);
  // A call whose arguments this reader cannot parse (a nested call, an inline
  // function) leaves the two counts apart — fail loudly rather than skip it.
  expect(calls).toHaveLength(callSites.length);
  for (const args of calls) {
    // The targetOrigin is the LAST argument; with no comma at all the whole
    // argument list is compared and fails, which is the right direction.
    const targetOrigin = args.slice(args.lastIndexOf(',') + 1).trim();
    expect(targetOrigin).toBe('window.location.origin');
  }

  // Defense in depth: the opener's origin is validated before the dispatch.
  expect(js).toContain('opener.location.origin');
});

test('a same-origin opener receives the callback message; a direct open (no opener) is refused', async ({
  page,
}) => {
  // Opener page (same origin as the callback).
  await page.goto('/login');
  const message = await page.evaluate(async () => {
    return await new Promise<Record<string, unknown>>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('no message received'));
      }, 5000);
      window.addEventListener(
        'message',
        (event: MessageEvent) => {
          if (
            event.origin === window.location.origin &&
            typeof event.data === 'object' &&
            event.data !== null &&
            (event.data as { type?: unknown }).type === 'tai:oauth:callback'
          ) {
            clearTimeout(timer);
            resolvePromise(event.data as Record<string, unknown>);
          }
        },
        false,
      );
      window.open('/oauth-callback.html?code=abc123&state=xyz789', 'cb', 'popup');
    });
  });
  expect(message.code).toBe('abc123');
  expect(message.state).toBe('xyz789');

  // Direct open (no opener): the page must NOT throw and must surface a plain
  // status — it never posts a credential into the void.
  const direct = await page.context().newPage();
  await direct.goto('/oauth-callback.html?code=abc&state=xyz');
  await expect(direct.locator('#status')).toContainText(/close this window|complete/i);
  await direct.close();
});

test('the SPA-shipped bridge refuses a target that is not its exact own origin', async ({
  page,
}) => {
  const evilState = craftState('https://eviltai42.ai');
  await page.goto(`/oauth-bridge.html?state=${encodeURIComponent(evilState)}&code=leaked`);
  // Refused: it stays on the bridge page (no open redirect) and shows the notice.
  await expect(page).toHaveURL(/\/oauth-bridge\.html/);
  await expect(page.locator('#status')).toContainText(/invalid|different deployment/i);
});

test('the standalone bridge anchored allow-list refuses eviltai42.ai and tai42.ai.evil.com', async ({
  page,
}) => {
  for (const evil of ['https://eviltai42.ai', 'https://tai42.ai.evil.com', 'http://sub.tai42.ai']) {
    const state = craftState(evil);
    await page.goto(`/bridge/oauth-bridge.html?state=${encodeURIComponent(state)}&code=leaked`);
    // The anchored `^<slug>.tai42.ai$` https-only allow-list rejects each — the
    // page stays put (no open redirect carrying the code) and shows the notice.
    await expect(page).toHaveURL(/\/bridge\/oauth-bridge\.html/);
    await expect(page.locator('#status')).toContainText(/invalid|unrecognized deployment/i);
  }
});

test('the standalone bridge artifact is directory-self-contained (CI check)', () => {
  const html = readFileSync(resolve(distBridgeDir, 'oauth-bridge.html'), 'utf8');
  // Every referenced asset is relative to the bridge dir (base './') — no absolute
  // path, no external host, so the directory can be deployed on its own.
  const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? '');
  expect(srcs.length).toBeGreaterThan(0);
  for (const src of srcs) {
    expect(src.startsWith('http://')).toBe(false);
    expect(src.startsWith('https://')).toBe(false);
    expect(src.startsWith('//')).toBe(false);
    expect(src.startsWith('/')).toBe(false);
  }
});
