import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Card,
  ExplorerView,
  TD,
  UNTAGGED_TOKEN,
  buildTagVocabulary,
  matchesSelectedTags,
  type ExplorerColumn,
  type ExplorerEmptyStates,
  type ExplorerSearch,
  type ExplorerTags,
  type ExplorerViewProps,
  type Folder,
} from '../index';

afterEach(() => {
  globalThis.localStorage.clear();
});

interface Row {
  readonly id: string;
  readonly name: string;
  readonly folderId: string | null;
  readonly tags: readonly string[];
}

const FOLDERS: Folder[] = [
  { id: 'w', name: 'Weather', parentId: null },
  { id: 'eu', name: 'Europe', parentId: 'w' },
];

const ROWS: Row[] = [
  { id: 'alpha', name: 'alpha', folderId: null, tags: ['blue'] },
  { id: 'beta', name: 'beta', folderId: null, tags: ['red'] },
  { id: 'gamma', name: 'gamma', folderId: null, tags: [] },
  { id: 'delta', name: 'delta', folderId: 'w', tags: ['blue'] },
];

const COLUMNS: ExplorerColumn[] = [{ key: 'name', header: 'Name' }];

const EMPTY_STATES: ExplorerEmptyStates = {
  empty: { title: 'No rows anywhere' },
  emptyFolder: { title: 'This folder is empty' },
  noMatch: { title: 'No rows match' },
};

function renderExplorer(overrides: Partial<ExplorerViewProps<Row>> = {}): void {
  render(
    <ExplorerView<Row>
      items={ROWS}
      getItemKey={(row) => row.id}
      getFolderId={(row) => row.folderId}
      folders={FOLDERS}
      currentFolderId={null}
      onNavigate={vi.fn()}
      rootLabel="All rows"
      viewSurface={`explorer-test-${Math.random().toString(36).slice(2)}`}
      label="Rows"
      columns={COLUMNS}
      renderRow={(row) => <TD>{row.name}</TD>}
      renderCard={(row) => <Card interactive>{row.name}</Card>}
      emptyStates={EMPTY_STATES}
      {...overrides}
    />,
  );
}

describe('buildTagVocabulary', () => {
  it('counts tags name-sorted and appends an untagged pseudo-tag', () => {
    const vocab = buildTagVocabulary(ROWS, (r) => r.tags, [], 'Untagged');
    expect(vocab.map((e) => e.token)).toEqual(['blue', 'red', UNTAGGED_TOKEN]);
    expect(vocab.find((e) => e.token === 'blue')?.count).toBe(2);
    expect(vocab.find((e) => e.token === UNTAGGED_TOKEN)).toEqual({
      token: UNTAGGED_TOKEN,
      label: 'Untagged',
      count: 1,
    });
  });

  it('omits the untagged pseudo-tag when every item carries a tag', () => {
    const tagged = ROWS.filter((r) => r.tags.length > 0);
    const vocab = buildTagVocabulary(tagged, (r) => r.tags, [], 'Untagged');
    expect(vocab.some((e) => e.token === UNTAGGED_TOKEN)).toBe(false);
  });

  it('keeps a selected token whose items vanished so it can be cleared', () => {
    const vocab = buildTagVocabulary([], () => [], ['green'], 'Untagged');
    expect(vocab).toEqual([{ token: 'green', label: 'green', count: 0 }]);
  });

  it('labels a lingering untagged selection with the caller label', () => {
    const vocab = buildTagVocabulary([], () => [], [UNTAGGED_TOKEN], 'None');
    expect(vocab).toEqual([{ token: UNTAGGED_TOKEN, label: 'None', count: 0 }]);
  });
});

describe('matchesSelectedTags', () => {
  it('matches everything when nothing is selected', () => {
    expect(matchesSelectedTags(['blue'], new Set())).toBe(true);
    expect(matchesSelectedTags([], new Set())).toBe(true);
  });

  it('is OR over the selected tags', () => {
    const selected = new Set(['blue', 'red']);
    expect(matchesSelectedTags(['blue', 'x'], selected)).toBe(true);
    expect(matchesSelectedTags(['x'], selected)).toBe(false);
  });

  it('matches an untagged item only when the untagged token is selected', () => {
    expect(matchesSelectedTags([], new Set([UNTAGGED_TOKEN]))).toBe(true);
    expect(matchesSelectedTags([], new Set(['blue']))).toBe(false);
  });
});

describe('ExplorerView misuse', () => {
  it('throws on an empty column list', () => {
    expect(() => {
      renderExplorer({ columns: [] });
    }).toThrow(/at least one column/);
  });

  it('throws on an empty view surface', () => {
    expect(() => {
      renderExplorer({ viewSurface: '' });
    }).toThrow(/viewSurface/);
  });
});

describe('ExplorerView empty-state ladder', () => {
  it('shows the bare nothing-anywhere state with no controls', () => {
    renderExplorer({ items: [], folders: [] });
    expect(screen.getByText('No rows anywhere')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Folder path' })).not.toBeInTheDocument();
  });

  it('shows "this folder is empty" for a folder with no items and no subfolders', () => {
    renderExplorer({ items: [], currentFolderId: 'eu' });
    expect(screen.getByText('This folder is empty')).toBeInTheDocument();
    // Controls are present so the operator can navigate back out.
    expect(screen.getByRole('navigation', { name: 'Folder path' })).toBeInTheDocument();
  });

  it('shows "no match" when a search excludes every item and there are no subfolders', () => {
    renderExplorer({
      items: ROWS.filter((r) => r.folderId === null),
      folders: [],
      search: {
        value: 'zzz',
        onChange: vi.fn(),
        matches: (row, query) => row.name.includes(query),
        label: 'Search rows',
      },
    });
    expect(screen.getByText('No rows match')).toBeInTheDocument();
  });
});

describe('ExplorerView folders as first-class rows', () => {
  it('renders subfolders as rows in the item table, above the items', () => {
    renderExplorer();
    const rows = screen.getAllByRole('row');
    // Header row, then the Weather folder row, then the root items.
    const cellTexts = rows.map((r) => within(r).queryByRole('button', { name: 'Weather' }));
    expect(cellTexts[1]).not.toBeNull();
    expect(screen.getByRole('table')).toBeInTheDocument();
    // Root items are present; the folder's own item (delta) is not.
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('delta')).not.toBeInTheDocument();
  });

  it('renders a folder-with-only-subfolders as folder rows, never a header-only table', () => {
    // At Weather: one subfolder (Europe), zero items filed directly here.
    renderExplorer({ currentFolderId: 'w' });
    expect(screen.getByRole('button', { name: 'Europe' })).toBeInTheDocument();
    // The table renders folder rows — so no empty-state message fires.
    expect(screen.queryByText('This folder is empty')).not.toBeInTheDocument();
    expect(screen.queryByText('No rows match')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('navigates when a folder row is opened', async () => {
    const onNavigate = vi.fn();
    renderExplorer({ onNavigate });
    await userEvent.click(screen.getByRole('button', { name: 'Weather' }));
    expect(onNavigate).toHaveBeenCalledWith('w');
  });

  it('renders folder cards and item cards in one grid in card view', async () => {
    renderExplorer();
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    const grid = screen.getByRole('list', { name: 'Rows' });
    expect(within(grid).getByRole('button', { name: 'Weather' })).toBeInTheDocument();
    expect(within(grid).getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the folder actions slot on a folder row and, after toggling, its card', async () => {
    renderExplorer({
      renderFolderActions: (folder) => <button type="button">Manage {folder.name}</button>,
    });
    // Table view: the action sits on the Weather folder row.
    const weatherRow = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByRole('button', { name: 'Weather' }) !== null);
    if (weatherRow === undefined) throw new Error('Weather folder row not rendered');
    expect(within(weatherRow).getByRole('button', { name: 'Manage Weather' })).toBeInTheDocument();
    // Card view: the same action rides the folder card.
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    const grid = screen.getByRole('list', { name: 'Rows' });
    expect(within(grid).getByRole('button', { name: 'Manage Weather' })).toBeInTheDocument();
  });

  it('wraps the table in a scroll region so it scrolls in its own box', () => {
    const { container } = render(
      <ExplorerView<Row>
        items={ROWS}
        getItemKey={(row) => row.id}
        getFolderId={(row) => row.folderId}
        folders={FOLDERS}
        currentFolderId={null}
        onNavigate={vi.fn()}
        rootLabel="All rows"
        viewSurface={`explorer-scroll-${Math.random().toString(36).slice(2)}`}
        label="Rows"
        columns={COLUMNS}
        renderRow={(row) => <TD>{row.name}</TD>}
        renderCard={(row) => <Card interactive>{row.name}</Card>}
        emptyStates={EMPTY_STATES}
      />,
    );
    expect(screen.getByRole('table').closest('.tai-scroll-region')).not.toBeNull();
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(1);
  });

  it('does not wrap the card grid in a scroll region', async () => {
    const { container } = render(
      <ExplorerView<Row>
        items={ROWS}
        getItemKey={(row) => row.id}
        getFolderId={(row) => row.folderId}
        folders={FOLDERS}
        currentFolderId={null}
        onNavigate={vi.fn()}
        rootLabel="All rows"
        viewSurface={`explorer-scroll-cards-${Math.random().toString(36).slice(2)}`}
        label="Rows"
        columns={COLUMNS}
        renderRow={(row) => <TD>{row.name}</TD>}
        renderCard={(row) => <Card interactive>{row.name}</Card>}
        emptyStates={EMPTY_STATES}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    expect(screen.getByRole('list', { name: 'Rows' })).toBeInTheDocument();
    expect(container.querySelector('.tai-scroll-region')).toBeNull();
  });
});

describe('ExplorerView tag filter', () => {
  const tagProps = (
    selected: readonly string[],
    onChange: (next: readonly string[]) => void,
  ): ExplorerTags<Row> => ({
    getTags: (row) => row.tags,
    selected,
    onChange,
    untaggedLabel: 'Untagged',
    filterLabel: 'Filter rows by tag',
  });

  it('renders a chip per tag plus the untagged pseudo-tag', () => {
    renderExplorer({ tags: tagProps([], vi.fn()) });
    const group = screen.getByRole('group', { name: 'Filter rows by tag' });
    expect(within(group).getByRole('button', { name: 'blue (1)' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'red (1)' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Untagged (1)' })).toBeInTheDocument();
  });

  it('reports a chip toggle through onChange', async () => {
    const onChange = vi.fn();
    renderExplorer({ tags: tagProps([], onChange) });
    await userEvent.click(screen.getByRole('button', { name: 'blue (1)' }));
    expect(onChange).toHaveBeenCalledWith(['blue']);
  });

  it('OR-filters the items to the selected tag', () => {
    renderExplorer({ tags: tagProps(['red'], vi.fn()) });
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    // The folder row still shows — folders are never tag-filtered.
    expect(screen.getByRole('button', { name: 'Weather' })).toBeInTheDocument();
  });

  it('collapses unselected chips beyond the cap into a static "+N more"', () => {
    const many: Row[] = [
      { id: 'a', name: 'a', folderId: null, tags: ['t1'] },
      { id: 'b', name: 'b', folderId: null, tags: ['t2'] },
      { id: 'c', name: 'c', folderId: null, tags: ['t3'] },
    ];
    renderExplorer({
      items: many,
      folders: [],
      tags: { ...tagProps([], vi.fn()), maxVisibleTags: 2 },
    });
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('keeps a selected chip visible past the cap while unselected overflow collapses', () => {
    const many: Row[] = [
      { id: 'a', name: 'a', folderId: null, tags: ['t1'] },
      { id: 'b', name: 'b', folderId: null, tags: ['t2'] },
      { id: 'c', name: 'c', folderId: null, tags: ['t3'] },
      { id: 'd', name: 'd', folderId: null, tags: ['t4'] },
    ];
    renderExplorer({
      items: many,
      folders: [],
      // t4 sorts last, past a cap of one unselected chip; selected chips never collapse.
      tags: { ...tagProps(['t4'], vi.fn()), maxVisibleTags: 1 },
    });
    expect(screen.getByRole('button', { name: 't1 (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 't4 (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 't4 (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 't2 (1)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 't3 (1)' })).not.toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('ANDs the tag filter with the search matcher', () => {
    const items: Row[] = [
      { id: 'both', name: 'match', folderId: null, tags: ['keep'] },
      { id: 'tagOnly', name: 'zzz', folderId: null, tags: ['keep'] },
      { id: 'searchOnly', name: 'match2', folderId: null, tags: ['other'] },
    ];
    renderExplorer({
      items,
      folders: [],
      tags: tagProps(['keep'], vi.fn()),
      search: {
        value: 'match',
        onChange: vi.fn(),
        matches: (row, query) => row.name.includes(query),
        label: 'Search rows',
      },
    });
    // Only the row passing BOTH the tag and the search survives.
    expect(screen.getByText('match')).toBeInTheDocument();
    expect(screen.queryByText('zzz')).not.toBeInTheDocument(); // tag ✓, search ✗
    expect(screen.queryByText('match2')).not.toBeInTheDocument(); // search ✓, tag ✗
  });

  it('keeps vocabulary counts folder-scoped and stable while a selection is active', () => {
    // The vocabulary is a facet over the current folder's items, not the filtered
    // set — selecting a tag must not restate the other chips' counts.
    renderExplorer({ tags: tagProps(['blue'], vi.fn()) });
    const group = screen.getByRole('group', { name: 'Filter rows by tag' });
    expect(within(group).getByRole('button', { name: 'blue (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'red (1)' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Untagged (1)' })).toBeInTheDocument();
    // The body is filtered down to the blue item, proving counts and filtering diverge.
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });
});

describe('ExplorerView search', () => {
  it('filters items by the caller matcher and reports typing', async () => {
    const onChange = vi.fn();
    renderExplorer({
      items: ROWS.filter((r) => r.folderId === null),
      folders: [],
      search: {
        value: 'al',
        onChange,
        matches: (row, query) => row.name.includes(query),
        label: 'Search rows',
      },
    });
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search rows' }), 'x');
    expect(onChange).toHaveBeenCalled();
  });

  it('renders the magnifier as a leading icon INSIDE the filter field, not a detached glyph', () => {
    renderExplorer({
      items: ROWS.filter((r) => r.folderId === null),
      folders: [],
      search: {
        value: '',
        onChange: vi.fn(),
        matches: () => true,
        label: 'Search rows',
      },
    });
    const input = screen.getByRole('textbox', { name: 'Search rows' });
    const field = input.closest('.tai-search-field');
    // The input and the magnifier share one search-field wrapper — the icon is
    // integrated into the control rather than floating above it in a plain row.
    expect(field).not.toBeNull();
    const icon = field?.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ExplorerView onOpenItem', () => {
  const ROOT_ROWS = ROWS.filter((r) => r.folderId === null);

  function renderWithOpen(
    onOpenItem: ((row: Row) => void) | undefined,
    onNested: () => void,
  ): void {
    render(
      <ExplorerView<Row>
        items={ROOT_ROWS}
        getItemKey={(row) => row.id}
        getFolderId={(row) => row.folderId}
        folders={[]}
        currentFolderId={null}
        onNavigate={vi.fn()}
        rootLabel="All rows"
        viewSurface={`explorer-open-${Math.random().toString(36).slice(2)}`}
        label="Rows"
        columns={COLUMNS}
        onOpenItem={onOpenItem}
        renderRow={(row) => (
          <TD>
            <a
              href="#open"
              onClick={(event) => {
                event.preventDefault();
              }}
            >
              {row.name}
            </a>
            <button type="button" aria-label={`edit ${row.name}`} onClick={onNested}>
              <svg data-testid={`icon-${row.name}`} width="12" height="12" aria-hidden="true" />
            </button>
          </TD>
        )}
        renderCard={(row) => (
          <Card interactive>
            <a
              href="#open"
              onClick={(event) => {
                event.preventDefault();
              }}
            >
              {row.name}
            </a>
            <button type="button" aria-label={`edit ${row.name}`} onClick={onNested}>
              <svg
                data-testid={`icon-card-${row.name}`}
                width="12"
                height="12"
                aria-hidden="true"
              />
            </button>
          </Card>
        )}
        emptyStates={EMPTY_STATES}
      />,
    );
  }

  it('opens an item on a row click', async () => {
    const onOpenItem = vi.fn();
    renderWithOpen(onOpenItem, vi.fn());
    const row = screen.getByRole('button', { name: 'edit alpha' }).closest('tr');
    if (row === null) throw new Error('item row not rendered');
    await userEvent.click(row);
    expect(onOpenItem).toHaveBeenCalledTimes(1);
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'alpha' }));
  });

  it('marks item rows with a pointer cursor when the prop is set', () => {
    renderWithOpen(vi.fn(), vi.fn());
    const row = screen.getByRole('button', { name: 'edit alpha' }).closest('tr');
    if (row === null) throw new Error('item row not rendered');
    expect(row).toHaveStyle({ cursor: 'pointer' });
  });

  it('does not open when the click lands on a nested button in the row', async () => {
    const onOpenItem = vi.fn();
    const onNested = vi.fn();
    renderWithOpen(onOpenItem, onNested);
    await userEvent.click(screen.getByRole('button', { name: 'edit alpha' }));
    expect(onNested).toHaveBeenCalledTimes(1);
    expect(onOpenItem).not.toHaveBeenCalled();
  });

  it('does not open when the click lands on the name link in the row', async () => {
    const onOpenItem = vi.fn();
    renderWithOpen(onOpenItem, vi.fn());
    await userEvent.click(screen.getByRole('link', { name: 'alpha' }));
    expect(onOpenItem).not.toHaveBeenCalled();
  });

  it('does not open when the click target is an svg inside a nested button', async () => {
    const onOpenItem = vi.fn();
    renderWithOpen(onOpenItem, vi.fn());
    await userEvent.click(screen.getByTestId('icon-alpha'));
    expect(onOpenItem).not.toHaveBeenCalled();
  });

  it('does not open on a text-selection drag (a non-collapsed selection)', async () => {
    const onOpenItem = vi.fn();
    renderWithOpen(onOpenItem, vi.fn());
    const row = screen.getByRole('button', { name: 'edit alpha' }).closest('tr');
    if (row === null) throw new Error('item row not rendered');
    const selection = { isCollapsed: false } as unknown as Selection;
    const spy = vi.spyOn(window, 'getSelection').mockReturnValue(selection);
    try {
      await userEvent.click(row);
      expect(onOpenItem).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('opens an item on a card click', async () => {
    const onOpenItem = vi.fn();
    renderWithOpen(onOpenItem, vi.fn());
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    const card = screen.getByRole('button', { name: 'edit alpha' }).closest('[role="listitem"]');
    if (card === null) throw new Error('item card not rendered');
    await userEvent.click(card);
    expect(onOpenItem).toHaveBeenCalledTimes(1);
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'alpha' }));
  });

  it('does not open when the click lands on a nested control in the card', async () => {
    const onOpenItem = vi.fn();
    const onNested = vi.fn();
    renderWithOpen(onOpenItem, onNested);
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    await userEvent.click(screen.getByRole('button', { name: 'edit alpha' }));
    expect(onNested).toHaveBeenCalledTimes(1);
    expect(onOpenItem).not.toHaveBeenCalled();
  });

  it('wires no row handler when onOpenItem is absent', () => {
    renderWithOpen(undefined, vi.fn());
    const row = screen.getByRole('button', { name: 'edit alpha' }).closest('tr');
    if (row === null) throw new Error('item row not rendered');
    expect(row).not.toHaveStyle({ cursor: 'pointer' });
  });
});

describe('ExplorerView pagination and count', () => {
  const PAGE_SIZE_KEY = (surface: string): string => `tai-studio.page-size.${surface}`;

  function items(count: number, folderId: string | null = null): Row[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `${folderId ?? 'root'}-${String(index)}`,
      name: `${folderId ?? 'root'}-row-${String(index).padStart(2, '0')}`,
      folderId,
      tags: [],
    }));
  }

  function renderPaged(overrides: Partial<ExplorerViewProps<Row>> & { viewSurface: string }) {
    return render(
      <ExplorerView<Row>
        items={items(0)}
        getItemKey={(row) => row.id}
        getFolderId={(row) => row.folderId}
        folders={[]}
        currentFolderId={null}
        onNavigate={vi.fn()}
        rootLabel="All rows"
        label="Rows"
        columns={COLUMNS}
        renderRow={(row) => <TD>{row.name}</TD>}
        renderCard={(row) => <Card interactive>{row.name}</Card>}
        emptyStates={EMPTY_STATES}
        {...overrides}
      />,
    );
  }

  it('renders the count summary as the total across folders, distinct from the footer N', () => {
    renderPaged({
      viewSurface: 'count-summary',
      items: [...items(10, null), ...items(10, 'w')],
      folders: [{ id: 'w', name: 'Weather', parentId: null }],
      currentFolderId: null,
    });
    // The count summary is items.length across every folder, in the label's unit.
    expect(screen.getByText('20 rows')).toBeInTheDocument();
    // The footer N is the current view only: one folder row plus the ten root
    // items — a DIFFERENT unit, so it names itself "entries" to stay honest about
    // counting folders alongside items rather than sharing the header's "rows".
    const nav = screen.getByRole('navigation', { name: 'Rows pagination' });
    expect(within(nav).getByText('1–11 of 11 entries')).toBeInTheDocument();
  });

  it('names the footer nav and marks prev/next aria-disabled (not removed from the tab order) at the bounds', async () => {
    renderPaged({ viewSurface: 'footer-a11y', items: items(3) });
    const nav = screen.getByRole('navigation', { name: 'Rows pagination' });
    expect(within(nav).getByRole('combobox', { name: 'Items per page' })).toBeInTheDocument();
    // A single page: both step controls sit at a bound. They stay focusable
    // (aria-disabled) rather than dropping out of the tab order (disabled attr).
    const prev = within(nav).getByRole('button', { name: 'Previous page' });
    const next = within(nav).getByRole('button', { name: 'Next page' });
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(prev).not.toBeDisabled();
    expect(next).not.toBeDisabled();
    expect(within(nav).getByText('1–3 of 3 entries')).toBeInTheDocument();
    expect(within(nav).getByText('Page 1 of 1')).toBeInTheDocument();
    // Activation at the bound is an inert no-op — the page does not move.
    await userEvent.click(next);
    await userEvent.click(prev);
    expect(within(nav).getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('keeps Next focused after activation lands the view on the last page', async () => {
    const surface = 'focus-at-bound';
    globalThis.localStorage.setItem(PAGE_SIZE_KEY(surface), '12');
    renderPaged({ viewSurface: surface, items: items(15) });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(next).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(next);
    // The click landed on the last page; the button is now at the bound but must
    // keep focus rather than the browser dropping it to the body (WCAG 2.4.3).
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveFocus();
    // A further activation at the bound does not advance past the last page.
    await userEvent.click(next);
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('slices the combined folder→item sequence by page in the list view', async () => {
    const surface = 'slice-list';
    globalThis.localStorage.setItem(PAGE_SIZE_KEY(surface), '12');
    const folders: Folder[] = Array.from({ length: 10 }, (_, index) => ({
      id: `f${String(index).padStart(2, '0')}`,
      name: `folder-${String(index).padStart(2, '0')}`,
      parentId: null,
    }));
    renderPaged({ viewSurface: surface, items: items(5), folders });
    // 10 folders + 5 items = 15 entries; page 1 is the 10 folders then the first 2 items.
    expect(screen.getByRole('button', { name: 'folder-00' })).toBeInTheDocument();
    expect(screen.getByText('root-row-00')).toBeInTheDocument();
    expect(screen.getByText('root-row-01')).toBeInTheDocument();
    expect(screen.queryByText('root-row-02')).not.toBeInTheDocument();
    expect(screen.getByText('1–12 of 15 entries')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    // Page 2 is the remaining three items; no folder rows survive onto it.
    expect(screen.queryByRole('button', { name: 'folder-00' })).not.toBeInTheDocument();
    expect(screen.queryByText('root-row-01')).not.toBeInTheDocument();
    expect(screen.getByText('root-row-02')).toBeInTheDocument();
    expect(screen.getByText('root-row-04')).toBeInTheDocument();
    expect(screen.getByText('13–15 of 15 entries')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('renders the correct second-page subset in the card view too', async () => {
    const surface = 'slice-cards';
    globalThis.localStorage.setItem(PAGE_SIZE_KEY(surface), '12');
    renderPaged({ viewSurface: surface, items: items(20) });
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    const grid = screen.getByRole('list', { name: 'Rows' });
    expect(within(grid).getByText('root-row-12')).toBeInTheDocument();
    expect(within(grid).getByText('root-row-19')).toBeInTheDocument();
    expect(within(grid).queryByText('root-row-11')).not.toBeInTheDocument();
    expect(screen.getByText('13–20 of 20 entries')).toBeInTheDocument();
  });

  it('resets to page 1 when the current folder changes', async () => {
    const surface = 'reset-folder';
    globalThis.localStorage.setItem(PAGE_SIZE_KEY(surface), '12');
    const folders: Folder[] = [
      { id: 'a', name: 'A', parentId: null },
      { id: 'b', name: 'B', parentId: null },
    ];
    const both = [...items(15, 'a'), ...items(15, 'b')];
    const { rerender } = renderPaged({
      viewSurface: surface,
      items: both,
      folders,
      currentFolderId: 'a',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    rerender(
      <ExplorerView<Row>
        items={both}
        getItemKey={(row) => row.id}
        getFolderId={(row) => row.folderId}
        folders={folders}
        currentFolderId="b"
        onNavigate={vi.fn()}
        rootLabel="All rows"
        viewSurface={surface}
        label="Rows"
        columns={COLUMNS}
        renderRow={(row) => <TD>{row.name}</TD>}
        renderCard={(row) => <Card interactive>{row.name}</Card>}
        emptyStates={EMPTY_STATES}
      />,
    );
    // Folder B also has two pages; the reset lands on its first, not its second.
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('b-row-00')).toBeInTheDocument();
  });

  it('resets to page 1 when the trimmed query changes', async () => {
    const surface = 'reset-query';
    globalThis.localStorage.setItem(PAGE_SIZE_KEY(surface), '12');
    const search: ExplorerSearch<Row> = {
      value: '',
      onChange: vi.fn(),
      matches: (row, query) => row.name.includes(query),
      label: 'Search rows',
    };
    const { rerender } = renderPaged({ viewSurface: surface, items: items(15), search });
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    rerender(
      <ExplorerView<Row>
        items={items(15)}
        getItemKey={(row) => row.id}
        getFolderId={(row) => row.folderId}
        folders={[]}
        currentFolderId={null}
        onNavigate={vi.fn()}
        rootLabel="All rows"
        viewSurface={surface}
        label="Rows"
        columns={COLUMNS}
        renderRow={(row) => <TD>{row.name}</TD>}
        renderCard={(row) => <Card interactive>{row.name}</Card>}
        emptyStates={EMPTY_STATES}
        search={{ ...search, value: 'root-row' }}
      />,
    );
    // The query still matches all fifteen, so there are two pages — and the reset
    // put us on the first of them.
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('resets to page 1 when the tag selection changes', async () => {
    const surface = 'reset-tags';
    globalThis.localStorage.setItem(PAGE_SIZE_KEY(surface), '12');
    const tagged: Row[] = items(15).map((row) => ({ ...row, tags: ['keep'] }));
    const tags = (selected: readonly string[]): ExplorerTags<Row> => ({
      getTags: (row) => row.tags,
      selected,
      onChange: vi.fn(),
      untaggedLabel: 'Untagged',
      filterLabel: 'Filter rows by tag',
    });
    const { rerender } = renderPaged({ viewSurface: surface, items: tagged, tags: tags([]) });
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    rerender(
      <ExplorerView<Row>
        items={tagged}
        getItemKey={(row) => row.id}
        getFolderId={(row) => row.folderId}
        folders={[]}
        currentFolderId={null}
        onNavigate={vi.fn()}
        rootLabel="All rows"
        viewSurface={surface}
        label="Rows"
        columns={COLUMNS}
        renderRow={(row) => <TD>{row.name}</TD>}
        renderCard={(row) => <Card interactive>{row.name}</Card>}
        emptyStates={EMPTY_STATES}
        tags={tags(['keep'])}
      />,
    );
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('resets to page 1 when the page size changes', async () => {
    const surface = 'reset-page-size';
    globalThis.localStorage.setItem(PAGE_SIZE_KEY(surface), '12');
    renderPaged({ viewSurface: surface, items: items(15) });
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Items per page' }));
    await userEvent.click(await screen.findByRole('option', { name: '24 per page' }));
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByText('1–15 of 15 entries')).toBeInTheDocument();
  });

  it('clamps to the last page when the entry set shrinks below the current page', async () => {
    const surface = 'clamp';
    globalThis.localStorage.setItem(PAGE_SIZE_KEY(surface), '12');
    const { rerender } = renderPaged({ viewSurface: surface, items: items(15) });
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    // Fewer items, none of the reset deps changed: the clamp alone brings the page
    // back into range.
    rerender(
      <ExplorerView<Row>
        items={items(5)}
        getItemKey={(row) => row.id}
        getFolderId={(row) => row.folderId}
        folders={[]}
        currentFolderId={null}
        onNavigate={vi.fn()}
        rootLabel="All rows"
        viewSurface={surface}
        label="Rows"
        columns={COLUMNS}
        renderRow={(row) => <TD>{row.name}</TD>}
        renderCard={(row) => <Card interactive>{row.name}</Card>}
        emptyStates={EMPTY_STATES}
      />,
    );
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByText('1–5 of 5 entries')).toBeInTheDocument();
    expect(screen.getByText('root-row-00')).toBeInTheDocument();
  });

  it('stays on the clamped page after the entry set shrinks below it and then regrows', async () => {
    const surface = 'shrink-grow';
    globalThis.localStorage.setItem(PAGE_SIZE_KEY(surface), '12');
    const tree = (count: number) => (
      <ExplorerView<Row>
        items={items(count)}
        getItemKey={(row) => row.id}
        getFolderId={(row) => row.folderId}
        folders={[]}
        currentFolderId={null}
        onNavigate={vi.fn()}
        rootLabel="All rows"
        viewSurface={surface}
        label="Rows"
        columns={COLUMNS}
        renderRow={(row) => <TD>{row.name}</TD>}
        renderCard={(row) => <Card interactive>{row.name}</Card>}
        emptyStates={EMPTY_STATES}
      />
    );
    const { rerender } = render(tree(15));
    // On page 2 of 2.
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    // Shrink to a single page: the clamp reconciles the stored page to 1.
    rerender(tree(5));
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    // Grow back to two pages with no reset dep changed: the reconciled page holds
    // at 1 rather than jumping back to the stale page 2.
    rerender(tree(15));
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('root-row-00')).toBeInTheDocument();
  });

  it('renders the count summary in the singular at a count of one', () => {
    renderPaged({ viewSurface: 'count-singular', items: items(1) });
    expect(screen.getByText('1 row')).toBeInTheDocument();
  });

  it('persists the page size per surface in localStorage', () => {
    globalThis.localStorage.setItem(PAGE_SIZE_KEY('persist'), '48');
    renderPaged({ viewSurface: 'persist', items: items(60) });
    expect(screen.getByRole('combobox', { name: 'Items per page' })).toHaveTextContent(
      '48 per page',
    );
    expect(screen.getByText('1–48 of 60 entries')).toBeInTheDocument();
  });

  it('falls back to the default page size on an invalid stored value', () => {
    globalThis.localStorage.setItem(PAGE_SIZE_KEY('bad-value'), '999');
    renderPaged({ viewSurface: 'bad-value', items: items(60) });
    expect(screen.getByRole('combobox', { name: 'Items per page' })).toHaveTextContent(
      '24 per page',
    );
    expect(screen.getByText('1–24 of 60 entries')).toBeInTheDocument();
  });

  it('falls back to the default page size when the storage read throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      renderPaged({ viewSurface: 'throwing', items: items(60) });
      expect(screen.getByRole('combobox', { name: 'Items per page' })).toHaveTextContent(
        '24 per page',
      );
    } finally {
      getItem.mockRestore();
    }
  });
});
