/**
 * The marketplace shell page. It owns the tab (browse / installed) and the
 * drill-in `plugin` search param: when a plugin is selected the detail view
 * replaces the browse chrome. Browse is a text search + facet chips (kind,
 * category, tags) + a sort control over an infinite-scrolling set of listing
 * cards, one card per listing row. Every filter lives in the URL; the page number
 * does not (the infinite query owns it).
 */
import {
  Button,
  EmptyState,
  errorMessage,
  ErrorState,
  PageHeader,
  type PageProps,
  Skeleton,
  Stack,
  Tabs,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import { useInfiniteQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';

import { activeTab, type MarketplaceSearch, mergeSearch, searchParams } from './filters';
import { InstalledTab } from './InstalledTab';
import { marketplaceSearchKey } from './keys';
import {
  CategoryFacet,
  FacetChip,
  KindFacet,
  SearchBar,
  SortFacet,
  vocabularyWith,
} from './marketplace-facets';
import { PluginCard } from './PluginCard';
import { PluginDetail } from './PluginDetail';

function BrowseSection({ search }: { readonly search: MarketplaceSearch }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const params = searchParams(search);
  const query = useInfiniteQuery({
    queryKey: marketplaceSearchKey(params),
    queryFn: ({ pageParam, signal }) =>
      api.searchMarketplace({ ...params, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
  });

  const rows = query.data?.pages.flatMap((page) => page.listings) ?? [];
  const selectedTags = search.tags ?? [];

  const tagVocab = vocabularyWith(
    rows.flatMap((row) => row.tags),
    selectedTags,
  );
  const selectedTagSet = new Set(selectedTags);

  const toggleTag = (tag: string): void => {
    const next = selectedTagSet.has(tag)
      ? selectedTags.filter((value) => value !== tag)
      : [...selectedTags, tag];
    navigate('marketplace', mergeSearch(search, { tags: next.length > 0 ? next : undefined }));
  };

  return (
    <Stack>
      <SearchBar search={search} />

      <div className="tai-row">
        <SortFacet search={search} />
        <CategoryFacet search={search} />
      </div>

      <KindFacet search={search} />

      {tagVocab.length > 0 ? (
        <div role="group" aria-label="Filter by tag" className="tai-row">
          {tagVocab.map((tag) => (
            <FacetChip
              key={tag}
              label={tag}
              active={selectedTagSet.has(tag)}
              onToggle={() => {
                toggleTag(tag);
              }}
            />
          ))}
        </div>
      ) : null}

      {query.isPending ? (
        <div className="tai-stack tai-stack-2">
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      ) : query.isLoadingError ? (
        // Only the initial-load failure (no pages loaded) blanks the list. Once
        // pages are loaded, failures are surfaced inline without discarding the
        // retained results: a background-refetch failure above the list and a
        // failed Load-more near the Load-more control.
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <div className="tai-stack tai-stack-3">
          {query.isError && !query.isFetchNextPageError ? (
            // A background refetch (e.g. window-focus) failed while pages are
            // retained. A Load-more failure is also an error with data present,
            // so it is excluded here and handled by its own inline retry below.
            <div role="alert" className="tai-row">
              <span className="tai-status tai-status-err">
                Could not refresh results: {errorMessage(query.error)}
              </span>
              <Button onClick={() => void query.refetch()}>Retry</Button>
            </div>
          ) : null}
          {rows.length === 0 ? (
            <EmptyState
              title="No plugins match"
              description="No plugins match the current filters."
            />
          ) : (
            <>
              {rows.map((row) => (
                <PluginCard key={row.ref} row={row} search={search} />
              ))}
              {query.isFetchNextPageError ? (
                <div
                  role="alert"
                  className="tai-stack tai-stack-2"
                  style={{ alignItems: 'center' }}
                >
                  <span className="tai-status tai-status-err">
                    Could not load more: {errorMessage(query.error)}
                  </span>
                  <Button
                    onClick={() => void query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                  >
                    {query.isFetchingNextPage ? 'Loading…' : 'Retry load more'}
                  </Button>
                </div>
              ) : query.hasNextPage ? (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Button
                    onClick={() => void query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                  >
                    {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </Stack>
  );
}

export function MarketplacePage({ search }: PageProps<'marketplace'>): ReactNode {
  const navigate = useAppNavigate();

  if (search.plugin !== undefined) {
    return (
      <PluginDetail
        refValue={search.plugin}
        onBack={() => {
          navigate('marketplace', mergeSearch(search, { plugin: undefined }));
        }}
      />
    );
  }

  const tab = activeTab(search);

  return (
    <Stack gap={6}>
      <PageHeader eyebrow="Administration" title="Marketplace" />

      <Tabs
        value={tab}
        onValueChange={(next) => {
          navigate(
            'marketplace',
            mergeSearch(search, { tab: next === 'browse' ? undefined : (next as 'installed') }),
          );
        }}
        items={[
          { value: 'browse', label: 'Browse', content: <BrowseSection search={search} /> },
          { value: 'installed', label: 'Installed', content: <InstalledTab search={search} /> },
        ]}
      />
    </Stack>
  );
}
