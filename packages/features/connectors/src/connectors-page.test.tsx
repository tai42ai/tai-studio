/**
 * Tests for the Connectors page shell: the providers + connections sections in
 * their loading / empty / error / populated states, the category grouping and
 * per-provider connection state, selecting a connection, and completing a
 * popup-blocked redirect flow on arrival.
 */
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectorsPage } from './connectors-page';
import { OAUTH_RESUME_PARAMS } from './oauth';
import {
  category,
  connection,
  makeClient,
  provider,
  providerCatalog,
  renderWithProviders,
} from './test-utils';

describe('ConnectorsPage — list', () => {
  it('renders providers (under their category) and connections', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
      listConnections: vi.fn().mockResolvedValue({ items: [connection()], total: 1 }),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Connectors' })).toBeInTheDocument();
    // The category grouping renders its label as a subheading.
    expect(screen.getByRole('heading', { level: 3, name: 'Developer tools' })).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
  });

  it('groups providers under the categories from the catalog, ordered by sort_order', async () => {
    const client = makeClient({
      listProviders: vi
        .fn()
        .mockResolvedValue(
          providerCatalog(
            [
              provider({ id: 'github', display_name: 'GitHub', category: 'dev' }),
              provider({ id: 'slack', display_name: 'Slack', category: 'chat', sub_services: [] }),
            ],
            [
              category({ id: 'chat', display_name: 'Chat', sort_order: 0 }),
              category({ id: 'dev', display_name: 'Developer tools', sort_order: 1 }),
            ],
          ),
        ),
      listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Chat' })).toBeInTheDocument();
    });
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // sort_order puts Chat before Developer tools.
    expect(headings).toEqual(['Chat', 'Developer tools']);
  });

  it('renders a provider icon when icon_url is set', async () => {
    const { container } = renderWithProviders(<ConnectorsPage search={{}} />, {
      client: makeClient({
        listProviders: vi
          .fn()
          .mockResolvedValue(
            providerCatalog([provider({ icon_url: 'https://cdn.example/gh.png' })]),
          ),
        listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    expect(container.querySelector('img[src="https://cdn.example/gh.png"]')).not.toBeNull();
  });

  it('shows Connect for a provider with no connections', async () => {
    renderWithProviders(<ConnectorsPage search={{}} />, {
      client: makeClient({
        listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
        listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add another account' })).toBeNull();
  });

  it('shows the connected count and Add another account when a provider has connections', async () => {
    renderWithProviders(<ConnectorsPage search={{}} />, {
      client: makeClient({
        listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
        listConnections: vi.fn().mockResolvedValue({
          items: [
            connection({ connection_id: 'a', auth_health_state: 'healthy' }),
            connection({ connection_id: 'b', auth_health_state: 'reconnect_required' }),
          ],
          total: 2,
        }),
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('2 connected')).toBeInTheDocument();
    });
    // Any unhealthy account raises the needs-attention badge on the provider card.
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add another account' })).toBeInTheDocument();
  });

  it('shows empty states when both lists are empty', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([], [])),
      listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('No connectors installed')).toBeInTheDocument();
    });
    expect(screen.getByText('No connections yet')).toBeInTheDocument();
    // Both empty states point at the marketplace (one per section).
    expect(screen.getAllByRole('link', { name: 'Browse marketplace' })).toHaveLength(2);
  });

  it('renders the connections empty-state prose (not an error) when the store is off', async () => {
    // The connectors gate stays on via registered providers, but the token store is
    // unconfigured, so `listConnections` answers 200-empty (never a 500/501). The
    // already-written empty-state prose must render — never a loud ErrorState.
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
      listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('No connections yet')).toBeInTheDocument();
    });
    // With providers present the copy nudges to connect above, and there is no error.
    expect(screen.getByText('Connect a provider above to get started.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a loud error state when a list request fails', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockRejectedValue(new Error('providers boom')),
      listConnections: vi.fn().mockRejectedValue(new Error('connections boom')),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('providers boom')).toBeInTheDocument();
    });
    expect(screen.getByText('connections boom')).toBeInTheDocument();
  });

  it('flags connection state as unavailable on provider cards when the connections list fails', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
      listConnections: vi.fn().mockRejectedValue(new Error('connections boom')),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    // The card must not fall back to a healthy zero-connections read: no Connect-only
    // affordance implying "not connected", surfacing the unknown state instead.
    expect(screen.getByText('Connection state unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Needs attention')).toBeNull();
    // The connections section still surfaces the failure loudly.
    expect(screen.getByText('connections boom')).toBeInTheDocument();
  });

  it('routes to the detail view when a connection search param is set', async () => {
    const client = makeClient({
      getConnection: vi.fn().mockResolvedValue(connection({ alias: 'detail-alias' })),
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
    });
    renderWithProviders(<ConnectorsPage search={{ connection: 'conn-1' }} />, { client });

    await waitFor(() => {
      expect(screen.getByText('detail-alias')).toBeInTheDocument();
    });
  });
});

describe('ConnectorsPage — redirect-flow resume', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('completes the exchange when the page loads with the forwarded params', async () => {
    window.history.replaceState(
      null,
      '',
      `/connectors?${OAUTH_RESUME_PARAMS.state}=st&${OAUTH_RESUME_PARAMS.code}=cd`,
    );
    const completeOAuth = vi.fn().mockResolvedValue({
      kind: 'success',
      connection_id: 'c1',
      return_url: '/connectors',
      fanout: null,
    });
    renderWithProviders(<ConnectorsPage search={{}} />, {
      client: makeClient({
        completeOAuth,
        listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
        listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      }),
    });

    await waitFor(() => {
      expect(completeOAuth).toHaveBeenCalledWith('st', 'cd', undefined);
    });
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });
});
