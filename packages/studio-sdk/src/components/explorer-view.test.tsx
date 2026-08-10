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
