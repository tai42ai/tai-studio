/**
 * The Connectors page shell: the header's "Add a custom server", the directory's
 * partial reads (each read the session cannot reach is a muted line, a failed read
 * an `ErrorState` with its own Retry), the "Your connections" list, the provider
 * door's controls in an entry's overflow menu, the routed connection detail, and
 * completing a popup-blocked redirect on arrival.
 */
import { ApiError } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectorsPage } from './connectors-page';
import { OAUTH_RESUME_PARAMS } from './oauth';
import {
  connection,
  discovered,
  discoveredProvider,
  makeClient,
  mcpEntry,
  NON_CONVERGED_FANOUT,
  preservedManifest,
  provider,
  providerCatalog,
  renderWithProviders,
} from './test-utils';
import {
  editorProjection,
  findCard,
  findRow,
  readerProjection,
  renderPage,
  showCards,
  START_ROUTE,
} from './test-utils-directory';

const R1 =
  'This session cannot list connector providers. Seeing them needs read access to GET /api/connectors/providers; ask an administrator to grant it.';
const R3_STATUS_ONLY =
  'This session cannot read the MCP configuration, so servers are shown from their live status only. Seeing every configured server needs read access to GET /api/manifest/preserved; ask an administrator to grant it.';
const R3_BOTH =
  'This session cannot read the MCP configuration. Seeing the configured servers needs read access to GET /api/manifest/preserved; ask an administrator to grant it.';
const R4 =
  'This session cannot read the live MCP status. Seeing which servers are mounted and which failed needs read access to GET /api/mcp-status; ask an administrator to grant it.';
const R6 =
  'This session cannot list marketplace listings. Seeing them needs read access to GET /api/marketplace/search; ask an administrator to grant it.';
const NO_LISTINGS =
  'Marketplace listings are not shown, because connecting one needs read access to GET /api/connectors/providers or GET /api/mcp-status; ask an administrator to grant it.';

afterEach(() => {
  localStorage.clear();
});

/** The page's muted status lines above the directory (not an entry's own), in screen order. */
function statusLines(): string[] {
  return screen
    .queryAllByRole('status')
    .filter(
      (node) =>
        node.tagName === 'P' &&
        node.classList.contains('tai-status') &&
        node.closest('[data-directory-row]') === null,
    )
    .map((node) => node.textContent);
}

describe('ConnectorsPage — the header', () => {
  it('offers Add a custom server to an administrator', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Connectors' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Add a custom server' })).toBeVisible();
  });

  it('draws no Add a custom server for a session whose projection is not full', async () => {
    renderPage({}, editorProjection());
    expect(await screen.findByRole('heading', { level: 1, name: 'Connectors' })).toBeVisible();
    await screen.findByRole('region', { name: 'Your connections' });
    expect(screen.queryByRole('button', { name: 'Add a custom server' })).toBeNull();
  });

  it('offers the marketplace and a custom server in the empty directory of an administrator', async () => {
    renderPage();
    expect(await screen.findByText('No servers or apps yet')).toBeVisible();
    expect(
      screen.getByText('Install one from the marketplace or add a custom server.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse the marketplace' })).toBeVisible();
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Add a custom server' })).toHaveLength(2);
    });
  });
});

describe('ConnectorsPage — partial reads', () => {
  it('(a) draws provider cards and names the configuration, status and marketplace reads', async () => {
    const user = userEvent.setup();
    const { client } = renderPage(
      { listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])) },
      readerProjection(['providers', 'connections'], [START_ROUTE]),
    );
    await showCards(user);
    await findCard('provider:github');
    expect(statusLines()).toEqual([R3_BOTH, R4, R6]);
    expect(client.getMcpStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('(b) draws server cards from the live status alone and names the other reads', async () => {
    const user = userEvent.setup();
    const listProviders = vi.fn();
    renderPage(
      {
        listProviders,
        getMcpStatus: vi.fn().mockResolvedValue({
          bound: { relay: ['relay_send'] },
          failed: [{ title: 'alerts', category: 'auth', message: 'denied' }],
        }),
      },
      readerProjection(['status']),
    );
    await showCards(user);
    expect(
      within(await findCard('server:relay')).getByText('Connected · 1 tools mounted'),
    ).toBeVisible();
    expect(within(await findCard('server:alerts')).getByText('Failed: auth')).toBeVisible();
    expect(statusLines()).toEqual([R1, R3_STATUS_ONLY, R6]);
    expect(screen.getByText('Your connections are not available')).toBeVisible();
    expect(listProviders).not.toHaveBeenCalled();
  });

  it('(c) treats a reached read answered 403 as refused, with no Retry and no second request', async () => {
    const getMcpStatus = vi.fn().mockRejectedValue(new ApiError('forbidden', 403));
    renderPage({ getMcpStatus });
    await waitFor(() => {
      expect(statusLines()).toEqual([R4]);
    });
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(getMcpStatus).toHaveBeenCalledTimes(1);
  });

  it('(d) shows a failed status read beside the provider cards and retries that read alone', async () => {
    const user = userEvent.setup();
    const listProviders = vi.fn().mockResolvedValue(providerCatalog([provider()]));
    const getMcpStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error('status down'))
      .mockResolvedValue({ bound: {}, failed: [] });
    renderPage({ listProviders, getMcpStatus });
    await showCards(user);
    await findCard('provider:github');
    expect(
      await screen.findByText('Could not load the MCP server status: status down'),
    ).toBeVisible();
    const providerReads = listProviders.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(getMcpStatus).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Could not load the MCP server status/)).toBeNull();
    });
    expect(listProviders).toHaveBeenCalledTimes(providerReads);
  });

  it('(e) is one empty state when the providers, connections, configuration and status are all refused', async () => {
    renderPage({}, readerProjection([]));
    expect(await screen.findByText('Connectors are not available')).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Your connections' })).toBeNull();
    expect(statusLines()).toEqual([]);
  });

  it('(f) keeps the connections list when no directory card can be drawn', async () => {
    renderPage(
      {
        listConnections: vi.fn().mockResolvedValue({ items: [connection()], total: 1 }),
      },
      readerProjection(['connections', 'search']),
    );
    const region = await screen.findByRole('region', { name: 'Your connections' });
    expect(await within(region).findByRole('link', { name: 'work' })).toBeVisible();
    expect(statusLines()).toEqual([R1, R3_BOTH, R4, NO_LISTINGS]);
    expect(screen.queryByRole('textbox', { name: 'Search servers and apps' })).toBeNull();
  });
});

describe('ConnectorsPage — Your connections', () => {
  it('lists each connection with its health and provider, linked to its detail', async () => {
    renderPage({
      listConnections: vi.fn().mockResolvedValue({
        items: [
          connection(),
          connection({
            connection_id: 'conn-2',
            alias: 'home',
            auth_health_state: 'reconnect_required',
          }),
        ],
        total: 2,
      }),
    });
    const region = await screen.findByRole('region', { name: 'Your connections' });
    expect(await within(region).findByRole('link', { name: 'work' })).toBeVisible();
    expect(within(region).getByText('Healthy')).toBeVisible();
    expect(within(region).getByText('Reconnect required')).toBeVisible();
    expect(within(region).getAllByText('github · octocat')).toHaveLength(2);
  });

  it('points to the marketplace when there are no providers and no connections', async () => {
    renderPage();
    expect(await screen.findByText('No connections yet')).toBeVisible();
    expect(
      screen.getByText('Install a connector plugin from the marketplace, then connect it here.'),
    ).toBeVisible();
  });

  it('shows a failed connections read with its Retry', async () => {
    renderPage({ listConnections: vi.fn().mockRejectedValue(new Error('connections boom')) });
    expect(
      await screen.findByText('Could not load your connections: connections boom'),
    ).toBeVisible();
    const region = screen.getByRole('region', { name: 'Your connections' });
    expect(within(region).getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});

describe('ConnectorsPage — a connection that needs more permissions', () => {
  const SENTENCE =
    'A tool asked for permissions this connection does not have. Reconnect to grant them.';

  it('flags a connection whose scopes_wanted is not empty, naming the scopes for a screen reader', async () => {
    renderPage(
      {
        listConnections: vi.fn().mockResolvedValue({
          items: [connection({ scopes_wanted: ['files.write', 'mail.send'] })],
          total: 1,
        }),
      },
      editorProjection(),
    );
    const sentence = await screen.findByText(SENTENCE);
    expect(screen.getByText('Needs more permissions')).toBeInTheDocument();
    const describedBy = sentence.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    const description = document.getElementById(describedBy ?? '');
    expect(description).toHaveTextContent('files.write mail.send');
  });

  it('shows neither the badge nor the sentence when nothing is wanted', async () => {
    renderPage({ listConnections: vi.fn().mockResolvedValue({ items: [connection()], total: 1 }) });
    await screen.findByRole('link', { name: 'work' });
    expect(screen.queryByText('Needs more permissions')).toBeNull();
    expect(screen.queryByText(SENTENCE)).toBeNull();
  });
});

describe('ConnectorsPage — adding a custom server', () => {
  it('opens the connect flow for a new server that registers apps by itself', async () => {
    const user = userEvent.setup();
    renderPage({
      discoverServer: vi.fn().mockResolvedValue(discovered()),
      addServer: vi.fn().mockResolvedValue({
        provider: discoveredProvider(),
        span_release_error: null,
        fanout: null,
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Add a custom server' }));
    await user.type(screen.getByLabelText('Server address'), 'https://mcp.example.com/mcp');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await user.click(await screen.findByRole('button', { name: 'Add server' }));
    expect(await screen.findByRole('dialog', { name: 'Connect Remote files' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Add MCP server' })).toBeNull();
  });

  it('tells the reader to set client credentials for a new server that needs them', async () => {
    const user = userEvent.setup();
    renderPage({
      discoverServer: vi
        .fn()
        .mockResolvedValue(discovered({ registration_supported: false, automatic_client: false })),
      addServer: vi.fn().mockResolvedValue({
        provider: discoveredProvider({ client_source: 'unset' }),
        span_release_error: null,
        fanout: null,
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Add a custom server' }));
    await user.type(screen.getByLabelText('Server address'), 'https://mcp.example.com/mcp');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await user.click(await screen.findByRole('button', { name: 'Add server' }));
    const notice = await screen.findByText('Server added');
    expect(notice.closest('[role="status"]')).toHaveTextContent(
      'Set its client credentials before anyone can connect.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

async function openMenu(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
  return screen.findByRole('menu', { name: `Actions for ${name}` });
}

describe('ConnectorsPage — the provider door on a provider card', () => {
  it('draws the connectors glyph for a provider with no icon', async () => {
    const user = userEvent.setup();
    renderPage({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([discoveredProvider()])),
    });
    await showCards(user);
    const card = await findCard('provider:remote_files');
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('says where each provider’s app registration comes from', async () => {
    const user = userEvent.setup();
    renderPage({
      listProviders: vi
        .fn()
        .mockResolvedValue(
          providerCatalog([
            discoveredProvider({ id: 'a', display_name: 'Dyn', client_source: 'dynamic' }),
            discoveredProvider({ id: 'b', display_name: 'Man', client_source: 'manual' }),
            discoveredProvider({ id: 'c', display_name: 'Uns', client_source: 'unset' }),
            provider({ id: 'e', display_name: 'Decl' }),
          ]),
        ),
    });
    await showCards(user);
    expect(
      within(await findCard('provider:a')).getByText('App registered automatically'),
    ).toBeVisible();
    expect(within(await findCard('provider:b')).getByText('Client credentials set')).toBeVisible();
    for (const key of ['provider:c', 'provider:e']) {
      const card = await findCard(key);
      expect(within(card).queryByText('App registered automatically')).toBeNull();
      expect(within(card).queryByText('Client credentials set')).toBeNull();
    }
  });

  it('offers Client credentials for a provider with a stored client only', async () => {
    const user = userEvent.setup();
    renderPage({
      listProviders: vi.fn().mockResolvedValue(
        providerCatalog([
          discoveredProvider({ id: 'a', display_name: 'Dyn', client_source: 'dynamic' }),
          discoveredProvider({
            id: 'd',
            display_name: 'Env',
            client_source: 'env',
            removable: false,
          }),
        ]),
      ),
    });
    const menu = await openMenu(user, 'Dyn');
    expect(within(menu).getByRole('menuitem', { name: 'Client credentials' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Actions for Env' })).toBeNull();
  });

  it('opens the client credentials dialog from the menu and shows the saved notice', async () => {
    const user = userEvent.setup();
    renderPage({
      listProviders: vi
        .fn()
        .mockResolvedValue(providerCatalog([discoveredProvider({ client_source: 'unset' })])),
      discoverServer: vi.fn().mockResolvedValue(discovered()),
      setProviderClient: vi.fn().mockResolvedValue({
        provider: discoveredProvider({ client_source: 'manual' }),
        span_release_error: null,
        fanout: null,
      }),
    });
    const menu = await openMenu(user, 'Remote files');
    await user.click(within(menu).getByRole('menuitem', { name: 'Client credentials' }));
    const id = await screen.findByLabelText('Client ID');
    await waitFor(() => {
      expect(id).toBeEnabled();
    });
    await user.type(id, 'app-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const notice = await screen.findByText('Saved');
    expect(notice.closest('[role="status"]')).toHaveTextContent('Client credentials saved.');
  });

  it('removes a removable provider after the confirm', async () => {
    const user = userEvent.setup();
    const listProviders = vi.fn().mockResolvedValue(providerCatalog([discoveredProvider()]));
    const removeProvider = vi.fn().mockResolvedValue({
      provider_id: 'remote_files',
      removed_clients: 1,
      span_release_error: null,
      fanout: null,
    });
    renderPage({ listProviders, removeProvider });
    const menu = await openMenu(user, 'Remote files');
    await user.click(within(menu).getByRole('menuitem', { name: 'Remove' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove this server?' });
    expect(dialog).toHaveTextContent(
      'This removes “Remote files” from the list. Disconnect its accounts first.',
    );
    const reads = listProviders.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(removeProvider).toHaveBeenCalledWith('remote_files');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(listProviders.mock.calls.length).toBeGreaterThan(reads);
  });

  it("keeps the confirm open with the server's message when the provider still has connections", async () => {
    const user = userEvent.setup();
    const message =
      "provider 'remote_files' has 1 live connection(s); disconnect them before removing it";
    renderPage({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([discoveredProvider()])),
      removeProvider: vi.fn().mockRejectedValue(new ApiError(message, 409)),
    });
    const menu = await openMenu(user, 'Remote files');
    await user.click(within(menu).getByRole('menuitem', { name: 'Remove' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove this server?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('dialog', { name: 'Remove this server?' })).toBeVisible();
  });

  it('keeps the confirm open on the fleet report when a worker did not reload the removal', async () => {
    const user = userEvent.setup();
    renderPage({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([discoveredProvider()])),
      removeProvider: vi.fn().mockResolvedValue({
        provider_id: 'remote_files',
        removed_clients: 1,
        span_release_error: null,
        fanout: NON_CONVERGED_FANOUT,
      }),
    });
    const menu = await openMenu(user, 'Remote files');
    await user.click(within(menu).getByRole('menuitem', { name: 'Remove' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove this server?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Change saved, but 1 worker did not converge');
    expect(within(alert).getByText('serve-b')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers neither control to a session whose projection is not full', async () => {
    renderPage(
      { listProviders: vi.fn().mockResolvedValue(providerCatalog([discoveredProvider()])) },
      editorProjection(),
    );
    await findRow('provider:remote_files');
    expect(screen.queryByRole('button', { name: 'Actions for Remote files' })).toBeNull();
  });
});

describe('ConnectorsPage — routes', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('renders the connection detail when a connection search param is set', async () => {
    const client = makeClient({
      getConnection: vi.fn().mockResolvedValue(connection({ alias: 'detail-alias' })),
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
    });
    renderWithProviders(<ConnectorsPage search={{ connection: 'conn-1' }} />, { client });
    expect(await screen.findByText('detail-alias')).toBeInTheDocument();
  });

  it('completes a redirected sign-in on arrival and opens the flow at Pick tools', async () => {
    window.history.replaceState(
      null,
      '',
      `/connectors?${OAUTH_RESUME_PARAMS.state}=st&${OAUTH_RESUME_PARAMS.code}=cd`,
    );
    const completeOAuth = vi.fn().mockResolvedValue({
      kind: 'success',
      connection_id: 'conn-1',
      return_url: '/connectors',
      span_release_error: null,
      fanout: null,
    });
    renderPage({
      completeOAuth,
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
      listConnections: vi.fn().mockResolvedValue({ items: [connection()], total: 1 }),
      getManifestPreserved: vi
        .fn()
        .mockResolvedValue(
          preservedManifest([mcpEntry('github_repo', { connectionId: 'conn-1' })]),
        ),
      listMcpAdvertisedTools: vi.fn().mockResolvedValue({
        title: 'github_repo',
        include: [],
        exclude: [],
        tools: [],
        unadvertised: [],
      }),
    });
    await waitFor(() => {
      expect(completeOAuth).toHaveBeenCalledWith('st', 'cd', undefined, undefined);
    });
    const dialog = await screen.findByRole('dialog', { name: 'Connect GitHub' });
    const nav = within(dialog).getByRole('navigation', { name: 'Connection steps' });
    await waitFor(() => {
      expect(nav.querySelector('[aria-current="step"]')).toHaveTextContent('Pick tools');
    });
  });
});
