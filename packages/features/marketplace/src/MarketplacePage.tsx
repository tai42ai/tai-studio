/**
 * The marketplace shell page. It owns the tab (browse / installed) and the
 * drill-in `plugin` search param: when a plugin is selected the detail view
 * replaces the browse chrome. Browse is a text search + facet chips (kind,
 * category, tags) + a sort control over an infinite-scrolling result set, with
 * the item-level rows grouped back under their listing. Every filter lives in the
 * URL; the page number does not (the infinite query owns it).
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Skeleton,
  Tabs,
  TextInput,
  errorMessage,
  useApi,
  useAppNavigate,
  type PageProps,
} from '@tai42/studio-sdk';
import type { MarketplaceItem, MarketplaceSearchRow } from '@tai42/api-client';

import { ListingIcon, listingTitle } from './display';
import { activeTab, mergeSearch, searchParams, type MarketplaceSearch } from './filters';
import { marketplaceCategoriesKey, marketplaceSearchKey } from './keys';
import { InstalledTab } from './InstalledTab';
import { PluginDetail } from './PluginDetail';

/** The Select sentinel for the cleared / default option (empty item values are invalid). */
const NONE = '__none__';

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
};

/** A togglable facet chip; `aria-pressed` reflects whether it filters the results. */
function FacetChip({
  label,
  active,
  onToggle,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
    >
      <Badge variant={active ? 'primary' : 'neutral'}>{label}</Badge>
    </button>
  );
}

/** The text-search box. Holds a local draft so navigation happens only on submit. */
function SearchBar({ search }: { readonly search: MarketplaceSearch }): ReactNode {
  const navigate = useAppNavigate();
  const [draft, setDraft] = useState(search.q ?? '');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        navigate('marketplace', mergeSearch(search, { q: draft.trim() || undefined }));
      }}
      style={{ display: 'flex', gap: 'var(--tai-space-2)', alignItems: 'flex-end' }}
    >
      <Field label="Search" style={{ flex: '1 1 auto' }}>
        <TextInput
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="Search plugins…"
        />
      </Field>
      <Button type="submit" variant="primary">
        Search
      </Button>
    </form>
  );
}

/** Distinct values in `values`, sorted, plus any `selected` value not already present. */
function vocabularyWith(values: readonly string[], selected: readonly string[]): string[] {
  const set = new Set(values);
  const vocab = [...set].sort((a, b) => a.localeCompare(b));
  for (const value of selected) {
    if (!set.has(value)) vocab.push(value);
  }
  return vocab;
}

interface PluginGroup {
  readonly ref: string;
  readonly row: MarketplaceSearchRow;
  readonly items: MarketplaceItem[];
}

/** Group the item-level rows back under their listing, preserving server order. */
function groupRows(rows: readonly MarketplaceSearchRow[]): PluginGroup[] {
  const groups: PluginGroup[] = [];
  const indexByRef = new Map<string, number>();
  for (const row of rows) {
    let index = indexByRef.get(row.ref);
    if (index === undefined) {
      index = groups.length;
      indexByRef.set(row.ref, index);
      groups.push({ ref: row.ref, row, items: [] });
    }
    groups[index]?.items.push(row.item);
  }
  return groups;
}

/** One listing card: header, badges, downloads, description, matching item rows. */
function PluginCard({
  group,
  search,
}: {
  readonly group: PluginGroup;
  readonly search: MarketplaceSearch;
}): ReactNode {
  const { row } = group;
  const title = listingTitle(row.display_name, row.name);
  return (
    <Card>
      <div style={{ display: 'flex', gap: 'var(--tai-space-3)', alignItems: 'flex-start' }}>
        <ListingIcon iconUrl={row.icon_url} title={title} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--tai-space-2)',
            minWidth: 0,
            flex: '1 1 auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--tai-space-2)',
              alignItems: 'center',
            }}
          >
            <AppLink to="marketplace" search={mergeSearch(search, { plugin: group.ref })}>
              <strong>{title}</strong>
            </AppLink>
            <code style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
              {group.ref}
            </code>
            <Badge>{row.trust_tier}</Badge>
            <Badge>{row.pricing}</Badge>
            <span style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
              {row.downloads} downloads
            </span>
          </div>
          <p style={{ margin: 0 }}>{row.description}</p>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--tai-space-1)',
            }}
          >
            {group.items.map((item) => (
              <li
                key={`${item.kind}/${item.name}`}
                style={{
                  display: 'flex',
                  gap: 'var(--tai-space-2)',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                }}
              >
                <Badge>{item.kind}</Badge>
                <strong>{item.name}</strong>
                <span style={{ color: 'var(--tai-color-text-muted)' }}>{item.description}</span>
              </li>
            ))}
          </ul>
          <div>
            <AppLink to="marketplace" search={mergeSearch(search, { plugin: group.ref })}>
              View
            </AppLink>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** The category facet: its own query against the registry's controlled list. */
function CategoryFacet({ search }: { readonly search: MarketplaceSearch }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const categoriesQuery = useQuery({
    queryKey: marketplaceCategoriesKey,
    queryFn: ({ signal }) => api.listMarketplaceCategories(signal),
  });

  if (categoriesQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(categoriesQuery.error)}
        onRetry={() => void categoriesQuery.refetch()}
      />
    );
  }

  const categories = categoriesQuery.data ?? [];
  const withSelected =
    search.category !== undefined && !categories.includes(search.category)
      ? [...categories, search.category]
      : categories;
  const options = [
    { value: NONE, label: 'All categories' },
    ...withSelected.map((category) => ({ value: category, label: category })),
  ];

  return (
    <Field label="Category">
      <Select
        aria-label="Category"
        options={options}
        value={search.category ?? NONE}
        onValueChange={(value) => {
          navigate(
            'marketplace',
            mergeSearch(search, { category: value === NONE ? undefined : value }),
          );
        }}
      />
    </Field>
  );
}

/** The sort facet. `relevance` is offered only when a query string is set. */
function SortFacet({ search }: { readonly search: MarketplaceSearch }): ReactNode {
  const navigate = useAppNavigate();
  const options = [
    { value: NONE, label: 'Default order' },
    { value: 'downloads', label: 'Most downloads' },
    { value: 'updated', label: 'Recently updated' },
    { value: 'name', label: 'Name' },
    ...(search.q ? [{ value: 'relevance', label: 'Relevance' }] : []),
  ];
  // A stale `sort=relevance` with no query shows as the default order (it is
  // dropped from the request too), so the control never displays an unavailable
  // option.
  const displaySort = search.sort === 'relevance' && !search.q ? undefined : search.sort;
  return (
    <Field label="Sort">
      <Select
        aria-label="Sort results"
        options={options}
        value={displaySort ?? NONE}
        onValueChange={(value) => {
          navigate('marketplace', {
            ...mergeSearch(search, {
              sort: value === NONE ? undefined : (value as MarketplaceSearch['sort']),
            }),
          });
        }}
      />
    </Field>
  );
}

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

  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const selectedKind = search.kind;
  const selectedTags = search.tags ?? [];

  const kindVocab = vocabularyWith(
    rows.map((row) => row.item.kind),
    selectedKind !== undefined ? [selectedKind] : [],
  );
  const tagVocab = vocabularyWith(
    rows.flatMap((row) => row.item.tags),
    selectedTags,
  );
  const selectedTagSet = new Set(selectedTags);

  const toggleKind = (kind: string): void => {
    navigate(
      'marketplace',
      mergeSearch(search, { kind: selectedKind === kind ? undefined : kind }),
    );
  };
  const toggleTag = (tag: string): void => {
    const next = selectedTagSet.has(tag)
      ? selectedTags.filter((value) => value !== tag)
      : [...selectedTags, tag];
    navigate('marketplace', mergeSearch(search, { tags: next.length > 0 ? next : undefined }));
  };

  const groups = groupRows(rows);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <SearchBar key={search.q ?? ''} search={search} />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--tai-space-4)',
          alignItems: 'flex-end',
        }}
      >
        <SortFacet search={search} />
        <CategoryFacet search={search} />
      </div>

      {kindVocab.length > 0 ? (
        <div role="group" aria-label="Filter by kind" style={chipRowStyle}>
          {kindVocab.map((kind) => (
            <FacetChip
              key={kind}
              label={kind}
              active={selectedKind === kind}
              onToggle={() => {
                toggleKind(kind);
              }}
            />
          ))}
        </div>
      ) : null}

      {tagVocab.length > 0 ? (
        <div role="group" aria-label="Filter by tag" style={chipRowStyle}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          {query.isError && !query.isFetchNextPageError ? (
            // A background refetch (e.g. window-focus) failed while pages are
            // retained. A Load-more failure is also an error with data present,
            // so it is excluded here and handled by its own inline retry below.
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--tai-space-2)',
              }}
            >
              <span style={{ color: 'var(--tai-color-danger)' }}>
                Could not refresh results: {errorMessage(query.error)}
              </span>
              <Button onClick={() => void query.refetch()}>Retry</Button>
            </div>
          ) : null}
          {groups.length === 0 ? (
            <EmptyState
              title="No plugins match"
              description="No plugins match the current filters."
            />
          ) : (
            <>
              {groups.map((group) => (
                <PluginCard key={group.ref} group={group} search={search} />
              ))}
              {query.isFetchNextPageError ? (
                <div
                  role="alert"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 'var(--tai-space-2)',
                  }}
                >
                  <span style={{ color: 'var(--tai-color-danger)' }}>
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
    </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 'var(--tai-text-xl)' }}>Marketplace</h1>
      </header>

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
    </div>
  );
}
