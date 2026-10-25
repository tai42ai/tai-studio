/**
 * Helpers for the Connectors directory page tests: the page rendered against a quiet
 * client, the projections the directory's gates read, and lookups of one directory
 * entry in the card view or the list view.
 */
import { type ApiClient, apiRoutes, type MeProjection } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { ConnectorsPage } from './connectors-page';
import {
  fullProjection,
  makeClient,
  providerCatalog,
  renderWithProviders,
  type RenderWithProvidersResult,
  scopedProjection,
} from './test-utils';

type User = ReturnType<typeof userEvent.setup>;

/** The six directory reads' routes. */
export const READ_ROUTES = {
  providers: apiRoutes.get_api_connectors_providers.path,
  connections: apiRoutes.get_api_connectors_connections.path,
  manifest: apiRoutes.get_api_manifest_preserved.path,
  status: apiRoutes.get_api_mcp_status.path,
  installed: apiRoutes.get_api_marketplace_installed.path,
  search: apiRoutes.get_api_marketplace_search.path,
} as const;

export const START_ROUTE = apiRoutes.post_api_connectors_connections_start.path;
export const RELOAD_ROUTE = apiRoutes.post_api_mcp_status_title_reload.path;

/**
 * A projection that is not full, reaching the named directory reads with `GET` and
 * the given write routes with `POST`.
 */
export function readerProjection(
  reads: readonly (keyof typeof READ_ROUTES)[],
  writes: readonly string[] = [],
): MeProjection {
  return scopedProjection({
    routes: [
      ...reads.map((read) => ({ path: READ_ROUTES[read], methods: ['GET'] })),
      ...writes.map((path) => ({ path, methods: ['POST'] })),
    ],
  });
}

/** Every directory read and the connect route, without the administrator's full reach. */
export function editorProjection(writes: readonly string[] = [START_ROUTE]): MeProjection {
  return readerProjection(
    ['providers', 'connections', 'manifest', 'status', 'installed', 'search'],
    writes,
  );
}

/** The page against a quiet client, as an administrator unless a projection is given. */
export function renderPage(
  overrides: Partial<ApiClient> = {},
  projection: MeProjection = fullProjection(),
): RenderWithProvidersResult & { client: ApiClient } {
  const client = makeClient({
    listProviders: vi.fn().mockResolvedValue(providerCatalog([])),
    listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    ...overrides,
  });
  return { ...renderWithProviders(<ConnectorsPage search={{}} />, { client, projection }), client };
}

/** Switches the directory to its card view. */
export async function showCards(user: User): Promise<void> {
  await user.click(await screen.findByRole('radio', { name: 'Card view' }));
}

function entryNode(key: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-directory-row="${key}"]`);
  if (node === null) throw new Error(`no directory entry ${key}`);
  return node;
}

/** The card of the directory entry keyed `key` (the card view). */
export async function findCard(key: string): Promise<HTMLElement> {
  return waitFor(() => {
    const card = entryNode(key).closest('.tai-card');
    if (!(card instanceof HTMLElement)) throw new Error(`no card for ${key}`);
    return card;
  });
}

/** The table row of the directory entry keyed `key` (the list view). */
export async function findRow(key: string): Promise<HTMLElement> {
  return waitFor(() => {
    const row = entryNode(key).closest('tr');
    if (row === null) throw new Error(`no row for ${key}`);
    return row;
  });
}

/** The directory entries on screen, by key. */
export function entryKeys(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-directory-row]'),
    (node) => node.dataset.directoryRow ?? '',
  );
}
