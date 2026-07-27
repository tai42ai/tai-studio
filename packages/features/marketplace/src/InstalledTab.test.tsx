/**
 * Behavioural tests for the installed tab: the tri-state installed list, the
 * per-row update / up-to-date / not-in-registry status badges, the advisories
 * banner that appears only when an advisory matches an installed plugin (and
 * links to the detail), the advisory-failure fallback that keeps the table, and
 * the table pane's keyboard reachability once it outruns its column.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { flushResizeObservers, setElementOverflow } from '@tai42/studio-sdk/testing';

import type { MarketplaceAdvisory, MarketplaceInstalledPlugin } from '@tai42/api-client';

import { InstalledTab } from './InstalledTab';
import { renderWithProviders, type StubApiClient } from './test-utils';

function installedRow(overrides: Partial<MarketplaceInstalledPlugin>): MarketplaceInstalledPlugin {
  return {
    ref: 'tai42/toolbox',
    version: '1.0.0',
    source: 'marketplace',
    installed_at: '2026-07-01T00:00:00Z',
    latest: null,
    update_available: false,
    missing_upstream: false,
    ...overrides,
  };
}

function advisory(overrides: Partial<MarketplaceAdvisory>): MarketplaceAdvisory {
  return {
    id: 1,
    listing: 'tai42/toolbox',
    affected_versions: '<1.0.0',
    severity: 'high',
    summary: 'Path traversal in the file tool.',
    created_at: '2026-07-01T00:00:00Z',
    withdrawn_at: null,
    ...overrides,
  };
}

const noAdvisories = { advisories: [], fetched_at: '2026-07-10T00:00:00Z' };

/** A promise that never settles, for exercising the pending branch. */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

describe('InstalledTab — tri-state', () => {
  it('shows no table while the installed list is pending', () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn(() => pending<MarketplaceInstalledPlugin[]>()),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
    };
    const { container } = renderWithProviders(<InstalledTab search={{}} />, { client });
    expect(container.querySelector('table')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a loud error with retry when the installed list fails', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockRejectedValue(new Error('boom: installed')),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: installed');
    const retry = within(alert).getByRole('button', { name: 'Retry' });
    await userEvent.click(retry);
    await waitFor(() => {
      expect(client.listInstalledMarketplacePlugins).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the empty state when nothing is installed', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue([]),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });
    expect(await screen.findByText('No marketplace plugins installed')).toBeInTheDocument();
  });
});

describe('InstalledTab — status badges', () => {
  it('renders update-available, up-to-date, and not-in-registry badges', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi
        .fn()
        .mockResolvedValue([
          installedRow({ ref: 'tai42/toolbox', update_available: true, latest: '2.0.0' }),
          installedRow({ ref: 'tai42/stable' }),
          installedRow({ ref: 'tai42/gone', missing_upstream: true }),
        ]),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    expect(await screen.findByText('Update available → v2.0.0')).toBeInTheDocument();
    expect(screen.getByText('Up to date')).toBeInTheDocument();
    expect(screen.getByText('Not in the registry')).toBeInTheDocument();
  });
});

describe('InstalledTab — advisories banner', () => {
  it('shows the banner only when an advisory matches an installed plugin', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue([installedRow({})]),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue({
        advisories: [advisory({ listing: 'other/thing' })],
        fetched_at: '2026-07-10T00:00:00Z',
      }),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    await screen.findByRole('table');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the banner and links each ref to the detail', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue([installedRow({})]),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue({
        advisories: [advisory({})],
        fetched_at: '2026-07-10T00:00:00Z',
      }),
    };
    const { navigate } = renderWithProviders(<InstalledTab search={{ tab: 'installed' }} />, {
      client,
    });

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('1 security advisory affects installed plugins');
    expect(banner).toHaveTextContent('Path traversal in the file tool.');

    await user.click(within(banner).getByRole('link', { name: 'tai42/toolbox' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', {
      tab: 'installed',
      plugin: 'tai42/toolbox',
    });
  });

  it('pluralizes the banner heading for multiple advisories', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi
        .fn()
        .mockResolvedValue([installedRow({}), installedRow({ ref: 'tai42/other' })]),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue({
        advisories: [advisory({ id: 1 }), advisory({ id: 2, listing: 'tai42/other' })],
        fetched_at: '2026-07-10T00:00:00Z',
      }),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('2 security advisories affect installed plugins');
  });

  it('keeps the table and shows an inline error when advisories fail', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue([installedRow({})]),
      getMarketplaceAdvisories: vi.fn().mockRejectedValue(new Error('boom: advisories')),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    expect(await screen.findByRole('table')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: advisories');
  });
});

describe('InstalledTab — the table pane is reachable without a pointer', () => {
  it('names the pane holding the table, and only while it actually scrolls', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue([installedRow({})]),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    // The pane is located through the table it holds, not through a class, so
    // this fails on a pane that is measured by nothing rather than on a rename.
    const pane = (await screen.findByRole('table')).parentElement;
    if (pane === null) throw new Error('the table has no containing pane');

    setElementOverflow(pane, false);
    act(() => {
      flushResizeObservers();
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(pane).not.toHaveAttribute('tabindex');

    setElementOverflow(pane, true);
    act(() => {
      flushResizeObservers();
    });
    expect(screen.getByRole('region', { name: 'Installed plugins' })).toBe(pane);
    expect(pane).toHaveAttribute('tabindex', '0');
  });
});
