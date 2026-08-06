/**
 * Behavioural tests for the installed tab: the tri-state installed list, the
 * per-row update / up-to-date / not-in-registry status badges, the loud
 * quarantined-plugin error cards, the "Upgrade all" action and its per-plugin
 * outcome readout, the advisories banner that appears only when an advisory
 * matches an installed plugin (and links to the detail), the advisory-failure
 * fallback that keeps the table, and the table pane's keyboard reachability
 * once it outruns its column.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { flushResizeObservers, setElementOverflow } from '@tai42/studio-sdk/testing';

import {
  ApiError,
  type MarketplaceAdvisory,
  type MarketplaceInstalled,
  type MarketplaceInstalledPlugin,
  type MarketplaceQuarantinedPlugin,
} from '@tai42/api-client';

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
    incompatible_newer: null,
    missing_upstream: false,
    compat: { status: 'compatible', reason: null },
    ...overrides,
  };
}

/** The installed-listing envelope: rows plus the boot-quarantine list. */
function installedList(
  plugins: MarketplaceInstalledPlugin[],
  quarantined: MarketplaceQuarantinedPlugin[] = [],
): MarketplaceInstalled {
  return { installed: plugins, quarantined };
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
      listInstalledMarketplacePlugins: vi.fn(() => pending<MarketplaceInstalled>()),
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
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([])),
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
        .mockResolvedValue(
          installedList([
            installedRow({ ref: 'tai42/toolbox', update_available: true, latest: '2.0.0' }),
            installedRow({ ref: 'tai42/stable' }),
            installedRow({ ref: 'tai42/gone', missing_upstream: true }),
          ]),
        ),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    expect(await screen.findByText('Update available: v2.0.0')).toBeInTheDocument();
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    // `←`/`→` are in NO shipped font subset, so a literal arrow paints in a
    // platform fallback face beside Inter. The icon set carries the mark instead.
    expect(document.body.textContent).not.toMatch(/[\u2190\u2192]/u);
    expect(screen.getByText('Up to date')).toBeInTheDocument();
    expect(screen.getByText('Not in the registry')).toBeInTheDocument();
  });
});

describe('InstalledTab — advisories banner', () => {
  it('shows the banner only when an advisory matches an installed plugin', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([installedRow({})])),
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
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([installedRow({})])),
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
        .mockResolvedValue(installedList([installedRow({}), installedRow({ ref: 'tai42/other' })])),
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
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([installedRow({})])),
      getMarketplaceAdvisories: vi.fn().mockRejectedValue(new Error('boom: advisories')),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    expect(await screen.findByRole('table')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: advisories');
  });
});

describe('InstalledTab — quarantined plugins', () => {
  it('renders one loud error card per quarantined plugin, with reason and remedy', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(
        installedList(
          [installedRow({})],
          [
            { name: 'tai42-broken', reason: 'requires tai42-contract<0.2; running 0.2.0' },
            { name: 'tai42-shattered', reason: 'import raised ModuleNotFoundError' },
          ],
        ),
      ),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('tai42-broken');
    expect(alerts[0]).toHaveTextContent('requires tai42-contract<0.2; running 0.2.0');
    expect(alerts[1]).toHaveTextContent('tai42-shattered');
    // The remedy stands beside each card, naming the action that fixes it.
    expect(screen.getAllByText(/newest compatible version/)).toHaveLength(2);
    // The table of healthy rows survives alongside the cards.
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows the cards instead of the empty state when everything is quarantined', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi
        .fn()
        .mockResolvedValue(
          installedList([], [{ name: 'tai42-broken', reason: 'incompatible with 0.2.0' }]),
        ),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('tai42-broken');
    expect(screen.queryByText('No marketplace plugins installed')).toBeNull();
    // The remedy action is present even with no healthy rows to table.
    expect(screen.getByRole('button', { name: 'Upgrade all' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('InstalledTab — upgrade all', () => {
  it('runs the upgrade, renders the per-plugin readout, and refetches server state', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([installedRow({})])),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
      upgradeAllMarketplacePlugins: vi.fn().mockResolvedValue({
        results: [
          { ref: 'tai42/toolbox', outcome: 'upgraded', detail: '1.0.0 -> 2.0.0' },
          {
            ref: 'tai42/stable',
            outcome: 'up-to-date',
            detail: '1.0.0 is the latest compatible version',
          },
          { ref: 'tai42/orphan', outcome: 'no-compatible-version', detail: 'newest is 9.0.0' },
          { ref: 'tai42/flaky', outcome: 'failed', detail: 'pip install failed' },
        ],
      }),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Upgrade all' }));

    expect(await screen.findByText('Upgrade results')).toBeInTheDocument();
    expect(client.upgradeAllMarketplacePlugins).toHaveBeenCalledTimes(1);
    expect(screen.getByText('upgraded')).toBeInTheDocument();
    expect(screen.getByText('up-to-date')).toBeInTheDocument();
    expect(screen.getByText('no-compatible-version')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('1.0.0 -> 2.0.0')).toBeInTheDocument();
    expect(screen.getByText('newest is 9.0.0')).toBeInTheDocument();
    // The app upgraded plugins and reloaded, so server-derived caches refetch.
    await waitFor(() => {
      expect(client.listInstalledMarketplacePlugins).toHaveBeenCalledTimes(2);
    });
  });

  it('shows a loud error when the upgrade run itself fails, keeping the table', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([installedRow({})])),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
      upgradeAllMarketplacePlugins: vi.fn().mockRejectedValue(new Error('boom: upgrade-all')),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Upgrade all' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: upgrade-all');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows the OFF note and disables Upgrade all when the install store is not configured', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([installedRow({})])),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(noAdvisories),
      upgradeAllMarketplacePlugins: vi
        .fn()
        .mockRejectedValue(
          new ApiError(
            'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
            501,
            'marketplace-not-configured',
          ),
        ),
    };
    renderWithProviders(<InstalledTab search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Upgrade all' }));

    // The 501 is the muted OFF note (the server's message), never a red error.
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
    expect(
      screen.getByText(
        'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upgrade all' })).toBeDisabled();
    });
    // The installed list stays — the 200-empty reads are untouched.
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('InstalledTab — the table pane is reachable without a pointer', () => {
  it('names the pane holding the table, and only while it actually scrolls', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([installedRow({})])),
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
