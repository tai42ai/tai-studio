/**
 * The marketplace shell page. It owns the tab (browse / installed) and the
 * drill-in `plugin` search param: when a plugin is selected the detail view
 * replaces the browse chrome. Browse is a text search + facet chips (kind,
 * category, tags) + a sort control over an infinite-scrolling set of listing
 * cards, one card per listing row. Every filter lives in the URL; the page number
 * does not (the infinite query owns it).
 */
import { useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  Skeleton,
  Stack,
  Tabs,
  TextInput,
  errorMessage,
  useApi,
  useAppNavigate,
  type PageProps,
} from '@tai42/studio-sdk';
import type { MarketplaceSearchRow } from '@tai42/api-client';

import { listingBadges } from './badges';
import { ListingIcon, listingTitle } from './display';
import { activeTab, mergeSearch, searchParams, type MarketplaceSearch } from './filters';
import { marketplaceCategoriesKey, marketplaceKindsKey, marketplaceSearchKey } from './keys';
import { InstalledTab } from './InstalledTab';
import { PluginDetail } from './PluginDetail';

/** The Select sentinel for the cleared / default option (empty item values are invalid). */
const NONE = '__none__';

/**
 * An ISO-8601 `updated_at` rendered as a plain date for the card's recency line.
 * An unparseable value is shown verbatim rather than swallowed.
 */
function formatUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

/**
 * A togglable facet chip. `.tai-chip` publishes the control's whole rendering —
 * the resting pill, the hover, the pressed accent ground — keyed off
 * `aria-pressed`, which is also what tells assistive tech the filter is on. The
 * chip carries its label as its own text (not a nested Badge), so its accessible
 * name is the facet value and a voice-control user names the control they see.
 */
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
    <button type="button" className="tai-chip" aria-pressed={active} onClick={onToggle}>
      {label}
    </button>
  );
}

/** The text-search box. Holds a local draft so navigation happens only on submit. */
function SearchBar({ search }: { readonly search: MarketplaceSearch }): ReactNode {
  const navigate = useAppNavigate();
  const committed = search.q ?? '';
  const [draft, setDraft] = useState(committed);
  const [seed, setSeed] = useState(committed);
  // Re-seed the draft from the committed query DURING RENDER (React's documented
  // adjust-state-on-prop-change pattern) rather than by remounting on a `key`: this
  // box is what commits the query, so a remount keyed on it detaches the focused
  // input the instant the form submits and drops the keyboard caret on
  // `document.body` (WCAG 2.4.3).
  if (seed !== committed) {
    setSeed(committed);
    setDraft(committed);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        navigate('marketplace', mergeSearch(search, { q: draft.trim() || undefined }));
      }}
      className="tai-row"
      style={{ alignItems: 'flex-end' }}
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

/** Distinct values across `values` and `selected`, sorted alphabetically. */
function vocabularyWith(values: readonly string[], selected: readonly string[]): string[] {
  const set = new Set([...values, ...selected]);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * One listing card: name, reference, description, badges, downloads, and a
 * content-summary badge row. The badges are the catalog policy over the row's
 * groups and ungrouped kinds — see `listingBadges`.
 */
function PluginCard({
  row,
  search,
}: {
  readonly row: MarketplaceSearchRow;
  readonly search: MarketplaceSearch;
}): ReactNode {
  const title = listingTitle(row.display_name, row.name);
  const detailSearch = mergeSearch(search, { plugin: row.ref });
  const badges = listingBadges(row);
  return (
    <Card interactive>
      <div style={{ display: 'flex', gap: 'var(--tai-space-3)', alignItems: 'flex-start' }}>
        <ListingIcon iconUrl={row.icon_url} title={title} />
        <div className="tai-stack tai-stack-2" style={{ minWidth: 0, flex: '1 1 auto' }}>
          {/* Content order: the name, the machine reference in mono, the human
              description, the tier/price badges, then the download count. */}
          <AppLink to="marketplace" search={detailSearch}>
            <strong>{title}</strong>
          </AppLink>
          <code className="tai-mono tai-muted">{row.ref}</code>
          <p style={{ margin: 0 }}>{row.description}</p>
          <div className="tai-row">
            <Badge>{row.trust_tier}</Badge>
            <Badge>{row.pricing}</Badge>
            {/* A display-only premium mark — a badge, never a payment surface. */}
            {row.premium === true ? <Badge variant="primary">Premium</Badge> : null}
            {/* The latest published version, when the listing has one. It is nullable
                defensively though the search relation only emits published listings. */}
            {row.latest_version !== null ? <Badge>{row.latest_version}</Badge> : null}
          </div>
          {/* Downloads and recency on one muted line — the "Recently updated" sort
              orders by exactly this timestamp, so it must be visible on the card. */}
          <span className="tai-muted">
            {row.downloads} downloads · Updated {formatUpdatedAt(row.updated_at)}
          </span>
          {badges.length > 0 ? (
            <div role="group" aria-label="Capabilities" className="tai-row">
              {badges.map((label, index) => (
                <Badge key={`${String(index)}-${label}`}>{label}</Badge>
              ))}
            </div>
          ) : null}
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

/**
 * The kind facet: its own query against the registry's controlled item-kind list,
 * rendered as a chip row. The chips keep the served catalog order and stay put as
 * result pages arrive (they render from the vocabulary, not the loaded rows). A
 * stale URL kind outside the vocabulary is appended so it still shows as a
 * clearable active chip.
 */
function KindFacet({ search }: { readonly search: MarketplaceSearch }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const kindsQuery = useQuery({
    queryKey: marketplaceKindsKey,
    queryFn: ({ signal }) => api.listMarketplaceKinds(signal),
  });

  if (kindsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(kindsQuery.error)}
        onRetry={() => void kindsQuery.refetch()}
      />
    );
  }

  const selectedKind = search.kind;
  const kinds = kindsQuery.data ?? [];
  const kindVocab =
    selectedKind !== undefined && !kinds.includes(selectedKind) ? [...kinds, selectedKind] : kinds;
  if (kindVocab.length === 0) {
    return null;
  }

  const toggleKind = (kind: string): void => {
    navigate(
      'marketplace',
      mergeSearch(search, { kind: selectedKind === kind ? undefined : kind }),
    );
  };

  return (
    <div role="group" aria-label="Filter by kind" className="tai-row">
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
  );
}

/**
 * The sort facet. The default option (NONE) names the server's actual default —
 * relevance when a query is set, most-downloaded otherwise — so the control never
 * lies about the resting order. With a query, `downloads` is the one explicit way
 * to force the download order over relevance; without a query it IS the default,
 * so no separate option is offered.
 */
function SortFacet({ search }: { readonly search: MarketplaceSearch }): ReactNode {
  const navigate = useAppNavigate();
  const hasQuery = Boolean(search.q);
  const options = hasQuery
    ? [
        { value: NONE, label: 'Relevance' },
        { value: 'downloads', label: 'Most downloaded' },
        { value: 'updated', label: 'Recently updated' },
        { value: 'name', label: 'Name' },
      ]
    : [
        { value: NONE, label: 'Most downloaded' },
        { value: 'updated', label: 'Recently updated' },
        { value: 'name', label: 'Name' },
      ];
  // Only `updated`/`name` are non-default selections; every other state
  // (unset, relevance, or downloads without a query) resolves to the default.
  const displaySort =
    search.sort === 'updated' || search.sort === 'name'
      ? search.sort
      : hasQuery && search.sort === 'downloads'
        ? 'downloads'
        : NONE;
  return (
    <Field label="Sort">
      <Select
        options={options}
        value={displaySort}
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
