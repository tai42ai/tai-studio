/**
 * Shared fixtures for the capability-gated shell tests: a scoped `/api/auth/me`
 * projection builder, a `me` handler override, the common empty msw handlers, and the
 * "land authenticated on /interactions" helper the nav-inspecting tests build on.
 */
import { http, HttpResponse } from 'msw';
import type { MeProjection } from '@tai42/api-client';

import { renderStudio, server } from './test-harness';

/** A scoped (`admin: false`) projection reaching exactly the given concrete routes. */
export function scoped(paths: readonly string[]): MeProjection {
  return {
    user_id: 'u-scoped',
    owner_user_id: null,
    admin: false,
    scopes: [],
    routes: paths.map((path) => ({ path, methods: ['GET'] })),
    route_patterns: [],
    sub_mcp: [],
    tools: [],
    agents: [],
    mintable: false,
  };
}

/** Serve a specific `/api/auth/me` projection (overrides the harness default). */
export function meHandler(projection: MeProjection): ReturnType<typeof http.get> {
  return http.get('*/api/auth/me', () => HttpResponse.json({ data: projection }));
}

export const okPlugins = http.get('*/api/plugins', () => HttpResponse.json({ data: [] }));
// The Interactions page mounts a channels-catalog card; an empty list satisfies the
// strict unhandled-request guard while the SSE stream (harness) stays empty.
export const okChannels = http.get('*/api/channels', () =>
  HttpResponse.json({ data: { channels: [] } }),
);

/** Land authenticated on `/interactions` (whose nav is what these tests inspect). */
export function landAuthed(): void {
  server.use(okPlugins, okChannels);
  renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });
}
