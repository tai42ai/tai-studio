import {
  ApiError,
  type MarketplaceInstalled,
  type MarketplaceInstallResult,
} from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PluginDetail } from './PluginDetail';
import {
  advisory,
  detailFixture,
  emptyAdvisories,
  installedRow,
  noop,
  pending,
  reads,
  renderWithProviders,
  type StubApiClient,
} from './test-utils';

describe('PluginDetail — install state', () => {
  it('offers Install when the plugin is not installed', async () => {
    const client = reads(detailFixture(), []);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });
    expect(await screen.findByRole('button', { name: 'Install' })).toBeInTheDocument();
  });

  it('shows the installed badge and Uninstall for an up-to-date install', async () => {
    const client = reads(detailFixture(), [installedRow()]);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    expect(await screen.findByText('Installed v1.2.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uninstall' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
  });

  it('offers Update with a badge when an update is available', async () => {
    const client = reads(detailFixture(), [
      installedRow({ update_available: true, latest: '2.0.0' }),
    ]);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    expect(await screen.findByText('Update available: v2.0.0')).toBeInTheDocument();
    // `←`/`→` are in NO shipped font subset, so a literal arrow paints in a
    // platform fallback face beside Inter. The icon set carries the mark instead.
    expect(document.body.textContent).not.toMatch(/[\u2190\u2192]/u);
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });

  it('renders the not-in-registry badge for a missing-upstream install', async () => {
    const client = reads(detailFixture(), [installedRow({ missing_upstream: true })]);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    expect(await screen.findByText('Not in the registry')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
  });

  it('shows no action buttons while the installed query is pending', async () => {
    const client: StubApiClient = {
      getMarketplacePlugin: vi.fn().mockResolvedValue(detailFixture()),
      listInstalledMarketplacePlugins: vi.fn(() => pending<MarketplaceInstalled>()),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(emptyAdvisories),
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    expect(await screen.findByText('Toolbox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Uninstall' })).toBeNull();
  });

  it('keeps the detail and shows an inline error when the installed query fails', async () => {
    const client: StubApiClient = {
      getMarketplacePlugin: vi.fn().mockResolvedValue(detailFixture()),
      listInstalledMarketplacePlugins: vi.fn().mockRejectedValue(new Error('boom: installed')),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(emptyAdvisories),
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    expect(await screen.findByText('Toolbox')).toBeInTheDocument();
    expect(await screen.findByText('boom: installed')).toBeInTheDocument();
  });
});

describe('PluginDetail — install flow', () => {
  it('installs behind a confirm dialog, shows the receipt, and invalidates the whole cache', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue({
      ref: 'tai42/toolbox',
      version: '1.2.0',
      notes: ['Selected as the OPENAI provider via OPENAI_API_KEY.'],
      advisories: [advisory({ id: 9, severity: 'medium', summary: 'Minor issue.' })],
      routes: [],
    });
    const client: StubApiClient = { ...reads(detailFixture(), []), installMarketplacePlugin };
    const { navigate: _n, queryClient } = renderWithProviders(
      <PluginDetail refValue="tai42/toolbox" onBack={noop} />,
      { client },
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({ ref: 'tai42/toolbox' });
    });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Installed tai42/toolbox 1.2.0');
    expect(status).toHaveTextContent('Selected as the OPENAI provider via OPENAI_API_KEY.');
    expect(status).toHaveTextContent('Minor issue.');
    expect(invalidate).toHaveBeenCalledWith();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables Install and shows the OFF note when the install store is not configured', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
          501,
          'marketplace-not-configured',
        ),
      );
    const client: StubApiClient = { ...reads(detailFixture(), []), installMarketplacePlugin };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    // The 501 surfaces the muted OFF note on the actions card (outside the dialog),
    // showing the server's message. The dialog carries its own note too, so scope to
    // the card.
    const cardNote = (await screen.findAllByTestId('feature-disabled')).find(
      (node) => !dialog.contains(node),
    );
    expect(cardNote).toBeDefined();
    expect(cardNote).toHaveTextContent(
      'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
    );

    // The actions-card Install button is disabled. `hidden: true` reaches it: while the
    // confirm dialog is open, Radix marks the page background aria-hidden, so the plain
    // accessibility-tree query would skip the (disabled) button behind the dialog.
    const outerInstall = screen
      .getAllByRole('button', { name: 'Install', hidden: true })
      .find((button) => !dialog.contains(button));
    expect(outerInstall).toBeDisabled();
  });

  it('shows the muted OFF note inside the install dialog — never a red alert — and blocks the confirm', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
          501,
          'marketplace-not-configured',
        ),
      );
    const client: StubApiClient = { ...reads(detailFixture(), []), installMarketplacePlugin };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    // The 501 renders the muted OFF note in the dialog body, showing the server's
    // message — and NO loud red ErrorState (role="alert") anywhere on the page.
    const note = await within(dialog).findByTestId('feature-disabled');
    expect(note).toHaveTextContent(
      'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
    );
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    // The confirm button can no longer re-fire the certain-to-refuse install.
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('disables the confirm button while the install is pending', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn(() => pending<MarketplaceInstallResult>());
    const client: StubApiClient = { ...reads(detailFixture(), []), installMarketplacePlugin };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: /Install/ })).toBeDisabled();
    });
  });

  it('surfaces an install rejection loudly inside the dialog', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockRejectedValue(new Error('boom: install'));
    const client: StubApiClient = { ...reads(detailFixture(), []), installMarketplacePlugin };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('boom: install');
  });
});

describe('PluginDetail — update and uninstall flows', () => {
  it('updates behind a confirm dialog with the correct body', async () => {
    const user = userEvent.setup();
    const updateMarketplacePlugin = vi.fn().mockResolvedValue({
      ref: 'tai42/toolbox',
      version: '2.0.0',
      notes: [],
      advisories: [],
      routes: [],
    });
    const client: StubApiClient = {
      ...reads(detailFixture(), [installedRow({ update_available: true, latest: '2.0.0' })]),
      updateMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Update' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(updateMarketplacePlugin).toHaveBeenCalledWith({ ref: 'tai42/toolbox' });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Updated tai42/toolbox 2.0.0');
  });

  it('the update confirm names re-fetching the descriptor, not pip, for a descriptor plugin', async () => {
    const user = userEvent.setup();
    const client = reads(
      detailFixture({
        package: null,
        latest: {
          version: '2.0.0',
          contract_range: '>=1.0',
          status: 'published',
          published_at: '2026-07-01T00:00:00Z',
          // No routes and no required_env → the plain update confirm path.
          items: [
            {
              kind: 'connector',
              name: 'relay',
              description: 'A hosted connector.',
              tags: [],
              group: null,
              required_env: [],
            },
          ],
        },
      }),
      [installedRow({ delivery: 'descriptor', update_available: true, latest: '2.0.0' })],
    );
    renderWithProviders(<PluginDetail refValue="iota/relay" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Update' }));
    const dialog = await screen.findByRole('dialog');
    // A descriptor names no package, so the update copy must not promise a pip install.
    expect(dialog).toHaveTextContent('The app will re-fetch the descriptor and reload.');
    expect(dialog).not.toHaveTextContent('pip-install');
  });

  it('uninstalls behind a confirm dialog with the correct body', async () => {
    const user = userEvent.setup();
    const uninstallMarketplacePlugin = vi
      .fn()
      .mockResolvedValue({ ref: 'tai42/toolbox', uninstalled: true, notes: ['Removed.'] });
    const client: StubApiClient = {
      ...reads(detailFixture(), [installedRow()]),
      uninstallMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Uninstall' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Uninstall' }));

    await waitFor(() => {
      expect(uninstallMarketplacePlugin).toHaveBeenCalledWith({ ref: 'tai42/toolbox' });
    });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Uninstalled tai42/toolbox');
    expect(status).toHaveTextContent('Removed.');
  });

  it('closes the dialog on cancel without calling the client', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn();
    const client: StubApiClient = { ...reads(detailFixture(), []), installMarketplacePlugin };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(installMarketplacePlugin).not.toHaveBeenCalled();
  });
});

describe('PluginDetail — install snippet', () => {
  function mockClipboard() {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return writeText;
  }

  it('shows a copy control for the install package that flips to Copied once', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    const client = reads(detailFixture({ package: 'tai42-toolbox' }), []);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await screen.findByText('Toolbox');
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    // The copy-flip spec, straight from the SDK CopyField: the package is written
    // and the button's visible face flips to "Copied".
    expect(writeText).toHaveBeenCalledWith('tai42-toolbox');
    expect(await screen.findByText('Copied')).toBeVisible();
  });
});

describe('PluginDetail — update store-off note and dialog cancels', () => {
  it('shows the muted OFF note in the update dialog when the install store is not configured', async () => {
    const user = userEvent.setup();
    const updateMarketplacePlugin = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
          501,
          'marketplace-not-configured',
        ),
      );
    const client: StubApiClient = {
      ...reads(detailFixture(), [installedRow({ update_available: true, latest: '2.0.0' })]),
      updateMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Update' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));

    const note = await within(dialog).findByTestId('feature-disabled');
    expect(note).toHaveTextContent(
      'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
    );
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('closes the update dialog on cancel without calling the client', async () => {
    const user = userEvent.setup();
    const updateMarketplacePlugin = vi.fn();
    const client: StubApiClient = {
      ...reads(detailFixture(), [installedRow({ update_available: true, latest: '2.0.0' })]),
      updateMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Update' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(updateMarketplacePlugin).not.toHaveBeenCalled();
  });

  it('closes the uninstall dialog on cancel without calling the client', async () => {
    const user = userEvent.setup();
    const uninstallMarketplacePlugin = vi.fn();
    const client: StubApiClient = {
      ...reads(detailFixture(), [installedRow()]),
      uninstallMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Uninstall' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(uninstallMarketplacePlugin).not.toHaveBeenCalled();
  });
});
