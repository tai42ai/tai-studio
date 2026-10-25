/**
 * Tests for the route-mounting install form and its helpers: the preview fires on
 * open and on a (debounced) base remap, the resolved paths render live, a collision
 * blocks submit loudly, a public route must be accepted before submit, a preview
 * failure blocks, the preview's missing env is collected in the same flow, and the
 * submit calls the install / update endpoint itself. The dialog closes only after a
 * 2xx; the panel renders the same fields in place.
 */
import type { MarketplaceInstallPreview } from '@tai42/api-client';
import { renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MountInstallDialog, MountInstallForm } from './mount-install';
import { routeItemsOf } from './route-items';
import {
  installReceipt,
  noop,
  pending,
  previewFixture,
  renderWithApi,
  routeItems,
  storeOffError,
} from './test-install-fixtures';
import { useDebouncedValue } from './use-debounced-value';

describe('routeItemsOf', () => {
  it('keeps only the items that declare routes, in order', () => {
    const items = [
      { kind: 'tool', name: 'uuid' },
      {
        kind: 'channel',
        name: 'web',
        routes: {
          base: 'channels/web',
          paths: [{ path: '/x', methods: ['GET' as const], public: true }],
        },
      },
      { kind: 'mcp-server', name: 'db', routes: null },
    ];
    const out = routeItemsOf(items);
    expect(out.map((item) => item.name)).toEqual(['web']);
    expect(out[0]?.routes.base).toBe('channels/web');
  });
});

describe('useDebouncedValue', () => {
  it('settles the first value immediately and a change only after the delay', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 20), {
      initialProps: { value: 'a' },
    });
    expect(result.current).toBe('a');
    rerender({ value: 'b' });
    // Not yet settled synchronously after the change.
    expect(result.current).toBe('a');
    await waitFor(() => {
      expect(result.current).toBe('b');
    });
  });
});

describe('MountInstallDialog — preview and mounting', () => {
  it('previews on open with the default bases and renders the resolved paths', async () => {
    const previewMarketplaceInstall = vi.fn().mockResolvedValue(previewFixture());
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={noop}
        onDismiss={noop}
      />,
      { previewMarketplaceInstall },
    );

    expect(await screen.findByText('/api/channels/web/inbound')).toBeInTheDocument();
    expect(screen.getByText('/api/channels/web/status')).toBeInTheDocument();
    expect(previewMarketplaceInstall).toHaveBeenCalledWith(
      { ref: 'acme/relay', version: '1.0.0', route_mounts: { web: 'channels/web' } },
      expect.anything(),
    );
  });

  it('shows a skeleton while the first preview is pending (no resolved paths yet)', async () => {
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={noop}
        onDismiss={noop}
      />,
      { previewMarketplaceInstall: vi.fn(() => pending<MarketplaceInstallPreview>()) },
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('/api/channels/web/inbound')).toBeNull();
    // The submit is blocked until a preview lands.
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('installs with route_mounts + accept_public_routes and reports the receipt', async () => {
    const user = userEvent.setup();
    const receipt = installReceipt();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(receipt);
    const onDone = vi.fn();
    const onDismiss = vi.fn();
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={onDone}
        onDismiss={onDismiss}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
        installMarketplacePlugin,
      },
    );

    await screen.findByText('/api/channels/web/inbound');
    await user.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith(receipt);
    });
    expect(installMarketplacePlugin).toHaveBeenCalledWith({
      ref: 'acme/relay',
      route_mounts: { web: 'channels/web' },
      accept_public_routes: false,
    });
    // The dialog's own close after a 2xx is not a dismissal.
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the server message when the install fails', async () => {
    const user = userEvent.setup();
    const failure = new Error('boom: install');
    const onFailed = vi.fn();
    const onDone = vi.fn();
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={onDone}
        onFailed={onFailed}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
        installMarketplacePlugin: vi.fn().mockRejectedValue(failure),
      },
    );

    await screen.findByText('/api/channels/web/inbound');
    await user.click(screen.getByRole('button', { name: 'Install' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('boom: install')).toBeInTheDocument();
    expect(onFailed).toHaveBeenCalledWith(failure);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('re-previews with the remapped base after a debounced edit', async () => {
    const user = userEvent.setup();
    const previewMarketplaceInstall = vi.fn().mockResolvedValue(previewFixture());
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={noop}
        onDismiss={noop}
      />,
      { previewMarketplaceInstall },
    );

    await screen.findByText('/api/channels/web/inbound');
    const baseInput = screen.getByLabelText('web base');
    await user.clear(baseInput);
    await user.type(baseInput, 'channels/relay');

    await waitFor(() => {
      expect(previewMarketplaceInstall).toHaveBeenCalledWith(
        { ref: 'acme/relay', version: '1.0.0', route_mounts: { web: 'channels/relay' } },
        expect.anything(),
      );
    });
  });

  it('blocks submit and shows a loud collision block when the preview finds one', async () => {
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={noop}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(
          previewFixture({
            collisions: [
              {
                item: 'web',
                full_path: '/api/channels/web/inbound',
                methods: ['POST'],
                conflict_owner: 'plugin:acme/other',
                conflict_path: '/api/channels/web/inbound',
              },
            ],
          }),
        ),
      },
    );

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Route collision')).toBeInTheDocument();
    expect(within(dialog).getByText('plugin:acme/other')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('requires public-route acceptance before submit is allowed', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt());
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={noop}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(
          previewFixture({
            public_routes: [
              { item: 'web', full_path: '/api/channels/web/inbound', methods: ['POST'] },
            ],
            new_public_routes: [
              { item: 'web', full_path: '/api/channels/web/inbound', methods: ['POST'] },
            ],
            requires_public_acceptance: true,
          }),
        ),
        installMarketplacePlugin,
      },
    );

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Public routes');
    // Blocked until the operator accepts the unauthenticated routes.
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'I accept these routes are served without authentication',
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'acme/relay',
        route_mounts: { web: 'channels/web' },
        accept_public_routes: true,
      });
    });
  });

  it('blocks submit and surfaces the failure loudly when the preview errors', async () => {
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={noop}
        onDismiss={noop}
      />,
      { previewMarketplaceInstall: vi.fn().mockRejectedValue(new Error('boom: preview')) },
    );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/install preview failed/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it("collects the preview's missing env in the same flow and carries it in the body", async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt());
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        requiredEnvSecret={{ DATABASE_URL: true }}
        onDone={noop}
        onDismiss={noop}
      />,
      {
        // The preview names the missing var; its derived secret-ness seeds the toggle.
        previewMarketplaceInstall: vi
          .fn()
          .mockResolvedValue(previewFixture({ missing_env: ['DATABASE_URL'] })),
        installMarketplacePlugin,
      },
    );

    await screen.findByText('/api/channels/web/inbound');
    await user.type(await screen.findByLabelText('DATABASE_URL'), 'postgres://db');
    await user.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'acme/relay',
        route_mounts: { web: 'channels/web' },
        accept_public_routes: false,
        env: { DATABASE_URL: 'postgres://db' },
        secret_keys: ['DATABASE_URL'],
      });
    });
  });

  it('does not collect env on an UPDATE even when the preview reports a missing var', async () => {
    const user = userEvent.setup();
    const updateMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt());
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Update"
        routeItems={routeItems()}
        requiredEnvSecret={{ DATABASE_URL: true }}
        onDone={noop}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi
          .fn()
          .mockResolvedValue(previewFixture({ missing_env: ['DATABASE_URL'] })),
        updateMarketplacePlugin,
      },
    );

    await screen.findByText('/api/channels/web/inbound');
    // The server refuses a new required var on update, so the update flow shows no
    // env field and sends no env in the body.
    expect(screen.queryByLabelText('DATABASE_URL')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => {
      expect(updateMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'acme/relay',
        route_mounts: {},
        accept_public_routes: false,
      });
    });
  });

  it('dismisses without a call on cancel', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const updateMarketplacePlugin = vi.fn();
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Update"
        routeItems={routeItems()}
        onDone={noop}
        onDismiss={onDismiss}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
        updateMarketplacePlugin,
      },
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(updateMarketplacePlugin).not.toHaveBeenCalled();
  });
});

describe('MountInstallForm — the same fields in place', () => {
  it('renders as a form, not a dialog, and installs on submit', async () => {
    const user = userEvent.setup();
    const receipt = installReceipt();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(receipt);
    const onDone = vi.fn();
    renderWithApi(
      <MountInstallForm
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={onDone}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
        installMarketplacePlugin,
      },
    );

    const form = await screen.findByRole('form', { name: 'Install plugin' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await within(form).findByText('/api/channels/web/inbound');
    await user.click(within(form).getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith(receipt);
    });
    expect(installMarketplacePlugin).toHaveBeenCalledWith({
      ref: 'acme/relay',
      route_mounts: { web: 'channels/web' },
      accept_public_routes: false,
    });
  });

  it('renders a failed install as an alert and stays in place', async () => {
    const user = userEvent.setup();
    const onFailed = vi.fn();
    renderWithApi(
      <MountInstallForm
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={noop}
        onFailed={onFailed}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
        installMarketplacePlugin: vi.fn().mockRejectedValue(new Error('boom: install')),
      },
    );

    const form = await screen.findByRole('form', { name: 'Install plugin' });
    await within(form).findByText('/api/channels/web/inbound');
    await user.click(within(form).getByRole('button', { name: 'Install' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('boom: install');
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('shows the muted store-off note and blocks the submit when the store is off', async () => {
    const user = userEvent.setup();
    renderWithApi(
      <MountInstallForm
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={noop}
        onDismiss={noop}
      />,
      {
        previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
        installMarketplacePlugin: vi.fn().mockRejectedValue(storeOffError()),
      },
    );

    const form = await screen.findByRole('form', { name: 'Install plugin' });
    await within(form).findByText('/api/channels/web/inbound');
    await user.click(within(form).getByRole('button', { name: 'Install' }));
    const note = await within(form).findByTestId('feature-disabled');
    expect(note).toHaveTextContent('No marketplace store is configured on this server.');
    expect(within(form).queryByRole('alert')).toBeNull();
    expect(within(form).getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('dismisses on Cancel', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderWithApi(
      <MountInstallForm
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        onDone={noop}
        onDismiss={onDismiss}
      />,
      { previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()) },
    );
    const form = await screen.findByRole('form', { name: 'Install plugin' });
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
