/**
 * Tests for the Connectors page shell: the providers + connections sections in
 * their loading / empty / error / populated states, and selecting a connection.
 */
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectorsPage } from './connectors-page';
import { connection, makeClient, provider, renderWithProviders } from './test-utils';

describe('ConnectorsPage — list', () => {
  it('renders providers and connections', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue([provider()]),
      listConnections: vi.fn().mockResolvedValue({ items: [connection()], total: 1 }),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Connectors' })).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
  });

  it('shows empty states when both lists are empty', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue([]),
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

  it('routes to the detail view when a connection search param is set', async () => {
    const client = makeClient({
      getConnection: vi.fn().mockResolvedValue(connection({ alias: 'detail-alias' })),
      listProviders: vi.fn().mockResolvedValue([provider()]),
    });
    renderWithProviders(<ConnectorsPage search={{ connection: 'conn-1' }} />, { client });

    await waitFor(() => {
      expect(screen.getByText('detail-alias')).toBeInTheDocument();
    });
  });
});
