import { type MarketplaceInstallPreview, type MarketplacePluginDetail } from '@tai42/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { marketplaceInstalledKey } from './keys';
import { PluginDetail } from './PluginDetail';
import {
  detailFixture,
  installedList,
  installedRow,
  noop,
  paneOf,
  reads,
  renderWithProviders,
  setOverflowing,
  type StubApiClient,
  tableUnder,
} from './test-utils';

describe('PluginDetail — panes that scroll are keyboard targets', () => {
  it('names the items and versions panes, and only while they actually scroll', async () => {
    const client = reads(detailFixture(), []);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await screen.findByText('Toolbox');
    // Located through the tables they hold, so this fails on an unmeasured pane
    // rather than on a renamed class.
    const items = paneOf(tableUnder('Kind'));
    const versions = paneOf(tableUnder('Version'));

    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    setOverflowing(items, versions);

    expect(screen.getByRole('region', { name: 'Contained items' })).toBe(items);
    expect(items).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('region', { name: 'Versions' })).toBe(versions);
    expect(versions).toHaveAttribute('tabindex', '0');
  });

  it('instruments the tables and code blocks inside the rendered README', async () => {
    const client = reads(
      detailFixture({
        readme_md:
          '<h3>Options</h3><table><tbody><tr><td>--flag</td></tr></tbody></table>' +
          '<h3>Example</h3><pre><code>tai run toolbox</code></pre>',
        latest: null,
        versions: [],
      }),
      [],
    );
    const { container } = renderWithProviders(
      <PluginDetail refValue="tai42/toolbox" onBack={noop} />,
      { client },
    );

    await screen.findByText('Toolbox');
    const prose = container.querySelector<HTMLElement>('.tai-prose');
    if (prose === null) throw new Error('the rendered README is not marked as prose');
    expect(prose).toContainElement(screen.getByText('--flag'));

    // React never rendered these, so they are instrumented in place: the table
    // gains a wrapper that scrolls, the `<pre>` IS its own scrolling box.
    const readmeTable = within(prose).getByRole('table');
    const tablePane = paneOf(readmeTable);
    expect(tablePane).toHaveClass('tai-scroll-region');
    const pre = prose.querySelector<HTMLElement>('pre');
    if (pre === null) throw new Error('no <pre> in the rendered README');

    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    setOverflowing(tablePane, pre);

    // Each surface takes the name of the heading it sits under.
    expect(screen.getByRole('region', { name: 'Options' })).toBe(tablePane);
    expect(tablePane).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('region', { name: 'Example' })).toBe(pre);
    expect(pre).toHaveAttribute('tabindex', '0');
  });

  it('keeps the README instrumented, and the reader inside it, across a re-render', async () => {
    const client = reads(
      detailFixture({
        readme_md: '<h3>Options</h3><table><tbody><tr><td>--flag</td></tr></tbody></table>',
        latest: null,
        versions: [],
      }),
      [],
    );
    const { container, queryClient } = renderWithProviders(
      <PluginDetail refValue="tai42/toolbox" onBack={noop} />,
      { client },
    );

    await screen.findByText('Toolbox');
    const prose = container.querySelector<HTMLElement>('.tai-prose');
    if (prose === null) throw new Error('the rendered README is not marked as prose');
    const readmeTable = within(prose).getByRole('table');
    const tablePane = paneOf(readmeTable);

    setOverflowing(tablePane);
    const region = screen.getByRole('region', { name: 'Options' });
    act(() => {
      region.focus();
    });
    expect(region).toHaveFocus();

    // A background read settling re-renders this card, and the README is written
    // into it as raw HTML: written again it would replace every node under the
    // prose, taking the instrumented regions with it and dropping the reader
    // standing in one onto the document body.
    act(() => {
      queryClient.setQueryData(marketplaceInstalledKey, installedList([installedRow()]));
    });
    expect(await screen.findByText('Installed v1.2.0')).toBeInTheDocument();

    expect(within(prose).getByRole('table')).toBe(readmeTable);
    expect(screen.getByRole('region', { name: 'Options' })).toBe(region);
    expect(region).toHaveFocus();
  });
});

/** A detail whose latest version provides a route-carrying channel item. */
function routeDetail(): MarketplacePluginDetail {
  return detailFixture({
    latest: {
      version: '1.2.0',
      contract_range: '>=1.0',
      status: 'published',
      published_at: '2026-07-01T00:00:00Z',
      items: [
        {
          kind: 'channel',
          name: 'web',
          description: 'A relay channel.',
          tags: [],
          group: null,
          routes: {
            base: 'channels/web',
            paths: [
              { path: '/inbound', methods: ['POST'], public: true },
              { path: '/status', methods: ['GET'], public: false },
            ],
          },
        },
      ],
    },
  });
}

function previewFixture(
  overrides: Partial<MarketplaceInstallPreview> = {},
): MarketplaceInstallPreview {
  return {
    ref: 'tai42/toolbox',
    version: '1.2.0',
    items: [
      {
        item: 'web',
        kind: 'channel',
        base: 'channels/web',
        default_base: 'channels/web',
        routes: [
          {
            path: '/inbound',
            full_path: '/api/channels/web/inbound',
            methods: ['POST'],
            public: true,
          },
        ],
      },
    ],
    collisions: [],
    public_routes: [],
    new_public_routes: [],
    requires_public_acceptance: false,
    required_env: [],
    missing_env: [],
    delivery: 'package',
    ...overrides,
  };
}

describe('PluginDetail — route surface and mounting', () => {
  it('renders the declared routes at their default bases with a public badge', async () => {
    const client = reads(routeDetail(), []);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    const routesHeading = await screen.findByRole('heading', { name: 'Routes' });
    const card = routesHeading.closest('.tai-card');
    if (card === null) throw new Error('no Routes card');
    expect(within(card as HTMLElement).getByText('/api/channels/web/inbound')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('/api/channels/web/status')).toBeInTheDocument();
    // The public route wears the warn badge; the authed one shows an em dash.
    expect(within(card as HTMLElement).getByText('public')).toBeInTheDocument();
  });

  it('installs a route plugin through the mount dialog and shows the mounted routes on the receipt', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue({
      ref: 'tai42/toolbox',
      version: '1.2.0',
      notes: [],
      advisories: [],
      routes: [
        {
          item: 'web',
          full_path: '/api/channels/web/inbound',
          methods: ['POST'],
          public: true,
        },
      ],
    });
    const client: StubApiClient = {
      ...reads(routeDetail(), []),
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    // The preview resolved the absolute path inside the dialog.
    await within(dialog).findByText('/api/channels/web/inbound');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'tai42/toolbox',
        route_mounts: { web: 'channels/web' },
        accept_public_routes: false,
      });
    });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Mounted routes');
    expect(status).toHaveTextContent('/api/channels/web/inbound');
  });

  it('updates a route plugin: the input prefills the non-default stored base and an edit-free update preserves it', async () => {
    const user = userEvent.setup();
    const updateMarketplacePlugin = vi.fn().mockResolvedValue({
      ref: 'tai42/toolbox',
      version: '2.0.0',
      notes: [],
      advisories: [],
      routes: [],
    });
    const client: StubApiClient = {
      ...reads(routeDetail(), [
        // Installed at a NON-default base — the picture the reset bug corrupted.
        installedRow({
          update_available: true,
          latest: '2.0.0',
          route_mounts: { web: 'channels/relay-2' },
        }),
      ]),
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
      updateMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Update' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('/api/channels/web/inbound');
    // A base input seeds from the stored mount, not the declared default, so an
    // item installed at a non-default base shows that base on reopen.
    const baseInput = within(dialog).getByLabelText<HTMLInputElement>('web base');
    expect(baseInput.value).toBe('channels/relay-2');

    await user.click(within(dialog).getByRole('button', { name: 'Update' }));

    // An edit-free update omits untouched items from route_mounts, so the server's
    // stored-mount precedence preserves the non-default base 'channels/relay-2'.
    await waitFor(() => {
      expect(updateMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'tai42/toolbox',
        route_mounts: {},
        accept_public_routes: false,
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Updated tai42/toolbox 2.0.0');
  });

  it('renders an installed plugin’s routes at the ACTUAL mounted base, not the declared default', async () => {
    const client = reads(routeDetail(), [
      installedRow({ route_mounts: { web: 'channels/relay-2' } }),
    ]);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    const routesHeading = await screen.findByRole('heading', { name: 'Routes' });
    const card = routesHeading.closest('.tai-card');
    if (card === null) throw new Error('no Routes card');
    // The stored mount, not the declared 'channels/web'.
    await waitFor(() => {
      expect(
        within(card as HTMLElement).getByText('/api/channels/relay-2/inbound'),
      ).toBeInTheDocument();
    });
    expect(within(card as HTMLElement).queryByText('/api/channels/web/inbound')).toBeNull();
  });
});
