/**
 * The plugin install in place and in a dialog: a plugin with no route-carrying item
 * previews once and shows the plain confirm (wording by delivery) or collects the
 * env the preview names; the submit stays blocked while the preview loads or after
 * it failed; a failed install renders in the frame, a store-off refusal as the muted
 * note; a plugin with routes installs through the mount form.
 */
import type { MarketplaceInstallPreview, MarketplacePluginDetail } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PluginInstallDialog, PluginInstallPanel } from './plugin-install';
import {
  installReceipt,
  noop,
  pending,
  previewFixture,
  renderWithApi,
  storeOffError,
} from './test-install-fixtures';

function detail(overrides: Partial<MarketplacePluginDetail> = {}): MarketplacePluginDetail {
  return {
    namespace: 'acme',
    name: 'relay',
    display_name: 'Relay',
    icon_url: null,
    package: 'acme-relay',
    source: 'pypi',
    description: 'A relay.',
    readme_md: null,
    license: 'Apache-2.0',
    homepage_url: null,
    repository_url: null,
    categories: [],
    tags: [],
    trust_tier: 'community',
    pricing: 'free',
    premium: false,
    downloads: 0,
    latest: {
      version: '1.0.0',
      contract_range: '>=1.0',
      status: 'published',
      published_at: '2026-07-01T00:00:00Z',
      items: [{ kind: 'mcp-server', name: 'relay', description: '', tags: [], group: null }],
    },
    versions: [],
    ...overrides,
  };
}

/** A non-route preview: no items, only the env picture. */
function envPreview(
  missing: string[],
  required: { name: string; secret: boolean }[] = [],
): MarketplaceInstallPreview {
  return previewFixture({ items: [], required_env: required, missing_env: missing });
}

describe('PluginInstallPanel — a plugin with no routes', () => {
  it('previews once and shows the plain confirm for a packaged plugin', async () => {
    const user = userEvent.setup();
    const receipt = installReceipt();
    const previewMarketplaceInstall = vi.fn().mockResolvedValue(envPreview([]));
    const installMarketplacePlugin = vi.fn().mockResolvedValue(receipt);
    const onInstalled = vi.fn();
    renderWithApi(
      <PluginInstallPanel
        refValue="acme/relay"
        version="1.0.0"
        detail={detail()}
        onInstalled={onInstalled}
        onDismiss={noop}
      />,
      { previewMarketplaceInstall, installMarketplacePlugin },
    );

    const form = screen.getByRole('form', { name: 'Install plugin' });
    expect(
      await within(form).findByText(/The app will pip-install the package and reload\./),
    ).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(onInstalled).toHaveBeenCalledWith(receipt);
    });
    expect(installMarketplacePlugin).toHaveBeenCalledWith({ ref: 'acme/relay' });
    expect(previewMarketplaceInstall).toHaveBeenCalledTimes(1);
    expect(previewMarketplaceInstall).toHaveBeenCalledWith(
      { ref: 'acme/relay', version: '1.0.0' },
      expect.anything(),
    );
  });

  it('words the confirm for a descriptor plugin', async () => {
    renderWithApi(
      <PluginInstallPanel
        refValue="acme/relay"
        version={null}
        detail={detail({ package: null })}
        onInstalled={noop}
        onDismiss={noop}
      />,
      { previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreview([])) },
    );
    expect(
      await screen.findByText(/The app will register this plugin and reload\./),
    ).toBeInTheDocument();
  });

  it('blocks the submit while the preview loads', () => {
    renderWithApi(
      <PluginInstallPanel
        refValue="acme/relay"
        version="1.0.0"
        detail={detail()}
        onInstalled={noop}
        onDismiss={noop}
      />,
      { previewMarketplaceInstall: vi.fn(() => pending<MarketplaceInstallPreview>()) },
    );
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('blocks the submit and shows the failure when the preview fails', async () => {
    renderWithApi(
      <PluginInstallPanel
        refValue="acme/relay"
        version="1.0.0"
        detail={detail()}
        onInstalled={noop}
        onDismiss={noop}
      />,
      { previewMarketplaceInstall: vi.fn().mockRejectedValue(new Error('boom: preview')) },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('boom: preview');
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('shows the store-off note when the preview is refused for a missing store', async () => {
    renderWithApi(
      <PluginInstallPanel
        refValue="acme/relay"
        version="1.0.0"
        detail={detail()}
        onInstalled={noop}
        onDismiss={noop}
      />,
      { previewMarketplaceInstall: vi.fn().mockRejectedValue(storeOffError()) },
    );
    expect(await screen.findByTestId('feature-disabled')).toHaveTextContent(
      'No marketplace store is configured on this server.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('collects the missing env, locks a secret var on, and omits a blank field', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt());
    renderWithApi(
      <PluginInstallPanel
        refValue="acme/relay"
        version="1.0.0"
        detail={detail()}
        onInstalled={noop}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(
          envPreview(
            ['RELAY_ID', 'RELAY_SECRET', 'RELAY_REGION'],
            [
              { name: 'RELAY_ID', secret: false },
              { name: 'RELAY_SECRET', secret: true },
            ],
          ),
        ),
        installMarketplacePlugin,
      },
    );

    await user.type(await screen.findByLabelText('RELAY_ID'), 'id-1');
    await user.type(screen.getByLabelText('RELAY_SECRET'), 'sh-1');
    await user.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'acme/relay',
        env: { RELAY_ID: 'id-1', RELAY_SECRET: 'sh-1' },
        secret_keys: ['RELAY_SECRET'],
      });
    });
  });

  it('sends a plain body when every env field is left blank', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt());
    renderWithApi(
      <PluginInstallPanel
        refValue="acme/relay"
        version="1.0.0"
        detail={detail()}
        onInstalled={noop}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreview(['RELAY_ID'])),
        installMarketplacePlugin,
      },
    );
    await screen.findByLabelText('RELAY_ID');
    await user.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({ ref: 'acme/relay' });
    });
  });

  it('renders a failed install as an alert and reports it', async () => {
    const user = userEvent.setup();
    const failure = new Error('boom: install');
    const onFailed = vi.fn();
    renderWithApi(
      <PluginInstallPanel
        refValue="acme/relay"
        version="1.0.0"
        detail={detail()}
        onInstalled={noop}
        onFailed={onFailed}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreview([])),
        installMarketplacePlugin: vi.fn().mockRejectedValue(failure),
      },
    );
    await screen.findByText(/pip-install/);
    await user.click(screen.getByRole('button', { name: 'Install' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom: install');
    expect(onFailed).toHaveBeenCalledWith(failure);
  });

  it('shows the store-off note for a refused install and blocks a retry', async () => {
    const user = userEvent.setup();
    renderWithApi(
      <PluginInstallPanel
        refValue="acme/relay"
        version="1.0.0"
        detail={detail()}
        onInstalled={noop}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreview([])),
        installMarketplacePlugin: vi.fn().mockRejectedValue(storeOffError()),
      },
    );
    await screen.findByText(/pip-install/);
    await user.click(screen.getByRole('button', { name: 'Install' }));
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });
});

describe('PluginInstallDialog', () => {
  it('renders the plain confirm in a dialog and dismisses on Cancel', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderWithApi(
      <PluginInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        detail={detail()}
        onInstalled={noop}
        onDismiss={onDismiss}
      />,
      { previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreview([])) },
    );
    const dialog = await screen.findByRole('dialog', { name: 'Install plugin' });
    await within(dialog).findByText(/pip-install/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('installs a plugin with routes through the mount form', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt());
    const withRoutes = detail({
      latest: {
        version: '1.0.0',
        contract_range: '>=1.0',
        status: 'published',
        published_at: '2026-07-01T00:00:00Z',
        items: [
          {
            kind: 'channel',
            name: 'web',
            description: '',
            tags: [],
            group: null,
            routes: {
              base: 'channels/web',
              paths: [{ path: '/status', methods: ['GET'], public: false }],
            },
          },
        ],
      },
    });
    renderWithApi(
      <PluginInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        detail={withRoutes}
        onInstalled={noop}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
        installMarketplacePlugin,
      },
    );
    const dialog = await screen.findByRole('dialog', { name: 'Install plugin' });
    expect(await within(dialog).findByLabelText('web base')).toHaveValue('channels/web');
    await within(dialog).findByText('/api/channels/web/status');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'acme/relay',
        route_mounts: { web: 'channels/web' },
        accept_public_routes: false,
      });
    });
  });
});
