/** The marketplace browse facets: the search box and the sort/category/kind/tag controls. */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  Button,
  ErrorState,
  Field,
  Select,
  TextInput,
  errorMessage,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';

import { mergeSearch, type MarketplaceSearch } from './filters';
import { marketplaceCategoriesKey, marketplaceKindsKey } from './keys';

/** The Select sentinel for the cleared / default option (empty item values are invalid). */
const NONE = '__none__';

/**
 * A togglable facet chip. `.tai-chip` publishes the control's whole rendering —
 * the resting pill, the hover, the pressed accent ground — keyed off
 * `aria-pressed`, which is also what tells assistive tech the filter is on. The
 * chip carries its label as its own text (not a nested Badge), so its accessible
 * name is the facet value and a voice-control user names the control they see.
 */
export function FacetChip({
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
export function SearchBar({ search }: { readonly search: MarketplaceSearch }): ReactNode {
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
        // A search commit REPLACES the current history entry: refining the query is
        // not a place Back should step back through one commit at a time.
        navigate('marketplace', mergeSearch(search, { q: draft.trim() || undefined }), {
          replace: true,
        });
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
export function vocabularyWith(values: readonly string[], selected: readonly string[]): string[] {
  const set = new Set([...values, ...selected]);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** The category facet: its own query against the registry's controlled list. */
export function CategoryFacet({ search }: { readonly search: MarketplaceSearch }): ReactNode {
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
export function KindFacet({ search }: { readonly search: MarketplaceSearch }): ReactNode {
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
export function SortFacet({ search }: { readonly search: MarketplaceSearch }): ReactNode {
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
