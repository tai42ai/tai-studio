import { type MarketplacePluginDetail } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PluginDetail } from './PluginDetail';
import {
  advisory,
  detailFixture,
  emptyAdvisories,
  installedList,
  noop,
  pending,
  reads,
  renderWithProviders,
  type StubApiClient,
} from './test-utils';

describe('PluginDetail — gating', () => {
  it('renders a loud error for a malformed ref without a slash', () => {
    renderWithProviders(<PluginDetail refValue="noslash" onBack={noop} />, { client: {} });
    expect(screen.getByRole('alert')).toHaveTextContent('Malformed plugin reference');
  });

  it('shows no info card while the detail is pending', () => {
    const client: StubApiClient = {
      getMarketplacePlugin: vi.fn(() => pending<MarketplacePluginDetail>()),
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([])),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(emptyAdvisories),
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });
    expect(screen.queryByText('A box of tools.')).toBeNull();
  });

  it('shows a loud error with retry when the detail fails', async () => {
    const client: StubApiClient = {
      getMarketplacePlugin: vi.fn().mockRejectedValue(new Error('boom: detail')),
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([])),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue(emptyAdvisories),
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: detail');
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(client.getMarketplacePlugin).toHaveBeenCalledTimes(2);
    });
  });

  it('calls onBack from the back button', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderWithProviders(<PluginDetail refValue="noslash" onBack={onBack} />, { client: {} });
    await user.click(screen.getByRole('button', { name: 'Back to marketplace' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('PluginDetail — content', () => {
  it('renders the listing info, items table, and versions table', async () => {
    const client = reads(detailFixture(), []);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    expect(await screen.findByText('Toolbox')).toBeInTheDocument();
    expect(screen.getByText('A box of tools.')).toBeInTheDocument();
    expect(screen.getByText('1234 downloads')).toBeInTheDocument();
    // items table
    expect(screen.getByText('Generate a UUID.')).toBeInTheDocument();
    // versions table: a non-published status is styled loudly
    expect(screen.getByText('killed')).toBeInTheDocument();
    expect(screen.getByText('1.1.0')).toBeInTheDocument();
  });

  it('shows the delivery badge and the package name for a packaged listing', async () => {
    const client = reads(detailFixture(), []);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    const title = await screen.findByRole('heading', { name: 'Toolbox' });
    const cardEl = title.closest('.tai-card');
    if (cardEl === null) throw new Error('no listing card');
    const card = cardEl as HTMLElement;
    expect(within(card).getByText('package')).toBeInTheDocument();
    expect(within(card).getByText('tai42-toolbox')).toBeInTheDocument();
  });

  it('a descriptor listing badges "descriptor", shows an em dash for its null package, and offers no copy control', async () => {
    const client = reads(
      detailFixture({
        package: null,
        latest: {
          version: '1.2.0',
          contract_range: '>=1.0',
          status: 'published',
          published_at: '2026-07-01T00:00:00Z',
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
      [],
    );
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    const title = await screen.findByRole('heading', { name: 'Toolbox' });
    const cardEl = title.closest('.tai-card');
    if (cardEl === null) throw new Error('no listing card');
    const card = cardEl as HTMLElement;
    expect(within(card).getByText('descriptor')).toBeInTheDocument();
    // The package slot shows an em dash rather than a name.
    expect(within(card).getByText('—')).toBeInTheDocument();
    // A descriptor names no package, so the "Copy package" control is absent.
    expect(screen.queryByText('Package')).toBeNull();
  });

  it('renders the item group in the items table, an em dash for an ungrouped item', async () => {
    const client = reads(
      detailFixture({
        latest: {
          version: '1.2.0',
          contract_range: '>=1.0',
          status: 'published',
          published_at: '2026-07-01T00:00:00Z',
          items: [
            {
              kind: 'tool',
              name: 'uuid',
              description: 'Generate a UUID.',
              tags: [],
              group: 'core',
              required_env: [],
            },
            {
              kind: 'agent',
              name: 'echo',
              description: 'Echo.',
              tags: [],
              group: null,
              required_env: [],
            },
          ],
        },
      }),
      [],
    );
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    const groupHeader = await screen.findByRole('columnheader', { name: 'Group' });
    const table = groupHeader.closest('table');
    if (table === null) throw new Error('no table above the Group column');
    // The grouped item shows its group name; the ungrouped item shows an em dash.
    expect(within(table).getByText('core')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
  });

  it('renders exactly one h1 naming the plugin at the top of the detail view', async () => {
    const client = reads(detailFixture(), []);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    const headings = await screen.findAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('tai42/toolbox');
  });

  it('styles version statuses by tier: in-progress as warning, terminal as danger', async () => {
    const client = reads(
      detailFixture({
        versions: [
          { version: '2.0.0', contract_range: '>=1.0', status: 'validating', published_at: null },
          { version: '1.9.0', contract_range: '>=1.0', status: 'pending', published_at: null },
          {
            version: '1.8.0',
            contract_range: '>=1.0',
            status: 'scan_failed',
            published_at: null,
          },
          {
            version: '1.2.0',
            contract_range: '>=1.0',
            status: 'published',
            published_at: '2026-07-01T00:00:00Z',
          },
        ],
      }),
      [],
    );
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    // in-progress states are a warning tier, not a failure
    expect(await screen.findByText('validating')).toHaveAttribute('data-variant', 'warning');
    expect(screen.getByText('pending')).toHaveAttribute('data-variant', 'warning');
    // terminal failures are danger; a published version is a success
    expect(screen.getByText('scan_failed')).toHaveAttribute('data-variant', 'danger');
    expect(screen.getByText('published')).toHaveAttribute('data-variant', 'success');
  });

  it('renders the sanitized readme HTML and the link row as-is', async () => {
    const client = reads(
      detailFixture({
        readme_md: '<h3>Readme heading</h3>',
        homepage_url: 'https://tai42.ai/toolbox',
      }),
      [],
    );
    const { container } = renderWithProviders(
      <PluginDetail refValue="tai42/toolbox" onBack={noop} />,
      { client },
    );

    await screen.findByText('Toolbox');
    expect(container.querySelector('h3')).toHaveTextContent('Readme heading');
    expect(screen.getByRole('link', { name: 'Homepage' })).toHaveAttribute(
      'href',
      'https://tai42.ai/toolbox',
    );
    expect(screen.getByRole('link', { name: 'Repository' })).toBeInTheDocument();
  });

  it('shows empty states when nothing is published', async () => {
    const client = reads(detailFixture({ latest: null, versions: [] }), []);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    expect(await screen.findByText('No items')).toBeInTheDocument();
    expect(screen.getByText('No versions')).toBeInTheDocument();
  });
});

describe('PluginDetail — advisories', () => {
  it('renders a matching non-withdrawn advisory as a warning block', async () => {
    const client = reads(detailFixture(), [], {
      advisories: [advisory()],
      fetched_at: '2026-07-10T00:00:00Z',
    });
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    const alert = await screen.findByText('Security advisories');
    expect(alert.closest('[role="alert"]')).toHaveTextContent('RCE in the shell tool.');
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('ignores a withdrawn advisory', async () => {
    const client = reads(detailFixture(), [], {
      advisories: [advisory({ withdrawn_at: '2026-07-05T00:00:00Z' })],
      fetched_at: '2026-07-10T00:00:00Z',
    });
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await screen.findByText('Toolbox');
    expect(screen.queryByText('Security advisories')).toBeNull();
  });

  it('keeps the detail and shows an inline error when advisories fail', async () => {
    const client: StubApiClient = {
      getMarketplacePlugin: vi.fn().mockResolvedValue(detailFixture()),
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList([])),
      getMarketplaceAdvisories: vi.fn().mockRejectedValue(new Error('boom: advisories')),
    };
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    expect(await screen.findByText('Toolbox')).toBeInTheDocument();
    expect(await screen.findByText('boom: advisories')).toBeInTheDocument();
  });
});

describe('PluginDetail — premium badge + docs link', () => {
  it('renders the premium badge only when the detail is premium', async () => {
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, {
      client: reads(detailFixture({ premium: true }), []),
    });
    expect(await screen.findByText('Premium')).toBeInTheDocument();
  });

  it('shows no premium badge when the flag is false or absent', async () => {
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, {
      client: reads(detailFixture({ premium: false }), []),
    });
    await screen.findByText('Toolbox');
    expect(screen.queryByText('Premium')).toBeNull();
  });

  it('shows no premium badge when the flag is absent (nullish wire shape)', async () => {
    // premium is z.boolean().nullish(): an ABSENT flag is a real wire shape, distinct
    // from an explicit false — detailFixture() omits the key entirely. No badge either way.
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, {
      client: reads(detailFixture(), []),
    });
    await screen.findByText('Toolbox');
    expect(screen.queryByText('Premium')).toBeNull();
  });

  it('renders the docs link when docs_url is set', async () => {
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, {
      client: reads(detailFixture({ docs_url: 'https://docs.tai42.ai/toolbox' }), []),
    });
    const link = await screen.findByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('href', 'https://docs.tai42.ai/toolbox');
  });

  it('omits the docs link when docs_url is absent', async () => {
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, {
      client: reads(detailFixture(), []),
    });
    await screen.findByText('Toolbox');
    expect(screen.queryByRole('link', { name: 'Docs' })).toBeNull();
  });
});

describe('PluginDetail — version status, links, and install-prompt edges', () => {
  it('renders an unknown version status as a neutral badge', async () => {
    const client = reads(
      detailFixture({
        versions: [
          { version: '3.0.0', contract_range: null, status: 'archived', published_at: null },
        ],
      }),
      [],
    );
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });
    // A status outside the mapped set falls through to the neutral tier.
    expect(await screen.findByText('archived')).toHaveAttribute('data-variant', 'neutral');
  });

  it('omits the repository link when repository_url is null but keeps the others', async () => {
    const client = reads(
      detailFixture({ repository_url: null, homepage_url: 'https://tai42.ai/toolbox' }),
      [],
    );
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });
    await screen.findByText('Toolbox');
    // The link row still renders (homepage is set), but the null repository is dropped.
    expect(screen.getByRole('link', { name: 'Homepage' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Repository' })).toBeNull();
  });

  it('omits the version from the install prompt when there is no published latest', async () => {
    const user = userEvent.setup();
    const client = reads(detailFixture({ latest: null, versions: [] }), []);
    renderWithProviders(<PluginDetail refValue="tai42/toolbox" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    // With no latest version the ` v…` suffix is dropped from the confirm body.
    expect(dialog).toHaveTextContent(
      'Install tai42/toolbox? The app will pip-install the package and reload.',
    );
  });

  it('the plain confirm names registration, not pip, for a descriptor plugin', async () => {
    const user = userEvent.setup();
    const client = reads(
      detailFixture({
        package: null,
        latest: {
          version: '1.2.0',
          contract_range: '>=1.0',
          status: 'published',
          published_at: '2026-07-01T00:00:00Z',
          // No routes and no required_env → the plain one-click confirm path.
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
      [],
    );
    renderWithProviders(<PluginDetail refValue="iota/relay" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    // A descriptor installs no package, so the copy must not promise a pip install.
    expect(dialog).toHaveTextContent('The app will register this plugin and reload.');
    expect(dialog).not.toHaveTextContent('pip-install');
  });
});
