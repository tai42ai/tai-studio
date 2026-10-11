/**
 * Tests for the Connectors page shell: the providers + connections sections in
 * their loading / empty / error / populated states, the category grouping and
 * per-provider connection state, selecting a connection, and completing a
 * popup-blocked redirect flow on arrival.
 */
import { ApiError } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectorsPage } from './connectors-page';
import { OAUTH_RESUME_PARAMS } from './oauth';
import {
  category,
  connection,
  discovered,
  discoveredProvider,
  makeClient,
  NON_CONVERGED_FANOUT,
  provider,
  providerCatalog,
  renderWithProviders,
} from './test-utils';
import { fullProjection, scopedProjection } from './test-utils-mcp-servers';

describe('ConnectorsPage — list', () => {
  it('renders providers (under their category) and connections', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
      listConnections: vi.fn().mockResolvedValue({ items: [connection()], total: 1 }),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Connectors' })).toBeInTheDocument();
    // The category grouping renders its label as a subheading.
    expect(screen.getByRole('heading', { level: 3, name: 'Developer tools' })).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
  });

  it('groups providers under the categories from the catalog, ordered by sort_order', async () => {
    const client = makeClient({
      listProviders: vi
        .fn()
        .mockResolvedValue(
          providerCatalog(
            [
              provider({ id: 'github', display_name: 'GitHub', category: 'dev' }),
              provider({ id: 'slack', display_name: 'Slack', category: 'chat', sub_services: [] }),
            ],
            [
              category({ id: 'chat', display_name: 'Chat', sort_order: 0 }),
              category({ id: 'dev', display_name: 'Developer tools', sort_order: 1 }),
            ],
          ),
        ),
      listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Chat' })).toBeInTheDocument();
    });
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // sort_order puts Chat before Developer tools.
    expect(headings).toEqual(['Chat', 'Developer tools']);
  });

  it('renders a provider icon when icon_url is set', async () => {
    const { container } = renderWithProviders(<ConnectorsPage search={{}} />, {
      client: makeClient({
        listProviders: vi
          .fn()
          .mockResolvedValue(
            providerCatalog([provider({ icon_url: 'https://cdn.example/gh.png' })]),
          ),
        listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    expect(container.querySelector('img[src="https://cdn.example/gh.png"]')).not.toBeNull();
  });

  it('shows Connect for a provider with no connections', async () => {
    renderWithProviders(<ConnectorsPage search={{}} />, {
      client: makeClient({
        listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
        listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add another account' })).toBeNull();
  });

  it('shows the connected count and Add another account when a provider has connections', async () => {
    renderWithProviders(<ConnectorsPage search={{}} />, {
      client: makeClient({
        listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
        listConnections: vi.fn().mockResolvedValue({
          items: [
            connection({ connection_id: 'a', auth_health_state: 'healthy' }),
            connection({ connection_id: 'b', auth_health_state: 'reconnect_required' }),
          ],
          total: 2,
        }),
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('2 connected')).toBeInTheDocument();
    });
    // Any unhealthy account raises the needs-attention badge on the provider card.
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add another account' })).toBeInTheDocument();
  });

  it('shows empty states when both lists are empty', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([], [])),
      listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('No connectors installed')).toBeInTheDocument();
    });
    expect(screen.getByText('No connections yet')).toBeInTheDocument();
    // Both empty states point at the marketplace (one per section).
    expect(screen.getAllByRole('link', { name: 'Browse marketplace' })).toHaveLength(2);
  });

  it('renders the connections empty-state prose (not an error) when the store is off', async () => {
    // The connectors gate stays on via registered providers, but the token store is
    // unconfigured, so `listConnections` answers 200-empty (never a 500/501). The
    // already-written empty-state prose must render — never a loud ErrorState.
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
      listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('No connections yet')).toBeInTheDocument();
    });
    // With providers present the copy nudges to connect above, and there is no error.
    expect(screen.getByText('Connect a provider above to get started.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a loud error state when a list request fails', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockRejectedValue(new Error('providers boom')),
      listConnections: vi.fn().mockRejectedValue(new Error('connections boom')),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('providers boom')).toBeInTheDocument();
    });
    expect(screen.getByText('connections boom')).toBeInTheDocument();
  });

  it('flags connection state as unavailable on provider cards when the connections list fails', async () => {
    const client = makeClient({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
      listConnections: vi.fn().mockRejectedValue(new Error('connections boom')),
    });
    renderWithProviders(<ConnectorsPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    // The card must not fall back to a healthy zero-connections read: no Connect-only
    // affordance implying "not connected", surfacing the unknown state instead.
    expect(screen.getByText('Connection state unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Needs attention')).toBeNull();
    // The connections section still surfaces the failure loudly.
    expect(screen.getByText('connections boom')).toBeInTheDocument();
  });

  it('routes to the detail view when a connection search param is set', async () => {
    const client = makeClient({
      getConnection: vi.fn().mockResolvedValue(connection({ alias: 'detail-alias' })),
      listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
    });
    renderWithProviders(<ConnectorsPage search={{ connection: 'conn-1' }} />, { client });

    await waitFor(() => {
      expect(screen.getByText('detail-alias')).toBeInTheDocument();
    });
  });
});

describe('ConnectorsPage — redirect-flow resume', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('completes the exchange when the page loads with the forwarded params', async () => {
    window.history.replaceState(
      null,
      '',
      `/connectors?${OAUTH_RESUME_PARAMS.state}=st&${OAUTH_RESUME_PARAMS.code}=cd`,
    );
    const completeOAuth = vi.fn().mockResolvedValue({
      kind: 'success',
      connection_id: 'c1',
      return_url: '/connectors',
      fanout: null,
    });
    renderWithProviders(<ConnectorsPage search={{}} />, {
      client: makeClient({
        completeOAuth,
        listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
        listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      }),
    });

    await waitFor(() => {
      expect(completeOAuth).toHaveBeenCalledWith('st', 'cd', undefined, undefined);
    });
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });
});

/** The page against a catalog, as an administrator unless a projection is given. */
function renderPage(
  overrides: Parameters<typeof makeClient>[0] = {},
  projection = fullProjection(),
) {
  const client = makeClient({
    listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
    listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    ...overrides,
  });
  return { ...renderWithProviders(<ConnectorsPage search={{}} />, { client, projection }), client };
}

/** A projection that is not full: the caller reaches the catalog and connect routes only. */
function editorProjection() {
  return scopedProjection({
    routes: [
      { path: '/api/connectors/providers', methods: ['GET'] },
      { path: '/api/connectors/connections', methods: ['GET'] },
      { path: '/api/connectors/connections/start', methods: ['POST'] },
    ],
  });
}

function card(name: string): HTMLElement {
  const title = screen.getByText(name, { selector: 'strong' });
  const found = title.closest('.tai-card');
  if (!(found instanceof HTMLElement)) throw new Error(`no card for ${name}`);
  return found;
}

describe('ConnectorsPage — adding an MCP server', () => {
  it('offers Add MCP server on the Providers heading row to an administrator', async () => {
    renderPage();
    const section = await screen.findByRole('region', { name: 'Providers' });
    expect(
      await within(section).findByRole('button', { name: 'Add MCP server' }),
    ).toBeInTheDocument();
  });

  it('names both ways to add a connector in the empty state of an administrator', async () => {
    renderPage({ listProviders: vi.fn().mockResolvedValue(providerCatalog([], [])) });
    expect(
      await screen.findByText(
        'Install a connector from the marketplace, or add any MCP server that signs in with OAuth by its address.',
      ),
    ).toBeInTheDocument();
    // The heading row and the empty state each offer it.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Add MCP server' })).toHaveLength(2);
    });
  });

  it('renders none of the new controls for a caller whose projection is not full', async () => {
    renderPage(
      {
        listProviders: vi
          .fn()
          .mockResolvedValue(
            providerCatalog([discoveredProvider({ client_source: 'manual' })], [category()]),
          ),
        listConnections: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      },
      editorProjection(),
    );
    await screen.findByText('Remote files', { selector: 'strong' });
    expect(screen.queryByRole('button', { name: 'Add MCP server' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Client credentials' })).toBeNull();
    // The catalog and Connect stay.
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('names the marketplace only in the empty state of a caller whose projection is not full', async () => {
    renderPage(
      { listProviders: vi.fn().mockResolvedValue(providerCatalog([], [])) },
      editorProjection(),
    );
    expect(
      await screen.findByText('Install a connector from the marketplace.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add MCP server' })).toBeNull();
  });

  it('opens the connect dialog for a new server that registers apps by itself', async () => {
    const user = userEvent.setup();
    renderPage({
      discoverServer: vi.fn().mockResolvedValue(discovered()),
      addServer: vi.fn().mockResolvedValue({ provider: discoveredProvider(), fanout: null }),
    });
    const section = await screen.findByRole('region', { name: 'Providers' });
    await user.click(await within(section).findByRole('button', { name: 'Add MCP server' }));
    await user.type(screen.getByLabelText('Server address'), 'https://mcp.example.com/mcp');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await user.click(await screen.findByRole('button', { name: 'Add server' }));
    expect(await screen.findByRole('dialog', { name: 'Connect Remote files' })).toBeInTheDocument();
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
        fanout: null,
      }),
    });
    const section = await screen.findByRole('region', { name: 'Providers' });
    await user.click(await within(section).findByRole('button', { name: 'Add MCP server' }));
    await user.type(screen.getByLabelText('Server address'), 'https://mcp.example.com/mcp');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await user.click(await screen.findByRole('button', { name: 'Add server' }));
    const notice = await screen.findByText('Server added');
    const status = notice.closest('[role="status"]');
    expect(status).not.toBeNull();
    expect(status).toHaveTextContent('Set its client credentials before anyone can connect.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ConnectorsPage — provider card additions', () => {
  it('draws the connectors glyph for a provider with no icon', async () => {
    renderPage({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([discoveredProvider()])),
    });
    await screen.findByText('Remote files', { selector: 'strong' });
    const remote = card('Remote files');
    expect(remote.querySelector('img')).toBeNull();
    expect(remote.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('says where each provider’s app registration comes from', async () => {
    renderPage({
      listProviders: vi
        .fn()
        .mockResolvedValue(
          providerCatalog([
            discoveredProvider({ id: 'a', display_name: 'Dyn', client_source: 'dynamic' }),
            discoveredProvider({ id: 'b', display_name: 'Man', client_source: 'manual' }),
            discoveredProvider({ id: 'c', display_name: 'Uns', client_source: 'unset' }),
            discoveredProvider({ id: 'd', display_name: 'Env', client_source: 'env' }),
            provider({ id: 'e', display_name: 'Decl' }),
          ]),
        ),
    });
    await screen.findByText('Dyn', { selector: 'strong' });
    expect(within(card('Dyn')).getByText('App registered automatically')).toBeInTheDocument();
    expect(within(card('Man')).getByText('Client credentials set')).toBeInTheDocument();
    for (const name of ['Uns', 'Env', 'Decl']) {
      expect(within(card(name)).queryByText('App registered automatically')).toBeNull();
      expect(within(card(name)).queryByText('Client credentials set')).toBeNull();
    }
  });

  it('offers Client credentials for a provider with a stored client only', async () => {
    renderPage({
      listProviders: vi
        .fn()
        .mockResolvedValue(
          providerCatalog([
            discoveredProvider({ id: 'a', display_name: 'Dyn', client_source: 'dynamic' }),
            discoveredProvider({ id: 'b', display_name: 'Man', client_source: 'manual' }),
            discoveredProvider({ id: 'c', display_name: 'Uns', client_source: 'unset' }),
            discoveredProvider({ id: 'd', display_name: 'Env', client_source: 'env' }),
            provider({ id: 'e', display_name: 'Decl' }),
          ]),
        ),
    });
    await screen.findByText('Dyn', { selector: 'strong' });
    await waitFor(() => {
      expect(
        within(card('Dyn')).getByRole('button', { name: 'Client credentials' }),
      ).toBeInTheDocument();
    });
    expect(
      within(card('Man')).getByRole('button', { name: 'Client credentials' }),
    ).toBeInTheDocument();
    expect(
      within(card('Uns')).getByRole('button', { name: 'Client credentials' }),
    ).toBeInTheDocument();
    expect(within(card('Env')).queryByRole('button', { name: 'Client credentials' })).toBeNull();
    expect(within(card('Decl')).queryByRole('button', { name: 'Client credentials' })).toBeNull();
  });

  it('opens the client credentials dialog from the card and shows the saved notice', async () => {
    const user = userEvent.setup();
    renderPage({
      listProviders: vi
        .fn()
        .mockResolvedValue(providerCatalog([discoveredProvider({ client_source: 'unset' })])),
      discoverServer: vi.fn().mockResolvedValue(discovered()),
      setProviderClient: vi.fn().mockResolvedValue({
        provider: discoveredProvider({ client_source: 'manual' }),
        fanout: null,
      }),
    });
    await screen.findByText('Remote files', { selector: 'strong' });
    await user.click(
      await within(card('Remote files')).findByRole('button', { name: 'Client credentials' }),
    );
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
    const removeProvider = vi
      .fn()
      .mockResolvedValue({ provider_id: 'remote_files', removed_clients: 1, fanout: null });
    renderPage({ listProviders, removeProvider });
    await screen.findByText('Remote files', { selector: 'strong' });
    await user.click(await within(card('Remote files')).findByRole('button', { name: 'Remove' }));
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
    await screen.findByText('Remote files', { selector: 'strong' });
    await user.click(await within(card('Remote files')).findByRole('button', { name: 'Remove' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove this server?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(screen.getByRole('dialog', { name: 'Remove this server?' })).toBeInTheDocument();
  });

  it('keeps the confirm open on the fleet report when a worker did not reload the removal', async () => {
    const user = userEvent.setup();
    renderPage({
      listProviders: vi.fn().mockResolvedValue(providerCatalog([discoveredProvider()])),
      removeProvider: vi.fn().mockResolvedValue({
        provider_id: 'remote_files',
        removed_clients: 1,
        fanout: NON_CONVERGED_FANOUT,
      }),
    });
    await screen.findByText('Remote files', { selector: 'strong' });
    await user.click(await within(card('Remote files')).findByRole('button', { name: 'Remove' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove this server?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Change saved, but 1 worker did not converge');
    expect(within(alert).getByText('serve-b')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers Remove only on a removable provider', async () => {
    renderPage({
      listProviders: vi
        .fn()
        .mockResolvedValue(
          providerCatalog([
            discoveredProvider({ id: 'a', display_name: 'Gone' }),
            discoveredProvider({ id: 'b', display_name: 'Kept', removable: false }),
          ]),
        ),
    });
    await screen.findByText('Gone', { selector: 'strong' });
    await waitFor(() => {
      expect(within(card('Gone')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });
    expect(within(card('Kept')).queryByRole('button', { name: 'Remove' })).toBeNull();
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
    renderPage({
      listConnections: vi.fn().mockResolvedValue({ items: [connection()], total: 1 }),
    });
    await screen.findByText('work');
    expect(screen.queryByText('Needs more permissions')).toBeNull();
    expect(screen.queryByText(SENTENCE)).toBeNull();
  });
});
