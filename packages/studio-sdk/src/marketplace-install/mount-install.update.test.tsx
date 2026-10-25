/**
 * MountInstallDialog on UPDATE: each base input seeds from the stored mount and an
 * edit-free update omits untouched items, so a non-default base survives. Renders the
 * same dialog as the sibling install test.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MountInstallDialog } from './mount-install';
import type { RouteItem } from './route-items';
import {
  installReceipt,
  noop,
  previewFixture,
  renderWithApi,
  routeItems,
} from './test-install-fixtures';

describe('MountInstallDialog — update seeds from and preserves the stored mount', () => {
  it('prefills each base input from the stored mount, not the declared default', async () => {
    const updateMarketplacePlugin = vi.fn();
    const client = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
      updateMarketplacePlugin,
    };
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Update"
        routeItems={routeItems()}
        // Installed at a NON-default base.
        storedMounts={{ web: 'channels/relay-2' }}
        onDone={noop}
        onDismiss={noop}
      />,
      client,
    );
    // A base input seeds from the stored mount, not the declared default, so an
    // item installed at a non-default base shows that base on reopen.
    const baseInput = await screen.findByLabelText<HTMLInputElement>('web base');
    expect(baseInput.value).toBe('channels/relay-2');
  });

  it('a non-default stored base survives an edit-free update: route_mounts is empty', async () => {
    const user = userEvent.setup();
    const updateMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt());
    const client = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
      updateMarketplacePlugin,
    };
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Update"
        routeItems={routeItems()}
        storedMounts={{ web: 'channels/relay-2' }}
        onDone={noop}
        onDismiss={noop}
      />,
      client,
    );
    await screen.findByText('/api/channels/web/inbound');
    await user.click(screen.getByRole('button', { name: 'Update' }));
    // An edit-free update omits untouched items from route_mounts, so the server's
    // stored-mount precedence preserves the non-default base 'channels/relay-2'.
    await waitFor(() => {
      expect(updateMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'acme/relay',
        route_mounts: {},
        accept_public_routes: false,
      });
    });
  });

  it('sends ONLY the operator-changed base and omits the unchanged item', async () => {
    const user = userEvent.setup();
    const updateMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt());
    const client = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
      updateMarketplacePlugin,
    };
    const twoItems: RouteItem[] = [
      ...routeItems(),
      {
        name: 'api',
        kind: 'router',
        routes: {
          base: 'routers/api',
          paths: [{ path: '/ping', methods: ['GET'], public: false }],
        },
      },
    ];
    renderWithApi(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Update"
        routeItems={twoItems}
        storedMounts={{ web: 'channels/relay-2', api: 'routers/api-2' }}
        onDone={noop}
        onDismiss={noop}
      />,
      client,
    );
    await screen.findByText('/api/channels/web/inbound');
    const webInput = screen.getByLabelText('web base');
    await user.clear(webInput);
    await user.type(webInput, 'channels/relay-9');
    await user.click(screen.getByRole('button', { name: 'Update' }));
    // Only 'web' changed from its stored base; 'api' is unchanged → omitted so the
    // server preserves its stored 'routers/api-2'.
    await waitFor(() => {
      expect(updateMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'acme/relay',
        route_mounts: { web: 'channels/relay-9' },
        accept_public_routes: false,
      });
    });
  });
});
