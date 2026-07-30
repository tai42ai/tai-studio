/**
 * Behavioural tests for the plugin detail view: the tri-state detail query and
 * the malformed-ref guard, the listing/items/versions render, the advisories
 * warning block, the install-state badges from the installed query, and the
 * install / update / uninstall confirm flows (client call, pending, loud error,
 * the success line + receipt notes, and the unfiltered cache invalidation), and
 * the keyboard reachability of every pane that outruns its column — the two
 * tables React renders and the table/code surfaces inside the injected README.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { flushResizeObservers, setElementOverflow } from '@tai42/studio-sdk/testing';

import type {
  MarketplaceAdvisory,
  MarketplaceInstallResult,
  MarketplaceInstalled,
  MarketplaceInstalledPlugin,
  MarketplacePluginDetail,
} from '@tai42/api-client';

import { PluginDetail } from './PluginDetail';
import { marketplaceInstalledKey } from './keys';
import { renderWithProviders, type StubApiClient } from './test-utils';

function detailFixture(overrides: Partial<MarketplacePluginDetail> = {}): MarketplacePluginDetail {
  return {
    namespace: 'tai42',
    name: 'toolbox',
    display_name: 'Toolbox',
    icon_url: null,
    package: 'tai42-toolbox',
    description: 'A box of tools.',
    readme_md: null,
    license: 'Apache-2.0',
    homepage_url: null,
    repository_url: 'https://github.com/tai42ai/toolbox',
    categories: ['productivity'],
    tags: ['cli'],
    trust_tier: 'official',
    pricing: 'free',
    downloads: 1234,
    latest: {
      version: '1.2.0',
      contract_range: '>=1.0',
      status: 'published',
      published_at: '2026-07-01T00:00:00Z',
      items: [{ kind: 'tool', name: 'uuid', description: 'Generate a UUID.', tags: ['uuid'] }],
    },
    versions: [
      {
        version: '1.2.0',
        contract_range: '>=1.0',
        status: 'published',
        published_at: '2026-07-01T00:00:00Z',
      },
      { version: '1.1.0', contract_range: '>=1.0', status: 'killed', published_at: null },
    ],
    ...overrides,
  };
}

function installedRow(
  overrides: Partial<MarketplaceInstalledPlugin> = {},
): MarketplaceInstalledPlugin {
  return {
    ref: 'tai42/toolbox',
    version: '1.2.0',
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
function installedList(plugins: MarketplaceInstalledPlugin[]): MarketplaceInstalled {
  return { installed: plugins, quarantined: [] };
}

function advisory(overrides: Partial<MarketplaceAdvisory> = {}): MarketplaceAdvisory {
  return {
    id: 7,
    listing: 'tai42/toolbox',
    affected_versions: '<1.2.0',
    severity: 'critical',
    summary: 'RCE in the shell tool.',
    created_at: '2026-07-01T00:00:00Z',
    withdrawn_at: null,
    ...overrides,
  };
}

const emptyAdvisories: { advisories: MarketplaceAdvisory[]; fetched_at: string } = {
  advisories: [],
  fetched_at: '2026-07-10T00:00:00Z',
};
const noop = (): void => undefined;

/** A promise that never settles, for exercising the pending branch. */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** A stub covering all three of the detail view's read queries. */
function reads(
  detail: MarketplacePluginDetail,
  installed: MarketplaceInstalledPlugin[],
  advisories = emptyAdvisories,
): StubApiClient {
  return {
    getMarketplacePlugin: vi.fn().mockResolvedValue(detail),
    listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList(installed)),
    getMarketplaceAdvisories: vi.fn().mockResolvedValue(advisories),
  };
}

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
    const updateMarketplacePlugin = vi
      .fn()
      .mockResolvedValue({ ref: 'tai42/toolbox', version: '2.0.0', notes: [], advisories: [] });
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

/** The `<table>` whose header row carries `columnHeader`, failing loudly if absent. */
function tableUnder(columnHeader: string): HTMLElement {
  const table = screen.getByRole('columnheader', { name: columnHeader }).closest('table');
  if (table === null) throw new Error(`no table above the ${columnHeader} column`);
  return table;
}

/** The pane wrapping `element`, failing loudly when it has none. */
function paneOf(element: HTMLElement): HTMLElement {
  const pane = element.parentElement;
  if (pane === null) throw new Error('element has no containing pane');
  return pane;
}

/** Reports every element in `elements` as overflowing and lets the observers see it. */
function setOverflowing(...elements: readonly HTMLElement[]): void {
  for (const element of elements) setElementOverflow(element, true);
  act(() => {
    flushResizeObservers();
  });
}

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
