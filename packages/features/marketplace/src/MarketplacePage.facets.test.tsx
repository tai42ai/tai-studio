import { type MarketplaceSearchPage, type MarketplaceSearchQuery } from '@tai42/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MarketplacePage } from './MarketplacePage';
import {
  browseDetailFixture,
  browseReads,
  pending,
  renderWithLiveUrl,
  renderWithProviders,
  searchPage,
  searchRow,
  type StubApiClient,
} from './test-utils';

describe('MarketplacePage — category and sort', () => {
  it('navigates with the category selected from the registry list', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()]), ['productivity', 'devtools']),
    });
    await screen.findByText('A box of tools.');

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'devtools' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', { category: 'devtools' });
  });

  it('offers a stale URL category that is absent from the registry list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketplacePage search={{ category: 'obscure' }} />, {
      client: browseReads(searchPage([searchRow()]), ['productivity']),
    });
    await screen.findByText('A box of tools.');

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    expect(await screen.findByRole('option', { name: 'obscure' })).toBeInTheDocument();
  });

  it('renders an inline error for the category facet while results still render', async () => {
    const client: StubApiClient = {
      searchMarketplace: vi.fn().mockResolvedValue(searchPage([searchRow()])),
      listMarketplaceCategories: vi.fn().mockRejectedValue(new Error('boom: categories')),
    };
    renderWithProviders(<MarketplacePage search={{}} />, { client });

    expect(await screen.findByText('A box of tools.')).toBeInTheDocument();
    expect(await screen.findByText('boom: categories')).toBeInTheDocument();
  });

  it('names the default most-downloaded without a query and navigates a non-default sort', async () => {
    const user = userEvent.setup();
    const withoutQuery = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
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
      client: browseReads(searchPage([searchRow()])),
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
      client: browseReads(searchPage([searchRow()])),
    });
    await screen.findByText('A box of tools.');

    await user.type(screen.getByLabelText('Search'), 'uuid');
    expect(navigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', { q: 'uuid' }, { replace: true });
  });

  it('keeps the keyboard caret in the search box when submit commits (WCAG 2.4.3)', async () => {
    const user = userEvent.setup();
    const searchMarketplace = vi.fn(() => Promise.resolve(searchPage([searchRow()])));
    renderWithLiveUrl<'marketplace'>((search) => <MarketplacePage search={search} />, {
      client: { ...browseReads(searchPage([searchRow()])), searchMarketplace },
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
    // The other half of the re-seed contract: a query arriving WITHOUT a local
    // edit (browser back/forward) still overwrites the draft, so the box never
    // states a query the results are not for.
    const client = browseReads(searchPage([searchRow()]));
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
          ? searchPage(
              [searchRow({ ref: 'other/plugin', name: 'plugin', display_name: 'Other' })],
              {
                total: 2,
                page: 2,
                page_size: 1,
              },
            )
          : searchPage([searchRow()], { total: 2, page: 1, page_size: 1 }),
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
      // Two rows → two cards → two title links.
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
              searchPage(
                [searchRow({ ref: 'other/plugin', name: 'plugin', display_name: 'Other' })],
                {
                  total: 2,
                  page: 2,
                  page_size: 1,
                },
              ),
            );
      }
      return Promise.resolve(searchPage([searchRow()], { total: 2, page: 1, page_size: 1 }));
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
      expect(screen.getByRole('link', { name: 'Other' })).toBeInTheDocument();
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
        : Promise.resolve(searchPage([searchRow()]));
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
      client: browseReads(searchPage([searchRow({ updated_at: 'not-a-date' })])),
    });
    // A value Date cannot parse is shown as-is on the recency line.
    expect(await screen.findByText(/Updated not-a-date/)).toBeInTheDocument();
  });

  it('commits an empty search as a cleared query on submit', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{}} />, {
      client: browseReads(searchPage([searchRow()])),
    });
    await screen.findByText('A box of tools.');
    // Submitting with a blank box drops `q` entirely (no empty-string query).
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', {}, { replace: true });
  });

  it('clears the category back to the default when All categories is chosen', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(
      <MarketplacePage search={{ category: 'productivity' }} />,
      { client: browseReads(searchPage([searchRow()]), ['productivity', 'devtools']) },
    );
    await screen.findByText('A box of tools.');
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'All categories' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', {});
  });

  it('shows the Name sort as selected and clears it back to the default', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<MarketplacePage search={{ sort: 'name' }} />, {
      client: browseReads(searchPage([searchRow()])),
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
      client: browseReads(searchPage([searchRow()])),
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
        : Promise.resolve(searchPage([searchRow()], { total: 2, page: 1, page_size: 1 })),
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
      client: browseReads(searchPage([searchRow()])),
    });
    await user.click(await screen.findByRole('tab', { name: 'Installed' }));
    expect(navigate).toHaveBeenCalledWith('marketplace', { tab: 'installed' });
  });

  it('clears the tab param when switching back to the browse tab', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      ...browseReads(searchPage([searchRow()])),
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
      getMarketplacePlugin: vi.fn().mockResolvedValue(browseDetailFixture()),
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
      getMarketplacePlugin: vi.fn().mockResolvedValue(browseDetailFixture()),
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
