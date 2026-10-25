/**
 * Route stubs that put the Studio under a chosen session, for the suites that prove how
 * a form binds its execution key. The session is the live `GET /api/auth/me` answer with
 * the fields that decide the binding laid over it, so a case holds whatever identity the
 * boot signs in with; the api-key list and the one write a case makes are served here,
 * and every other request falls through to the live skeleton.
 */
import type { Page, Request } from '@playwright/test';

/** The projection fields a case lays over the live answer. */
type SessionFields = Readonly<Record<string, unknown>>;

/** The live projection's fields a session derives its overlay from. */
interface LiveSession {
  readonly user_id: string;
  readonly owner_user_id: string | null;
  readonly routes: readonly unknown[];
}

/** One `(path, methods)` reach entry of a scoped projection. */
export interface RouteReach {
  readonly path: string;
  readonly methods: readonly string[];
}

/** The owner a key session is bound to: the live owner claim, or one named after the key. */
function ownerOf(live: LiveSession): string {
  return live.owner_user_id ?? `${live.user_id}-owner`;
}

/** An access-checked key session: the boot's key with an owner claim, that owner its principal. */
export function keySession(live: LiveSession): SessionFields {
  const owner = ownerOf(live);
  return {
    access_control_enabled: true,
    owner_user_id: owner,
    principal: { user_id: owner, display_name: owner, kind: 'human' },
  };
}

/** An access-checked account session: no owner claim, the account itself the principal. */
export function accountSession(live: LiveSession): SessionFields {
  return {
    access_control_enabled: true,
    owner_user_id: null,
    principal: { user_id: live.user_id, display_name: live.user_id, kind: 'human' },
  };
}

/** A deployment with access control off: every session is the fill identity. */
export function gateOffSession(): SessionFields {
  return { access_control_enabled: false, user_id: '__no_auth__' };
}

/**
 * A non-admin key session named `userId`, owned by `owner`, that reaches the live routes
 * plus `reach` (a scoped session reaches only what its projection lists).
 */
export function scopedKeySession(
  userId: string,
  reach: readonly RouteReach[],
  owner = `${userId}-owner`,
): (live: LiveSession) => SessionFields {
  return (live) => ({
    access_control_enabled: true,
    admin: false,
    user_id: userId,
    owner_user_id: owner,
    principal: { user_id: owner, display_name: owner, kind: 'human' },
    routes: [...live.routes, ...reach],
  });
}

/**
 * Serve `GET /api/auth/me` as the live answer with `session(live)` laid over it. A live
 * answer that is not a projection fails the case loudly.
 */
export async function stubSession(
  page: Page,
  session: (live: LiveSession) => SessionFields,
): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/auth/me',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      if (!response.ok()) {
        throw new Error(`GET /api/auth/me answered ${String(response.status())}`);
      }
      const body = (await response.json()) as { data?: LiveSession };
      const live = body.data;
      if (live === undefined || typeof live.user_id !== 'string') {
        throw new Error(`GET /api/auth/me carried no projection: ${JSON.stringify(body)}`);
      }
      await route.fulfill({ response, json: { data: { ...live, ...session(live) } } });
    },
  );
}

/** Serve `GET /api/auth/tokens-payload`: the listed keys, or a refusal with its status. */
export async function stubKeyList(
  page: Page,
  answer:
    { readonly keys: readonly unknown[] } | { readonly status: number; readonly error: string },
): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/auth/tokens-payload',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      if ('keys' in answer) await route.fulfill({ json: { data: answer.keys } });
      else await route.fulfill({ status: answer.status, json: { error: answer.error } });
    },
  );
}

/** Serve a `GET` door with `data` in the success envelope, or a refusal with its status. */
export async function stubRead(
  page: Page,
  pathname: string,
  answer: { readonly data: unknown } | { readonly status: number; readonly error: string },
): Promise<void> {
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      if ('data' in answer) await route.fulfill({ json: { data: answer.data } });
      else await route.fulfill({ status: answer.status, json: { error: answer.error } });
    },
  );
}

/** Answer every `method` request whose path `matches` with `answer`: a success body in the
 * envelope, or a refusal with its status. */
export async function serveWrite(
  page: Page,
  method: string,
  matches: (pathname: string) => boolean,
  answer: { readonly data: unknown } | { readonly status: number; readonly error: string },
): Promise<void> {
  await page.route(
    (url) => matches(url.pathname),
    async (route) => {
      if (route.request().method() !== method) {
        await route.fallback();
        return;
      }
      if ('data' in answer) await route.fulfill({ json: { data: answer.data } });
      else await route.fulfill({ status: answer.status, json: { error: answer.error } });
    },
  );
}

/** The next `method` request whose path `matches`, so the case reads the body it carried. */
export function nextRequest(
  page: Page,
  method: string,
  matches: (pathname: string) => boolean,
): Promise<Request> {
  return page.waitForRequest(
    (request) => request.method() === method && matches(new URL(request.url()).pathname),
  );
}

/** The JSON body a write request carried. */
export function bodyOf(request: Request): Record<string, unknown> {
  return request.postDataJSON() as Record<string, unknown>;
}

/** The note the key picker shows when the api-key list read is refused. */
export const KEY_LIST_FORBIDDEN_NOTE =
  'This session cannot list api keys. Picking one needs read access to GET /api/auth/tokens-payload; ask an administrator to grant it.';

/** The note an account session reads over an empty api-key list. */
export const ACCOUNT_EMPTY_NOTE =
  'No api keys of yours are listed. You are signed in as an account, not an api key, so your own identity cannot be picked here. Mint a key on the settings API-keys tab first.';
