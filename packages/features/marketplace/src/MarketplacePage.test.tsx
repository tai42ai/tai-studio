/**
 * Behavioural tests for the marketplace browse page: the tri-state result set,
 * item rows grouped back under their listing, the URL-persisted facets (kind /
 * tag chips, category + sort selects, submit-applied text search), infinite
 * load-more with the computed has-next, the tab switch, and the drill-in that
 * replaces the browse chrome with the detail view.
 */
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  MarketplacePluginDetail,
  MarketplaceSearchPage,
  MarketplaceSearchQuery,
  MarketplaceSearchRow,
} from '@tai42/api-client';

import { MarketplacePage } from './MarketplacePage';
import { renderWithLiveUrl, renderWithProviders, type StubApiClient } from './test-utils';

function row(overrides: Partial<MarketplaceSearchRow> = {}): MarketplaceSearchRow {
  return {
    item: { kind: 'tool', name: 'uuid', description: 'Generate a UUID.', tags: ['uuid'] },
    ref: 'tai42/toolbox',
    namespace: 'tai42',
    name: 'toolbox',
    display_name: 'Toolbox',
    icon_url: null,
    package: 'tai42-toolbox',
    description: 'A box of tools.',
    categories: ['productivity'],
    tags: ['cli'],
    trust_tier: 'official',
    pricing: 'free',
    latest_version: '1.2.0',
    downloads: 1234,
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function pageOf(
  items: MarketplaceSearchRow[],
  meta: Partial<Pick<MarketplaceSearchPage, 'total' | 'page' | 'page_size'>> = {},
): MarketplaceSearchPage {
  return {
    items,
    total: meta.total ?? items.length,
    page: meta.page ?? 1,
    page_size: meta.page_size ?? 20,
  };
}

function detailFixture(): MarketplacePluginDetail {
  return {
    namespace: 'tai42',
    name: 'toolbox',
    display_name: 'Toolbox',
    icon_url: null,
    package: 'tai42-toolbox',
    description: 'A box of tools.',
    readme_md: null,
    license: null,
    homepage_url: null,
    repository_url: null,
    categories: [],
    tags: [],
    trust_tier: 'official',
    pricing: 'free',
    downloads: 1,
    latest: null,
    versions: [],
  };
}

/** A promise that never settles, for exercising the pending branch. */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** Browse-only reads: the search page + the category and kind facets' own lists. */
function browseReads(
  page: MarketplaceSearchPage,
  categories: string[] = ['productivity'],
  kinds: string[] = ['tool', 'agent'],
): StubApiClient {
  return {
    searchMarketplace: vi.fn().mockResolvedValue(page),
    listMarketplaceCategories: vi.fn().mockResolvedValue(categories),
    listMarketplaceKinds: vi.fn().mockResolvedValue(kinds),
  };
}

describe('MarketplacePage — page header', () => {
  it('renders the Administration eyebrow above the verbatim Marketplace h1', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, { client: browseReads(pageOf([row()])) });
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
      client: browseReads(pageOf([row({ downloads: 1234, latest_version: '1.2.0' })])),
    });

    // The "Recently updated" sort orders by exactly this timestamp, so both the
    // version and the recency must be visible on the card.
    expect(await screen.findByText('1.2.0')).toBeInTheDocument();
    expect(screen.getByText(/1234 downloads · Updated/)).toBeInTheDocument();
  });

  it('omits the version badge when latest_version is null but still shows recency', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row({ latest_version: null })])),
    });

    await screen.findByText('A box of tools.');
    expect(screen.queryByText('1.2.0')).not.toBeInTheDocument();
    expect(screen.getByText(/downloads · Updated/)).toBeInTheDocument();
  });
});

describe('MarketplacePage — premium badge + mcp-server kind', () => {
  it('renders the premium badge only when the row is premium', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row({ premium: true })])),
    });
    expect(await screen.findByText('Premium')).toBeInTheDocument();
  });

  it('shows no premium badge when the flag is false or absent', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row({ premium: false })])),
    });
    await screen.findByText('A box of tools.');
    expect(screen.queryByText('Premium')).toBeNull();
  });

  it('shows no premium badge when the flag is absent (nullish wire shape)', async () => {
    // premium is z.boolean().nullish(): an ABSENT flag is a real wire shape, distinct
    // from an explicit false — the base row omits the key entirely. Neither may badge.
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row()])),
    });
    await screen.findByText('A box of tools.');
    expect(screen.queryByText('Premium')).toBeNull();
  });

  it('renders a new mcp-server kind verbatim in the facet and the item badge', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(
        pageOf([
          row({
            item: {
              kind: 'mcp-server',
              name: 'postgres',
              description: 'A Postgres MCP server.',
              tags: [],
            },
          }),
        ]),
        ['productivity'],
        ['tool', 'agent', 'mcp-server'],
      ),
    });
    // The facet chip is served vocabulary (no client enum); the item badge renders
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
    renderWithProviders(<MarketplacePage search={{}} />, { client: browseReads(pageOf([])) });
    expect(await screen.findByText('No plugins match')).toBeInTheDocument();
  });
});

describe('MarketplacePage — grouping', () => {
  it('groups two item rows of one listing into a single plugin card', async () => {
    const rows = [
      row({
        item: { kind: 'tool', name: 'uuid', description: 'Generate a UUID.', tags: ['uuid'] },
      }),
      row({
        item: { kind: 'agent', name: 'summarizer', description: 'Summarize text.', tags: [] },
      }),
    ];
    renderWithProviders(<MarketplacePage search={{}} />, { client: browseReads(pageOf(rows)) });

    expect(await screen.findByText('Generate a UUID.')).toBeInTheDocument();
    expect(screen.getByText('Summarize text.')).toBeInTheDocument();
    // one listing → one card → one title link and one downloads/recency stat line
    expect(screen.getAllByRole('link', { name: 'Toolbox' })).toHaveLength(1);
    expect(screen.getByText(/1234 downloads · Updated/)).toBeInTheDocument();
    // a single page whose page*page_size >= total shows no load-more
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('caps item rows per card and folds the rest into a detail link', async () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      row({
        item: {
          kind: 'tool',
          name: `tool-${String(i)}`,
          description: `Tool ${String(i)}.`,
          tags: [],
        },
      }),
    );
    renderWithProviders(<MarketplacePage search={{}} />, { client: browseReads(pageOf(rows)) });

    expect(await screen.findByText('Tool 0.')).toBeInTheDocument();
    expect(screen.getByText('Tool 3.')).toBeInTheDocument();
    // beyond the cap of 4, later items are not rendered as rows
    expect(screen.queryByText('Tool 4.')).toBeNull();
    // the overflow leads to the plugin detail via a "+N more" link
    expect(screen.getByRole('link', { name: '+2 more' })).toBeInTheDocument();
  });
});

describe('MarketplacePage — kind chips', () => {
  it('navigates with the kind set when a chip is clicked', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row()])),
    });
    await user.click(await screen.findByRole('button', { name: 'tool' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', { kind: 'tool' });
  });

  it('clears the kind when the active chip is clicked', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{ kind: 'tool' }} />, {
      client: browseReads(pageOf([row()])),
    });
    await user.click(await screen.findByRole('button', { name: 'tool' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', {});
  });

  it('renders a stale URL kind absent from the served vocabulary as an active chip', async () => {
    // `agent` is not in the served list, yet the URL selects it: it is appended so
    // it still renders as a clearable active chip.
    renderWithProviders(<MarketplacePage search={{ kind: 'agent' }} />, {
      client: browseReads(pageOf([row()]), ['productivity'], ['tool']),
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
        pageOf([row()]),
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
      searchMarketplace: vi.fn().mockResolvedValue(pageOf([row()])),
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
      client: browseReads(pageOf([row()])),
    });
    await user.click(await screen.findByRole('button', { name: 'uuid' }));
    expect(first.navigate).toHaveBeenCalledWith('marketplace', { tags: ['uuid'] });
    first.unmount();

    const second = renderWithProviders(<MarketplacePage search={{ tags: ['uuid'] }} />, {
      client: browseReads(pageOf([row()])),
    });
    await user.click(await screen.findByRole('button', { name: 'uuid' }));
    expect(second.navigate).toHaveBeenCalledWith('marketplace', {});
  });
});

describe('MarketplacePage — category and sort', () => {
  it('navigates with the category selected from the registry list', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row()]), ['productivity', 'devtools']),
    });
    await screen.findByText('A box of tools.');

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'devtools' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', { category: 'devtools' });
  });

  it('offers a stale URL category that is absent from the registry list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketplacePage search={{ category: 'obscure' }} />, {
      client: browseReads(pageOf([row()]), ['productivity']),
    });
    await screen.findByText('A box of tools.');

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    expect(await screen.findByRole('option', { name: 'obscure' })).toBeInTheDocument();
  });

  it('renders an inline error for the category facet while results still render', async () => {
    const client: StubApiClient = {
      searchMarketplace: vi.fn().mockResolvedValue(pageOf([row()])),
      listMarketplaceCategories: vi.fn().mockRejectedValue(new Error('boom: categories')),
    };
    renderWithProviders(<MarketplacePage search={{}} />, { client });

    expect(await screen.findByText('A box of tools.')).toBeInTheDocument();
    expect(await screen.findByText('boom: categories')).toBeInTheDocument();
  });

  it('names the default most-downloaded without a query and navigates a non-default sort', async () => {
    const user = userEvent.setup();
    const withoutQuery = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row()])),
    });
    await screen.findByText('A box of tools.');
    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    // No query → default IS downloads, so the default option says so and there is
    // no separate downloads option and no relevance option.
    expect(await screen.findByRole('option', { name: 'Most downloaded' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Relevance' })).toBeNull();
    await user.click(screen.getByRole('option', { name: 'Recently updated' }));
    expect(withoutQuery.navigate).toHaveBeenCalledWith('marketplace', { sort: 'updated' });
    withoutQuery.unmount();

    const withQuery = renderWithProviders(<MarketplacePage search={{ q: 'uuid' }} />, {
      client: browseReads(pageOf([row()])),
    });
    await screen.findByText('A box of tools.');
    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    // A query → default IS relevance; downloads is now an explicit choice.
    expect(await screen.findByRole('option', { name: 'Relevance' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Most downloaded' }));
    expect(withQuery.navigate).toHaveBeenCalledWith('marketplace', {
      q: 'uuid',
      sort: 'downloads',
    });
  });
});

describe('MarketplacePage — text search', () => {
  it('applies the query on submit, not on every keystroke', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row()])),
    });
    await screen.findByText('A box of tools.');

    await user.type(screen.getByLabelText('Search'), 'uuid');
    expect(navigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', { q: 'uuid' });
  });

  it('keeps the keyboard caret in the search box when submit commits (WCAG 2.4.3)', async () => {
    const user = userEvent.setup();
    const searchMarketplace = vi.fn(() => Promise.resolve(pageOf([row()])));
    renderWithLiveUrl<'marketplace'>((search) => <MarketplacePage search={search} />, {
      client: { ...browseReads(pageOf([row()])), searchMarketplace },
      initialSearch: {},
    });
    await screen.findByText('A box of tools.');

    // The node identity taken BEFORE the commit is the whole point: a box remounted
    // on the query it just wrote renders an input that looks identical and holds the
    // same value, while the one the operator was typing into is detached.
    const input = screen.getByLabelText('Search');
    await user.type(input, 'uuid{Enter}');

    // The commit landed: the query reached the search read.
    await waitFor(() => {
      expect(searchMarketplace).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'uuid' }),
        expect.anything(),
      );
    });
    expect(input.isConnected).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue('uuid');
  });

  it('re-seeds the search draft when the url changes underneath it', async () => {
    // The other half of the contract the remount `key` used to carry: a query
    // arriving WITHOUT a local edit (browser back/forward) still overwrites the
    // draft, so the box never states a query the results are not for.
    const client = browseReads(pageOf([row()]));
    function Rerenderable({ q }: { readonly q?: string }): ReactElement {
      return <MarketplacePage search={{ q }} />;
    }
    const { rerender } = renderWithProviders(<Rerenderable />, { client });
    await screen.findByText('A box of tools.');
    expect(screen.getByLabelText('Search')).toHaveValue('');

    rerender(<Rerenderable q="uuid" />);
    expect(screen.getByLabelText('Search')).toHaveValue('uuid');
  });
});

describe('MarketplacePage — load more', () => {
  it('shows the button when has-next and appends the next page', async () => {
    const user = userEvent.setup();
    const searchMarketplace = vi.fn((query?: MarketplaceSearchQuery) =>
      Promise.resolve(
        query?.page === 2
          ? pageOf([row({ ref: 'other/plugin', name: 'plugin', display_name: 'Other' })], {
              total: 2,
              page: 2,
              page_size: 1,
            })
          : pageOf([row()], { total: 2, page: 1, page_size: 1 }),
      ),
    );
    const client: StubApiClient = {
      searchMarketplace,
      listMarketplaceCategories: vi.fn().mockResolvedValue([]),
      listMarketplaceKinds: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<MarketplacePage search={{}} />, { client });

    const loadMore = await screen.findByRole('button', { name: 'Load more' });
    await user.click(loadMore);

    await waitFor(() => {
      // Two cards → two title links (each single-item card, so no "+N more").
      expect(screen.getAllByRole('link')).toHaveLength(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    });
  });

  it('keeps the loaded rows and shows an inline retry when a Load-more fetch fails', async () => {
    const user = userEvent.setup();
    let page2Calls = 0;
    const searchMarketplace = vi.fn((query?: MarketplaceSearchQuery) => {
      if (query?.page === 2) {
        page2Calls += 1;
        return page2Calls === 1
          ? Promise.reject(new Error('boom: page 2'))
          : Promise.resolve(
              pageOf(
                [
                  row({
                    ref: 'other/plugin',
                    name: 'plugin',
                    display_name: 'Other',
                    item: { kind: 'agent', name: 'sum', description: 'Summarize text.', tags: [] },
                  }),
                ],
                { total: 2, page: 2, page_size: 1 },
              ),
            );
      }
      return Promise.resolve(pageOf([row()], { total: 2, page: 1, page_size: 1 }));
    });
    const client: StubApiClient = {
      searchMarketplace,
      listMarketplaceCategories: vi.fn().mockResolvedValue([]),
      listMarketplaceKinds: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<MarketplacePage search={{}} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    // the already-loaded first page is NOT blanked by the failure
    expect(await screen.findByText('A box of tools.')).toBeInTheDocument();
    // the failure surfaces inline with a retry, not as a top-level error state
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: page 2');
    const retry = within(alert).getByRole('button', { name: 'Retry load more' });

    // retrying recovers: the next page appends and the inline error clears
    await user.click(retry);
    await waitFor(() => {
      expect(screen.getByText('Summarize text.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('MarketplacePage — background refetch', () => {
  it('keeps the loaded rows and shows an inline refresh error when a background refetch fails', async () => {
    const user = userEvent.setup();
    let searchCalls = 0;
    const searchMarketplace = vi.fn(() => {
      searchCalls += 1;
      // the initial load and any later retry succeed; the background refetch
      // (the second call) fails.
      return searchCalls === 2
        ? Promise.reject(new Error('boom: refetch'))
        : Promise.resolve(pageOf([row()]));
    });
    const client: StubApiClient = {
      searchMarketplace,
      listMarketplaceCategories: vi.fn().mockResolvedValue([]),
      listMarketplaceKinds: vi.fn().mockResolvedValue([]),
    };
    const { queryClient } = renderWithProviders(<MarketplacePage search={{}} />, { client });

    expect(await screen.findByText('A box of tools.')).toBeInTheDocument();

    // a background refetch (not a Load-more) rejects
    await act(async () => {
      await queryClient.refetchQueries();
    });

    // the already-loaded rows are NOT blanked by the failed refetch
    expect(screen.getByText('A box of tools.')).toBeInTheDocument();
    // the failure surfaces inline as a loud refresh notice with a retry
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not refresh results');
    expect(alert).toHaveTextContent('boom: refetch');
    const retry = within(alert).getByRole('button', { name: 'Retry' });

    // retry re-calls refetch and recovers: the rows stay and the notice clears
    await user.click(retry);
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
    expect(searchMarketplace).toHaveBeenCalledTimes(3);
    expect(screen.getByText('A box of tools.')).toBeInTheDocument();
  });
});

describe('MarketplacePage — recency, sort selection, and cleared facets', () => {
  it('renders an unparseable updated_at verbatim rather than swallowing it', async () => {
    renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row({ updated_at: 'not-a-date' })])),
    });
    // A value Date cannot parse is shown as-is on the recency line.
    expect(await screen.findByText(/Updated not-a-date/)).toBeInTheDocument();
  });

  it('commits an empty search as a cleared query on submit', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row()])),
    });
    await screen.findByText('A box of tools.');
    // Submitting with a blank box drops `q` entirely (no empty-string query).
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', {});
  });

  it('clears the category back to the default when All categories is chosen', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(
      <MarketplacePage search={{ category: 'productivity' }} />,
      { client: browseReads(pageOf([row()]), ['productivity', 'devtools']) },
    );
    await screen.findByText('A box of tools.');
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'All categories' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', {});
  });

  it('shows the Name sort as selected and clears it back to the default', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{ sort: 'name' }} />, {
      client: browseReads(pageOf([row()])),
    });
    await screen.findByText('A box of tools.');
    // A `name` sort resolves to the Name option, not the default sentinel.
    const sortBox = screen.getByRole('combobox', { name: 'Sort' });
    expect(sortBox).toHaveTextContent('Name');
    await user.click(sortBox);
    // Choosing the default option (Most downloaded, no query) drops `sort` entirely.
    await user.click(await screen.findByRole('option', { name: 'Most downloaded' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', {});
  });

  it('shows Most downloaded as the selected sort when a query forces the download order', async () => {
    renderWithProviders(<MarketplacePage search={{ q: 'uuid', sort: 'downloads' }} />, {
      client: browseReads(pageOf([row()])),
    });
    await screen.findByText('A box of tools.');
    // With a query, an explicit `downloads` sort resolves to the Most downloaded option.
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Most downloaded');
  });
});

describe('MarketplacePage — load-more pending label', () => {
  it('shows a disabled Loading label while the next page is in flight', async () => {
    const user = userEvent.setup();
    const searchMarketplace = vi.fn((query?: MarketplaceSearchQuery) =>
      query?.page === 2
        ? pending<MarketplaceSearchPage>()
        : Promise.resolve(pageOf([row()], { total: 2, page: 1, page_size: 1 })),
    );
    const client: StubApiClient = {
      searchMarketplace,
      listMarketplaceCategories: vi.fn().mockResolvedValue([]),
      listMarketplaceKinds: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<MarketplacePage search={{}} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    // While page 2 is unresolved the control flips to a disabled pending label.
    const loading = await screen.findByRole('button', { name: 'Loading…' });
    expect(loading).toBeDisabled();
  });
});

describe('MarketplacePage — tabs and drill-in', () => {
  it('switches to the installed tab', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(pageOf([row()])),
    });
    await user.click(await screen.findByRole('tab', { name: 'Installed' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', { tab: 'installed' });
  });

  it('clears the tab param when switching back to the browse tab', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      ...browseReads(pageOf([row()])),
      listInstalledMarketplacePlugins: vi
        .fn()
        .mockResolvedValue({ installed: [], quarantined: [] }),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue({ advisories: [], fetched_at: 'x' }),
    };
    const { navigate } = renderWithProviders(<MarketplacePage search={{ tab: 'installed' }} />, {
      client,
    });
    // Browse is the default tab, so selecting it drops `tab` rather than pinning it.
    await user.click(await screen.findByRole('tab', { name: 'Browse' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', {});
  });

  it('renders the installed tab content when the installed tab is active', async () => {
    const client: StubApiClient = {
      listInstalledMarketplacePlugins: vi
        .fn()
        .mockResolvedValue({ installed: [], quarantined: [] }),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue({ advisories: [], fetched_at: 'x' }),
    };
    renderWithProviders(<MarketplacePage search={{ tab: 'installed' }} />, { client });
    expect(await screen.findByText('No marketplace plugins installed')).toBeInTheDocument();
  });

  it('renders the detail view instead of the browse chrome when a plugin is selected', async () => {
    const client: StubApiClient = {
      getMarketplacePlugin: vi.fn().mockResolvedValue(detailFixture()),
      listInstalledMarketplacePlugins: vi
        .fn()
        .mockResolvedValue({ installed: [], quarantined: [] }),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue({ advisories: [], fetched_at: 'x' }),
    };
    renderWithProviders(<MarketplacePage search={{ plugin: 'tai42/toolbox' }} />, { client });
    expect(await screen.findByText('Toolbox')).toBeInTheDocument();
    // browse chrome (the tablist) is not rendered in the detail view
    expect(screen.queryByRole('tab', { name: 'Browse' })).toBeNull();
  });

  it('clears the plugin on back while preserving the other filters', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      getMarketplacePlugin: vi.fn().mockResolvedValue(detailFixture()),
      listInstalledMarketplacePlugins: vi
        .fn()
        .mockResolvedValue({ installed: [], quarantined: [] }),
      getMarketplaceAdvisories: vi.fn().mockResolvedValue({ advisories: [], fetched_at: 'x' }),
    };
    const { navigate } = renderWithProviders(
      <MarketplacePage search={{ q: 'uuid', plugin: 'tai42/toolbox' }} />,
      { client },
    );
    await screen.findByText('Toolbox');
    await user.click(screen.getByRole('button', { name: 'Back to marketplace' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', { q: 'uuid' });
  });
});
