/**
 * Shared harness for the shell unit tests. It mounts the REAL composition root
 * (`createStudio`) — real router, real providers, real plugin loader — over a
 * memory history and an msw-mocked skeleton, so tests drive authentic routing,
 * auth, and plugin-load behavior rather than stubs.
 *
 * The interactions SSE stream is replaced with an inert async iterable: the
 * globally-mounted `InteractionsBadge` opens it, and none of these tests exercise
 * live interactions, so an empty stream keeps them from needing an SSE mock.
 */
import { StrictMode } from 'react';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import { createMemoryHistory } from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { setupServer, type SetupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { createApiClient, type ApiClient, type MeProjection } from '@tai42/api-client';

import { createStudio, type Studio } from './create-studio';
import type { ImportModule, LoadStylesheet } from './plugin-loader';

const SESSION_KEY = 'tai-studio.apiKey';

/**
 * A FULL capability projection (`admin: true`) — the unfiltered shell. It is the
 * default `/api/auth/me` answer so every authenticated render sees every surface;
 * tests that exercise a scoped session override it with `server.use(...)`.
 */
export const FULL_PROJECTION: MeProjection = {
  user_id: 'u-admin',
  owner_user_id: null,
  admin: true,
  scopes: ['*'],
  routes: [],
  route_patterns: [],
  sub_mcp: [],
  tools: [],
  agents: [],
  mintable: true,
};

/**
 * The default handlers passed into `setupServer`, so `server.resetHandlers()`
 * restores them between tests. Every unauthenticated render lands on `/login`,
 * which now fetches sign-in methods on mount; and every AUTHENTICATED render
 * fetches its capability projection from `/api/auth/me`. The strict
 * `onUnhandledRequest: 'error'` guard would fail the whole suite without both
 * defaults. An empty methods list is the "no accounts plugin ⇒ today's key-paste
 * screen" default, and a full projection is today's unfiltered nav; tests that
 * exercise either surface override them with `server.use(...)`.
 */
/**
 * A minimal-but-valid dashboard-metrics payload. Since the default landing route
 * (a bare returnTo) now resolves to the Dashboard, an authenticated render at `/`
 * navigates to `/observability`, whose Stats tab reads
 * `GET /api/observability/metrics` on mount; the strict `onUnhandledRequest`
 * guard would fail without a default answer here.
 */
const DASHBOARD_METRICS = {
  summary: {
    totalRuns: 0,
    totalCost: 0,
    totalTokens: 0,
    averageLatencyMs: 0,
    avgCostPerRun: 0,
    avgTokensPerRun: 0,
    timeToFirstTokenMs: null,
  },
  timeSeries: [],
  byModel: [],
  granularity: 'day',
};

const defaultHandlers = [
  http.get('*/api/login/methods', () =>
    HttpResponse.json({ data: { methods: [], bootstrap: false } }),
  ),
  http.get('*/api/auth/me', () => HttpResponse.json({ data: FULL_PROJECTION })),
  http.get('*/api/observability/metrics', () => HttpResponse.json({ data: DASHBOARD_METRICS })),
];

/** The msw server; tests register per-case handlers with `server.use(...)`. */
export const server: SetupServer = setupServer(...defaultHandlers);

/** Wire the msw lifecycle. Call once at the top level of a test file. */
export function installServer(): void {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });
  afterEach(() => {
    cleanup();
    server.resetHandlers();
    // Clear both web-storage areas between tests: sessionStorage holds a
    // "remembered" credential, and localStorage now holds the persisted theme
    // preference, so neither may leak into the next test.
    globalThis.sessionStorage.clear();
    globalThis.localStorage.clear();
  });
  afterAll(() => {
    server.close();
  });
}

async function* emptyStream(): AsyncGenerator<never> {
  // No frames; the badge simply shows nothing pending.
}

// jsdom's `AbortSignal` lives in a different realm than Node's undici `fetch`,
// which rejects it outright ("Expected signal to be an instance of
// AbortSignal"). Product code runs against a real browser `fetch` that accepts
// the browser-native signal; here we drop the signal before the mocked fetch
// sees it so signal-carrying requests (the login-methods discovery fetch, every
// TanStack Query fetch) run. These tests assert fetch RESULTS, not abort timing.
const stripSignalFetch: typeof fetch = (input, init) => {
  if (init && 'signal' in init) {
    const { signal: _signal, ...rest } = init;
    return fetch(input, rest);
  }
  return fetch(input, init);
};

export interface HarnessOptions {
  readonly initialPath?: string;
  /** Seed a "remembered" credential into sessionStorage before the shell mounts. */
  readonly sessionKey?: string | null;
  readonly importModule?: ImportModule;
  readonly loadStylesheet?: LoadStylesheet;
  /** Override the interactions SSE (defaults to an inert empty stream); a spy here
   * lets a test assert whether the badge opened the stream at all. */
  readonly streamInteractions?: ApiClient['streamInteractions'];
  /** Render under `<StrictMode>` so mount effects double-invoke — exercises the
   * single-use latches (SSO/claim exchange) against a remount. */
  readonly strictMode?: boolean;
}

export interface HarnessResult extends RenderResult {
  readonly studio: Studio;
}

export function makeStudio(options: HarnessOptions = {}): Studio {
  const streamInteractions =
    options.streamInteractions ??
    ((): Promise<AsyncGenerator<never>> => Promise.resolve(emptyStream()));
  const createClient = (getToken: () => string | null): ApiClient => {
    const base = createApiClient({ getToken, fetch: stripSignalFetch });
    return { ...base, streamInteractions };
  };
  return createStudio({
    createClient,
    importModule: options.importModule,
    loadStylesheet: options.loadStylesheet,
    history: createMemoryHistory({ initialEntries: [options.initialPath ?? '/'] }),
  });
}

export function renderStudio(options: HarnessOptions = {}): HarnessResult {
  if (typeof options.sessionKey === 'string') {
    globalThis.sessionStorage.setItem(SESSION_KEY, options.sessionKey);
  }
  const studio = makeStudio(options);
  const app = options.strictMode ? (
    <StrictMode>
      <studio.App />
    </StrictMode>
  ) : (
    <studio.App />
  );
  const result = render(app);
  return { ...result, studio };
}
