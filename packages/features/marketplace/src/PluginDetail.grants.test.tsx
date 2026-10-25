/**
 * The detail's write controls follow the session's grant: a control the projection
 * does not reach is not drawn, and a status line names the route and who to ask in
 * its place. The receipt card renders the reload's fleet report and, when workers
 * recycled, the roll.
 */
import { apiRoutes } from '@tai42/api-client';
import { INSTALL_NO_GRANT } from '@tai42/studio-sdk';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UNINSTALL_NO_GRANT, UPDATE_NO_GRANT } from './plugin-detail-actions';
import { PluginDetail } from './PluginDetail';
import {
  detailFixture,
  installedRow,
  installReceipt,
  noop,
  reads,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
} from './test-utils';

describe('PluginDetail — write controls follow the grant', () => {
  it('draws no Install button without the install route, and says why', async () => {
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, {
      client: reads(detailFixture(), []),
      projection: scopedProjection(),
    });
    expect(await screen.findByText(INSTALL_NO_GRANT)).toBeInTheDocument();
    expect(screen.getByText(INSTALL_NO_GRANT).closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('draws Install for a session whose grant reaches the install route', async () => {
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, {
      client: reads(detailFixture(), []),
      projection: scopedProjection({
        routes: [{ path: apiRoutes.post_api_marketplace_install.path, methods: ['POST'] }],
      }),
    });
    expect(await screen.findByRole('button', { name: 'Install' })).toBeInTheDocument();
    expect(screen.queryByText(INSTALL_NO_GRANT)).toBeNull();
  });

  it('draws only the granted control of an installed plugin and lines for the rest', async () => {
    const row = installedRow({ update_available: true, latest: '2.0.0' });
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, {
      client: reads(detailFixture(), [row]),
      projection: scopedProjection({
        routes: [{ path: apiRoutes.post_api_marketplace_uninstall.path, methods: ['POST'] }],
      }),
    });
    expect(await screen.findByRole('button', { name: 'Uninstall' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    expect(screen.getByText(UPDATE_NO_GRANT)).toBeInTheDocument();
    expect(screen.queryByText(UNINSTALL_NO_GRANT)).toBeNull();
  });

  it('names both missing grants of an installed plugin', async () => {
    const row = installedRow({ update_available: true, latest: '2.0.0' });
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, {
      client: reads(detailFixture(), [row]),
      projection: scopedProjection(),
    });
    expect(await screen.findByText(UPDATE_NO_GRANT)).toBeInTheDocument();
    expect(screen.getByText(UNINSTALL_NO_GRANT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Uninstall' })).toBeNull();
  });
});

describe('PluginDetail — the receipt reports the reload', () => {
  it('renders the fleet report and the worker recycle roll from the install receipt', async () => {
    const user = userEvent.setup();
    const base = installReceipt('tai42/toolbox');
    const installMarketplacePlugin = vi.fn().mockResolvedValue({
      ...base,
      version: '1.2.0',
      reload: {
        ...base.reload,
        fanout: {
          mode: 'fleet',
          op: 'reload',
          reachable: true,
          local_only: false,
          error: null,
          results: [
            { name: 'serve-a', outcome: 'applied', error: null, detail: null, payload: null },
            { name: 'serve-b', outcome: 'missing', error: null, detail: null, payload: null },
          ],
        },
        recycle: {
          recycle: [
            {
              name: 'serve-a',
              kind: 'serve',
              status: 'recycled',
              generation_before: 1,
              detail: null,
            },
          ],
          fresh: [],
          recycle_stopped: null,
        },
      },
    });
    const client: StubApiClient = { ...reads(detailFixture(), []), installMarketplacePlugin };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledTimes(1);
    });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('serve-b')).toBeInTheDocument();
    const roll = screen.getByRole('region', { name: 'Worker recycle' });
    expect(within(roll).getByText('serve-a')).toBeInTheDocument();
  });

  it('renders no fleet alert and no roll for a converged reload', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt('tai42/toolbox'));
    const client: StubApiClient = { ...reads(detailFixture(), []), installMarketplacePlugin };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));
    expect(await screen.findByText(/Installed tai42\/toolbox/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Worker recycle' })).toBeNull();
  });
});
