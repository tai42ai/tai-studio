import { type MarketplaceSearchPage } from '@tai42/api-client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MarketplacePage } from './MarketplacePage';
import {
  browseReads,
  pending,
  renderWithProviders,
  searchPage,
  searchRow,
  type StubApiClient,
} from './test-utils';

describe('MarketplacePage — page header', () => {
  it('renders the Administration eyebrow above the verbatim Marketplace h1', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    // The h1 keeps its exact title (DOM contract); the nav-section label is a
    // separate element above it, never folded into the heading's accessible name.
    const h1 = screen.getByRole('heading', { level: 1, name: 'Marketplace' });
    expect(h1).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
    await screen.findByText('A box of tools.');
  });
});

describe('MarketplacePage — plugin card version + recency', () => {
  it('renders the latest version and an updated-at recency line', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow({ downloads: 1234, latest_version: '1.2.0' })])),
    });

    // The "Recently updated" sort orders by exactly this timestamp, so both the
    // version and the recency must be visible on the card.
    expect(await screen.findByText('1.2.0')).toBeInTheDocument();
    expect(screen.getByText(/1234 downloads · Updated/)).toBeInTheDocument();
  });

  it('omits the version badge when latest_version is null but still shows recency', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow({ latest_version: null })])),
    });

    await screen.findByText('A box of tools.');
    expect(screen.queryByText('1.2.0')).not.toBeInTheDocument();
    expect(screen.getByText(/downloads · Updated/)).toBeInTheDocument();
  });
});

describe('MarketplacePage — whole-card open', () => {
  it('opens the detail from a click on the card body, not just the title link', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    // The description is a non-interactive region of the card. The whole card is the
    // affordance the interactive lift promises, so clicking it opens the same detail
    // the title link opens — the drill-in `plugin` search param for this row.
    await user.click(await screen.findByText('A box of tools.'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('marketplace', { plugin: 'tai42/toolbox' });
  });

  it('opens the detail exactly once from the title link (the card handler yields)', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    // The click lands on the nested title anchor; the card's open handler yields to
    // it (`closest('a')`) so exactly one navigation fires — the link's — never a
    // second from the wrapper. Same destination as the body click above.
    await user.click(await screen.findByRole('link', { name: 'Toolbox' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('marketplace', { plugin: 'tai42/toolbox' });
  });

  it('does not open when the click completes a text selection rather than an open intent', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    await screen.findByText('A box of tools.');
    // A press-drag that selects the card's text also fires a click. With an active
    // (non-collapsed) selection the handler reads a select gesture, not an open
    // intent, and yields — mirroring the ExplorerView precedent.
    const getSelection = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ isCollapsed: false } as unknown as Selection);
    await user.click(screen.getByText('A box of tools.'));
    expect(navigate).not.toHaveBeenCalled();
    getSelection.mockRestore();
  });
});

describe('MarketplacePage — premium badge + mcp-server kind', () => {
  it('renders the premium badge only when the row is premium', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow({ premium: true })])),
    });
    expect(await screen.findByText('Premium')).toBeInTheDocument();
  });

  it('shows no premium badge when the flag is false or absent', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow({ premium: false })])),
    });
    await screen.findByText('A box of tools.');
    expect(screen.queryByText('Premium')).toBeNull();
  });

  it('shows no premium badge when the flag is absent (nullish wire shape)', async () => {
    // premium is z.boolean().nullish(): an ABSENT flag is a real wire shape, distinct
    // from an explicit false — the base row omits the key entirely. Neither may badge.
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    await screen.findByText('A box of tools.');
    expect(screen.queryByText('Premium')).toBeNull();
  });

  it('renders a new mcp-server kind verbatim in the facet and the kind-summary badge', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(
        searchPage([searchRow({ kinds: [{ kind: 'mcp-server', count: 1, names: ['postgres'] }] })]),
        ['productivity'],
        ['tool', 'agent', 'mcp-server'],
      ),
    });
    // The facet chip is served vocabulary (no client enum); the kind badge renders
    // any string. Both surface the new kind with zero client-side kind logic.
    expect(await screen.findByRole('button', { name: 'mcp-server' })).toBeInTheDocument();
    expect(screen.getByText('mcp-server', { selector: '[data-variant]' })).toBeInTheDocument();
  });
});

describe('MarketplacePage — browse tri-state', () => {
  it('shows no cards while the search is pending', () => {
    const client: StubApiClient = {
      searchMarketplace: vi.fn(() => pending<MarketplaceSearchPage>()),
      listMarketplaceCategories: vi.fn().mockResolvedValue([]),
      listMarketplaceKinds: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<MarketplacePage search={{}} />, { client });
    expect(screen.queryByText('A box of tools.')).toBeNull();
  });

  it('shows a loud error with retry when the search fails', async () => {
    const client: StubApiClient = {
      searchMarketplace: vi.fn().mockRejectedValue(new Error('boom: search')),
      listMarketplaceCategories: vi.fn().mockResolvedValue([]),
      listMarketplaceKinds: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<MarketplacePage search={{}} />, { client });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: search');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, { client: browseReads(searchPage([])) });
    expect(await screen.findByText('No plugins match')).toBeInTheDocument();
  });
});

describe('MarketplacePage — kind summary', () => {
  it('renders one card per server row, each its own listing', async () => {
    const rows = [
      searchRow(),
      searchRow({ ref: 'other/plugin', name: 'plugin', display_name: 'Other' }),
    ];
    renderWithProviders(<MarketplacePage search={{}} />, { client: browseReads(searchPage(rows)) });

    // one row → one card → one title link; two rows → two cards
    expect(await screen.findByRole('link', { name: 'Toolbox' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Other' })).toBeInTheDocument();
    // a single page whose page*page_size >= total shows no load-more
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('renders a kind badge per kind, suffixing a count above one', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(
        searchPage([
          searchRow({
            kinds: [
              { kind: 'tool', count: 3, names: ['a', 'b', 'c'] },
              { kind: 'agent', count: 1, names: ['d'] },
            ],
          }),
        ]),
      ),
    });

    // count > 1 is suffixed `×{count}`; a single item shows the bare kind.
    expect(await screen.findByText('tool ×3', { selector: '[data-variant]' })).toBeInTheDocument();
    expect(screen.getByText('agent', { selector: '[data-variant]' })).toBeInTheDocument();
  });

  it('renders the kind badges in the row-served order', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(
        searchPage([
          searchRow({
            kinds: [
              { kind: 'agent', count: 2, names: ['a', 'b'] },
              { kind: 'tool', count: 5, names: ['c', 'd', 'e', 'f', 'g'] },
            ],
          }),
        ]),
      ),
    });

    await screen.findByText('A box of tools.');
    const kindGroup = screen.getByRole('group', { name: 'Capabilities' });
    const badgeOrder = within(kindGroup)
      .getAllByText(/./, { selector: '[data-variant]' })
      .map((badge) => badge.textContent);
    expect(badgeOrder).toEqual(['agent ×2', 'tool ×5']);
  });

  it('renders groups first, then names a listed channel kind, over counted kinds', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(
        searchPage([
          searchRow({
            groups: [{ name: 'onboarding', count: 3 }],
            kinds: [
              { kind: 'channel', count: 1, names: ['slack'] },
              { kind: 'tool', count: 2, names: ['a', 'b'] },
            ],
          }),
        ]),
      ),
    });

    await screen.findByText('A box of tools.');
    const kindGroup = screen.getByRole('group', { name: 'Capabilities' });
    const badgeOrder = within(kindGroup)
      .getAllByText(/./, { selector: '[data-variant]' })
      .map((badge) => badge.textContent);
    // Group leads with its count, then the channel item's name, then the counted tool.
    expect(badgeOrder).toEqual(['onboarding ×3', 'slack', 'tool ×2']);
  });
});

describe('MarketplacePage — kind chips', () => {
  it('navigates with the kind set when a chip is clicked', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    await user.click(await screen.findByRole('button', { name: 'tool' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', { kind: 'tool' });
  });

  it('clears the kind when the active chip is clicked', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{ kind: 'tool' }} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    await user.click(await screen.findByRole('button', { name: 'tool' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', {});
  });

  it('renders a stale URL kind absent from the served vocabulary as an active chip', async () => {
    // `agent` is not in the served list, yet the URL selects it: it is appended so
    // it still renders as a clearable active chip.
    renderWithProviders(<MarketplacePage search={{ kind: 'agent' }} />, {
      client: browseReads(searchPage([searchRow()]), ['productivity'], ['tool']),
    });
    const chip = await screen.findByRole('button', { name: 'agent' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the kind vocabulary served by the registry, not from loaded rows', async () => {
    // The loaded page carries only a `tool` row, yet the server-served kinds with
    // no rows are still offered — the chip set is the registry vocabulary, not
    // row-derived, and keeps the served catalog order.
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(
        searchPage([searchRow()]),
        ['productivity'],
        ['webhook-verifier', 'tool', 'middleware'],
      ),
    });
    await screen.findByText('A box of tools.');
    expect(screen.getByRole('button', { name: 'middleware' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'webhook-verifier' })).toBeInTheDocument();
    // The chips render in exactly the served catalog order (a deliberately
    // non-alphabetical vocabulary), not sorted or row-derived.
    const kindGroup = screen.getByRole('group', { name: 'Filter by kind' });
    const chipOrder = within(kindGroup)
      .getAllByRole('button')
      .map((chip) => chip.textContent);
    expect(chipOrder).toEqual(['webhook-verifier', 'tool', 'middleware']);
  });

  it('renders an inline error for the kind facet while results still render', async () => {
    const client: StubApiClient = {
      searchMarketplace: vi.fn().mockResolvedValue(searchPage([searchRow()])),
      listMarketplaceCategories: vi.fn().mockResolvedValue([]),
      listMarketplaceKinds: vi.fn().mockRejectedValue(new Error('boom: kinds')),
    };
    renderWithProviders(<MarketplacePage search={{}} />, { client });

    expect(await screen.findByText('A box of tools.')).toBeInTheDocument();
    expect(await screen.findByText('boom: kinds')).toBeInTheDocument();
  });
});

describe('MarketplacePage — tag chips', () => {
  it('adds and removes a tag from the multi-select', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    await user.click(await screen.findByRole('button', { name: 'cli' }));
    expect(first.navigate).toHaveBeenCalledWith('marketplace', { tags: ['cli'] });
    first.unmount();

    const second = renderWithProviders(<MarketplacePage search={{ tags: ['cli'] }} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    await user.click(await screen.findByRole('button', { name: 'cli' }));
    expect(second.navigate).toHaveBeenCalledWith('marketplace', {});
  });
});
