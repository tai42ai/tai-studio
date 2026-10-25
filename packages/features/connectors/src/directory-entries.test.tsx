/**
 * The Connectors directory's entries: a provider card by its connection count and
 * each connection's own state and controls, a configured server's Fix and overflow
 * menu by the session's grants, a marketplace listing's Connect or its no-grant line,
 * the list view's cells, and the marketplace paging with its dedupe.
 */
import {
  type ApiClient,
  ApiError,
  type ConnectionView,
  type MarketplaceSearchQuery,
  type MarketplaceSearchRow,
  type MeProjection,
} from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  connection,
  fullProjection,
  listing,
  listingDetail,
  mcpEntry,
  preservedManifest,
  provider,
  providerCatalog,
  searchPage,
} from './test-utils';
import {
  editorProjection,
  entryKeys,
  findCard,
  findRow,
  readerProjection,
  RELOAD_ROUTE,
  renderPage,
  showCards,
  START_ROUTE,
} from './test-utils-directory';

type User = ReturnType<typeof userEvent.setup>;

const ACME = provider({ id: 'acme_mail', display_name: 'Acme', description: 'Mail and calendar.' });
const ACME_KEY = 'provider:acme_mail';
const CANNOT_CONNECT =
  'This session cannot connect apps. Connecting needs write access to POST /api/connectors/connections/start; ask an administrator to grant it.';
const INSTALL_NO_GRANT_LINE = /^This session cannot install from the marketplace\./;

afterEach(() => {
  localStorage.clear();
});

function acmeConnection(alias: string, overrides: Partial<ConnectionView> = {}): ConnectionView {
  return connection({
    connection_id: `c-${alias}`,
    provider_id: 'acme_mail',
    alias,
    ...overrides,
  });
}

/** The page with the Acme provider, its connections, and one managed entry per connection. */
function renderAcme(
  connections: ConnectionView[],
  {
    bound = {},
    failed = [],
    projection = fullProjection(),
    extra = {},
  }: {
    bound?: Record<string, string[]>;
    failed?: { title: string; category: string; message: string }[];
    projection?: MeProjection;
    extra?: Parameters<typeof renderPage>[0];
  } = {},
) {
  return renderPage(
    {
      listProviders: vi.fn().mockResolvedValue(providerCatalog([ACME])),
      listConnections: vi.fn().mockResolvedValue({ items: connections, total: connections.length }),
      getManifestPreserved: vi.fn().mockResolvedValue(
        preservedManifest(
          connections.map((c) =>
            mcpEntry(`acme_mail_${c.alias}`, {
              connectionId: c.connection_id,
              providerId: 'acme_mail',
            }),
          ),
        ),
      ),
      getMcpStatus: vi.fn().mockResolvedValue({ bound, failed }),
      ...extra,
    },
    projection,
  );
}

function connectionRows(container: HTMLElement): HTMLElement[] {
  const list = within(container).getByRole('list', { name: 'Connections to Acme' });
  return within(list).getAllByRole('listitem');
}

function isPrimary(button: HTMLElement): boolean {
  return button.classList.contains('tai-btn-primary');
}

async function acmeCard(user: User): Promise<HTMLElement> {
  await showCards(user);
  return findCard(ACME_KEY);
}

describe('A provider card by its connections', () => {
  it('reads Not connected with a primary Connect when there is no connection', async () => {
    const user = userEvent.setup();
    renderAcme([]);
    const card = await acmeCard(user);
    expect(await within(card).findByText('Not connected')).toBeVisible();
    expect(isPrimary(within(card).getByRole('button', { name: 'Connect' }))).toBe(true);
  });

  it('counts the mounted tools of one connection and offers Add another account', async () => {
    const user = userEvent.setup();
    renderAcme([acmeConnection('work')], { bound: { acme_mail_work: ['send', 'read'] } });
    const card = await acmeCard(user);
    expect(await within(card).findByText('1 connected · 2 tools mounted')).toBeVisible();
    const rows = connectionRows(card);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('work2 tools mounted');
    expect(within(card).getByRole('button', { name: 'Add another account' })).toBeVisible();
  });

  it('draws one row per connection, each counted from its own titles', async () => {
    const user = userEvent.setup();
    renderAcme([acmeConnection('work'), acmeConnection('personal')], {
      bound: { acme_mail_work: ['send', 'read'], acme_mail_personal: ['send'] },
    });
    const card = await acmeCard(user);
    expect(await within(card).findByText('2 connected · 3 tools mounted')).toBeVisible();
    const [work, personal] = connectionRows(card);
    expect(work).toHaveTextContent('2 tools mounted');
    expect(personal).toHaveTextContent('1 tools mounted');
  });

  it('opens Pick tools on one connection only, with no way back to Connect', async () => {
    const user = userEvent.setup();
    const listMcpAdvertisedTools = vi.fn((title: string) =>
      Promise.resolve({ title, include: [], exclude: [], tools: [], unadvertised: [] }),
    );
    renderAcme([acmeConnection('work'), acmeConnection('personal')], {
      bound: { acme_mail_work: ['send'], acme_mail_personal: ['send'] },
      extra: { listMcpAdvertisedTools },
    });
    const card = await acmeCard(user);
    await user.click(await within(card).findByRole('button', { name: 'Pick tools for personal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pick tools: Acme (personal)' });
    const nav = within(dialog).getByRole('navigation', { name: 'Connection steps' });
    expect(within(nav).queryByRole('button')).toBeNull();
    await waitFor(() => {
      expect(listMcpAdvertisedTools).toHaveBeenCalledTimes(1);
    });
    expect(listMcpAdvertisedTools).toHaveBeenCalledWith('acme_mail_personal', expect.anything());
  });

  it('opens the flow at Connect from Add another account', async () => {
    const user = userEvent.setup();
    renderAcme([acmeConnection('work')], { bound: { acme_mail_work: ['send'] } });
    const card = await acmeCard(user);
    await user.click(await within(card).findByRole('button', { name: 'Add another account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Connect Acme' });
    const nav = within(dialog).getByRole('navigation', { name: 'Connection steps' });
    expect(nav.querySelector('[aria-current="step"]')).toHaveTextContent('Connect');
  });

  it('flags a connection that needs a reconnect and sends Fix to its detail', async () => {
    const user = userEvent.setup();
    const { nav } = renderAcme([
      acmeConnection('work', { auth_health_state: 'reconnect_required' }),
    ]);
    const card = await acmeCard(user);
    expect(await within(card).findByText('Needs attention')).toBeVisible();
    expect(connectionRows(card)[0]).toHaveTextContent('Reconnect required');
    await user.click(within(card).getByRole('button', { name: 'Fix work' }));
    expect(nav.navigate).toHaveBeenCalledWith('connectors', { connection: 'c-work' });
  });

  it('shows a failed title on its connection and opens Connect for that title from Fix', async () => {
    const user = userEvent.setup();
    renderAcme([acmeConnection('work')], {
      failed: [{ title: 'acme_mail_work', category: 'auth', message: 'denied' }],
      projection: editorProjection([START_ROUTE, RELOAD_ROUTE]),
    });
    const card = await acmeCard(user);
    expect(await within(card).findByText('Failed: auth')).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'Fix work' }));
    const dialog = await screen.findByRole('dialog', { name: 'Connect acme_mail_work' });
    expect(within(dialog).getByText('Failed: auth')).toBeVisible();
  });

  it('draws no Fix on a failed title for a session that cannot reload', async () => {
    const user = userEvent.setup();
    renderAcme([acmeConnection('work')], {
      failed: [{ title: 'acme_mail_work', category: 'auth', message: 'denied' }],
      projection: editorProjection(),
    });
    const card = await acmeCard(user);
    expect(await within(card).findByText('Failed: auth')).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Fix work' })).toBeNull();
  });

  it('shows three of four connections until Show all expands the list in place', async () => {
    const user = userEvent.setup();
    renderAcme(['a', 'b', 'c', 'd'].map((alias) => acmeConnection(alias)));
    const card = await acmeCard(user);
    const more = await within(card).findByRole('button', { name: 'Show all 4 connections' });
    expect(connectionRows(card)).toHaveLength(3);
    await user.click(more);
    expect(connectionRows(card)).toHaveLength(4);
    expect(within(card).getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it.each<[string, Parameters<typeof renderPage>[0], MeProjection]>([
    [
      'refused',
      { listConnections: vi.fn().mockRejectedValue(new ApiError('forbidden', 403)) },
      readerProjection(['providers', 'manifest', 'status', 'installed'], [START_ROUTE]),
    ],
    ['failed', { listConnections: vi.fn().mockRejectedValue(new Error('boom')) }, fullProjection()],
  ])(
    'reads Connection status not available when the connections read is %s',
    async (_name, extra, projection) => {
      const user = userEvent.setup();
      renderPage(
        { listProviders: vi.fn().mockResolvedValue(providerCatalog([ACME])), ...extra },
        projection,
      );
      const card = await acmeCard(user);
      expect(await within(card).findByText('Connection status not available')).toBeVisible();
      expect(within(card).queryByRole('list', { name: 'Connections to Acme' })).toBeNull();
      expect(isPrimary(within(card).getByRole('button', { name: 'Connect' }))).toBe(false);
    },
  );

  it('draws no connect control for a session without the connect route and names it', async () => {
    const user = userEvent.setup();
    renderAcme([acmeConnection('work')], { projection: editorProjection([]) });
    const card = await acmeCard(user);
    await within(card).findByText(/1 connected/);
    expect(within(card).queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(within(card).queryByRole('button', { name: 'Add another account' })).toBeNull();
    expect(screen.getByText(CANNOT_CONNECT)).toBeVisible();
  });

  it('holds the same connection rows in the list view Status cell', async () => {
    renderAcme([acmeConnection('work')], { bound: { acme_mail_work: ['send'] } });
    const row = await findRow(ACME_KEY);
    const status = within(row).getAllByRole('cell')[1];
    if (status === undefined) throw new Error('no Status cell');
    expect(await within(status).findByText('1 connected · 1 tools mounted')).toBeVisible();
    expect(connectionRows(status)).toHaveLength(1);
  });
});

/** The page with one configured server `relay` that failed on the answering worker. */
function renderFailedServer(projection: MeProjection) {
  return renderPage(
    {
      getManifestPreserved: vi.fn().mockResolvedValue(preservedManifest([mcpEntry('relay')])),
      getMcpStatus: vi.fn().mockResolvedValue({
        bound: {},
        failed: [{ title: 'relay', category: 'transport', message: 'refused' }],
      }),
    },
    projection,
  );
}

const RELOAD_NO_GRANT =
  'This session cannot reload relay. Reloading needs write access to POST /api/mcp-status/{title}/reload; ask an administrator to grant it.';

describe('A configured server by the grants', () => {
  it('names the reload route in place of Fix, in the card and the list Action cell', async () => {
    const user = userEvent.setup();
    renderFailedServer(editorProjection());
    const row = await findRow('server:relay');
    expect(await within(row).findByText(RELOAD_NO_GRANT)).toBeVisible();
    expect(within(row).queryByRole('button', { name: 'Fix' })).toBeNull();
    await showCards(user);
    const card = await findCard('server:relay');
    expect(within(card).getByText(RELOAD_NO_GRANT)).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Fix' })).toBeNull();
  });

  it('offers Reload and no Deregister in the overflow of an editor that may reload', async () => {
    const user = userEvent.setup();
    renderFailedServer(editorProjection([START_ROUTE, RELOAD_ROUTE]));
    const row = await findRow('server:relay');
    await user.click(await within(row).findByRole('button', { name: 'Actions for relay' }));
    const menu = await screen.findByRole('menu', { name: 'Actions for relay' });
    expect(within(menu).getByRole('menuitem', { name: 'Reload' })).toBeVisible();
    expect(within(menu).queryByRole('menuitem', { name: 'Deregister' })).toBeNull();
  });

  it('offers Reload and Deregister in the overflow of an administrator', async () => {
    const user = userEvent.setup();
    renderFailedServer(fullProjection());
    const row = await findRow('server:relay');
    await user.click(await within(row).findByRole('button', { name: 'Actions for relay' }));
    const menu = await screen.findByRole('menu', { name: 'Actions for relay' });
    expect(within(menu).getByRole('menuitem', { name: 'Reload' })).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: 'Deregister' })).toBeVisible();
  });
});

const BOTH_KINDS = listing({
  kinds: [
    { kind: 'connector', count: 1, names: ['acme_mail'] },
    { kind: 'mcp-server', count: 1, names: ['acme_mail_server'] },
  ],
});

function searchByKind(
  pages: Record<string, MarketplaceSearchRow[][]>,
): ApiClient['searchMarketplace'] {
  return vi.fn(({ kind = '', page = 1 }: MarketplaceSearchQuery = {}) => {
    const byPage = pages[kind] ?? [[]];
    const total = byPage.reduce((sum, rows) => sum + rows.length, 0);
    return Promise.resolve(
      searchPage(byPage[page - 1] ?? [], { page, total, pageSize: byPage[0]?.length ?? 1 }),
    );
  });
}

describe('A marketplace listing', () => {
  it('names the install route in place of Connect for an editor, in the card and the list Action cell', async () => {
    const user = userEvent.setup();
    renderPage(
      { searchMarketplace: searchByKind({ connector: [[listing()]] }) },
      editorProjection(),
    );
    const row = await findRow('listing:acme/mail');
    expect(await within(row).findByText(INSTALL_NO_GRANT_LINE)).toHaveAttribute('role', 'status');
    expect(within(row).queryByRole('button', { name: 'Connect' })).toBeNull();
    await showCards(user);
    const card = await findCard('listing:acme/mail');
    expect(within(card).getByText(INSTALL_NO_GRANT_LINE)).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Connect' })).toBeNull();
  });

  it('opens the flow at the listing branch from Connect for an administrator', async () => {
    const user = userEvent.setup();
    const getMarketplacePlugin = vi
      .fn()
      .mockResolvedValue(listingDetail([{ kind: 'connector', name: 'acme_mail' }]));
    renderPage({
      searchMarketplace: searchByKind({ connector: [[listing()]] }),
      getMarketplacePlugin,
      previewMarketplaceInstall: vi.fn().mockResolvedValue({
        ref: 'acme/mail',
        version: '1.0.0',
        items: [],
        collisions: [],
        public_routes: [],
        new_public_routes: [],
        requires_public_acceptance: false,
        required_env: [],
        missing_env: [],
        delivery: 'package',
      }),
    });
    await showCards(user);
    const card = await findCard('listing:acme/mail');
    await user.click(within(card).getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('dialog', { name: 'Connect Acme Mail' })).toBeVisible();
    expect(await screen.findByRole('form', { name: 'Install plugin' })).toBeVisible();
    expect(getMarketplacePlugin).toHaveBeenCalledWith('acme', 'mail', expect.anything());
  });

  it('draws a listing found by both kind queries once', async () => {
    renderPage({
      searchMarketplace: searchByKind({ connector: [[BOTH_KINDS]], 'mcp-server': [[BOTH_KINDS]] }),
    });
    await findRow('listing:acme/mail');
    expect(entryKeys().filter((key) => key === 'listing:acme/mail')).toHaveLength(1);
  });

  it('still draws it once when Load more brings it from the other query', async () => {
    const user = userEvent.setup();
    const other = listing({ ref: 'acme/files', name: 'files', display_name: 'Acme Files' });
    const searchMarketplace = searchByKind({
      connector: [[other], [BOTH_KINDS]],
      'mcp-server': [[BOTH_KINDS]],
    });
    renderPage({ searchMarketplace });
    await findRow('listing:acme/mail');
    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    await waitFor(() => {
      expect(searchMarketplace).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'connector', page: 2 }),
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    });
    expect(entryKeys().filter((key) => key.startsWith('listing:'))).toEqual([
      'listing:acme/files',
      'listing:acme/mail',
    ]);
  });
});
