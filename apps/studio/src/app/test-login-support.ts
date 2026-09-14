/**
 * Shared fixtures for the login-screen tests: the common msw handlers, the
 * auth-header-capturing `GET` handlers, and the sample login-method payloads.
 */
import { http, HttpResponse } from 'msw';

export const okPlugins = http.get('*/api/plugins', () => HttpResponse.json({ data: [] }));
export const okToolTags = http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] }));

/** A `GET /api/tools` handler that records the auth header the shell attaches on
 * the first authenticated data request after sign-in. */
export function capturingTools(): {
  handler: ReturnType<typeof http.get>;
  header: () => string | null;
} {
  let seen: string | null = null;
  const handler = http.get('*/api/tools', ({ request }) => {
    seen = request.headers.get('x-api-key');
    return HttpResponse.json({ data: [] });
  });
  return { handler, header: () => seen };
}

export const EMPTY_METRICS = {
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

/** A `GET /api/observability/metrics` handler that records the auth header — the
 * Dashboard is the default post-login landing, so its metrics read is the first
 * authenticated data request when no explicit returnTo was given. */
export function capturingMetrics(): {
  handler: ReturnType<typeof http.get>;
  header: () => string | null;
} {
  let seen: string | null = null;
  const handler = http.get('*/api/observability/metrics', ({ request }) => {
    seen = request.headers.get('x-api-key');
    return HttpResponse.json({ data: EMPTY_METRICS });
  });
  return { handler, header: () => seen };
}

export function methods(payload: unknown): ReturnType<typeof http.get> {
  return http.get('*/api/login/methods', () => HttpResponse.json({ data: payload }));
}

export const passwordForm = {
  shape: 'form',
  id: 'password',
  title: 'Sign in',
  fields: [
    { name: 'email', label: 'Email', secret: false, autocomplete: 'email' },
    { name: 'password', label: 'Password', secret: true, autocomplete: 'current-password' },
  ],
  submit_path: '/api/login/password',
};
