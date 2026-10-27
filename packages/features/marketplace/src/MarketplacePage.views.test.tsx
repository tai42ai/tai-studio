/**
 * The list/card switch on both Marketplace tabs: Browse opens on the card grid and
 * Installed on the table, each switches to the other layout, the choice survives a
 * remount, and in every layout the whole entry opens the plugin detail while the
 * server-paged "Load more" keeps appending to the chosen layout.
 */
import type {
  MarketplaceInstalled,
  MarketplaceInstalledPlugin,
  MarketplaceSearchQuery,
} from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InstalledTab } from './InstalledTab';
import { MarketplacePage } from './MarketplacePage';
import {
  browseReads,
  renderWithProviders,
  searchPage,
  searchRow,
  type StubApiClient,
} from './test-utils';

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe('Marketplace Browse — list/card switch', () => {
  it('opens on the card grid, one card per listing', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });

    const grid = await screen.findByRole('list', { name: 'Plugins' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1);
    expect(within(grid).getByRole('link', { name: 'Toolbox' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Card view' })).toBeChecked();
  });

  it('switches to a table of listings and remembers the choice', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow({ downloads: 1234, latest_version: '1.2.0' })])),
    });

    await user.click(await screen.findByRole('radio', { name: 'List view' }));
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Downloads' })).toBeInTheDocument();
    const row = within(table).getByRole('row', { name: /Toolbox/ });
    expect(within(row).getByText('1234')).toBeInTheDocument();
    expect(within(row).getByText('1.2.0')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Plugins' })).toBeNull();

    first.unmount();
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'List view' })).toBeChecked();
  });

  it('opens the detail from a click anywhere on a table row', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{ q: 'box' }} />, {
      client: browseReads(searchPage([searchRow()])),
    });

    await user.click(await screen.findByRole('radio', { name: 'List view' }));
    await user.click(screen.getByText('A box of tools.'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('marketplace', { q: 'box', plugin: 'tai42/toolbox' });
  });

  it('appends the next server page to the table on Load more', async () => {
    const user = userEvent.setup();
    const searchMarketplace = vi.fn((query?: MarketplaceSearchQuery) =>
      Promise.resolve(
        query?.page === 2
          ? searchPage(
              [searchRow({ ref: 'other/plugin', name: 'plugin', display_name: 'Other' })],
              {
                total: 2,
                page: 2,
                page_size: 1,
              },
            )
          : searchPage([searchRow()], { total: 2, page: 1, page_size: 1 }),
      ),
    );
    const client: StubApiClient = { ...browseReads(searchPage([])), searchMarketplace };
    renderWithProviders(<MarketplacePage search={{}} />, { client });

    await user.click(await screen.findByRole('radio', { name: 'List view' }));
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(screen.getByRole('row', { name: /Other/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('row', { name: /Toolbox/ })).toBeInTheDocument();
    expect(searchMarketplace).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.anything(),
    );
  });
});

function installedRow(overrides: Partial<MarketplaceInstalledPlugin>): MarketplaceInstalledPlugin {
  return {
    ref: 'tai42/toolbox',
    version: '1.0.0',
    source: 'github',
    delivery: 'package',
    installed_at: '2026-07-01T00:00:00Z',
    latest: null,
    update_available: false,
    incompatible_newer: null,
    missing_upstream: false,
    compat: { status: 'compatible', reason: null },
    items: [],
    route_mounts: {},
    ...overrides,
  };
}

function installedReads(plugins: MarketplaceInstalledPlugin[]): StubApiClient {
  const installed: MarketplaceInstalled = { installed: plugins };
  return {
    listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installed),
    getMarketplaceAdvisories: vi
      .fn()
      .mockResolvedValue({ advisories: [], fetched_at: '2026-07-10T00:00:00Z' }),
  };
}

describe('Marketplace Installed — list/card switch', () => {
  it('opens on the table and switches to a card per installed plugin', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstalledTab search={{}} />, {
      client: installedReads([
        installedRow({}),
        installedRow({ ref: 'acme/relay', latest: '2.0.0', update_available: true }),
      ]),
    });

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'List view' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Card view' }));
    const grid = screen.getByRole('list', { name: 'Installed plugins' });
    const cards = within(grid).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    const relay = cards[1];
    if (relay === undefined) throw new Error('no card for the second installed plugin');
    expect(within(relay).getByRole('link', { name: 'acme/relay' })).toBeInTheDocument();
    expect(within(relay).getByText('Update available: v2.0.0')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('remembers the card choice and opens the detail from a card body', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<InstalledTab search={{}} />, {
      client: installedReads([installedRow({})]),
    });
    await user.click(await screen.findByRole('radio', { name: 'Card view' }));
    first.unmount();

    const { navigate } = renderWithProviders(<InstalledTab search={{ tab: 'installed' }} />, {
      client: installedReads([installedRow({})]),
    });
    const grid = await screen.findByRole('list', { name: 'Installed plugins' });
    await user.click(within(grid).getByText('Up to date'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('marketplace', {
      tab: 'installed',
      plugin: 'tai42/toolbox',
    });
  });
});
