/**
 * Behavioural tests for the tools page: the master list (data / empty /
 * loud error), selecting a tool sets the `tool` search param via the shell
 * navigate spy, a selected tool mounts the run panel driven by its fetched
 * schema, the `ExplorerView` explorer — folders as first-class rows/cards, a
 * list/card toggle, and a tag filter row that OR-filters the flat list (persisting
 * the selection through the `?tags=` search param) and collapses its overflow into a
 * static "+N more" — and the responsive master/detail behaviour: single-pane Back
 * control and focus management on selection change.
 */
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __resetContributions } from '@tai42/studio-sdk/testing';
import { ApiError, type MeProjection, type ToolTagEntry } from '@tai42/api-client';

import { ToolsPage } from './ToolsPage';
import { toolMetaKey } from './keys';
import {
  fullProjection,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
} from './test-utils';

afterEach(() => {
  __resetContributions();
  vi.unstubAllGlobals();
  // The explorer persists its list/card choice per surface in localStorage; clear it
  // so each test starts in the default list view.
  globalThis.localStorage.clear();
});

/** The two side reads the merged view needs, both empty — the shape a pre-overlay
 * test expects (no native tags, no overlay rows/folders). */
const emptyTags = {
  listToolTags: vi.fn().mockResolvedValue([]),
  listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }),
};

/** An empty overlay read, spread into a client that already sets `listToolTags`. */
const emptyOverlay = { listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }) };

/** A client that can drive a full detail pane (schema + extensions + presets). */
function detailClient(names: readonly string[] = ['echo']): StubApiClient {
  return {
    listTools: vi.fn().mockResolvedValue([...names]),
    ...emptyTags,
    getToolSchema: vi.fn().mockResolvedValue({
      input: { type: 'object', properties: {}, required: [] },
      output: null,
      description: null,
    }),
    getToolExtensions: vi.fn().mockResolvedValue({ combos: [], available: [] }),
    listPresets: vi.fn().mockResolvedValue([]),
  };
}

interface ToolsSearch {
  readonly tool?: string;
  readonly tags?: string[];
}

/**
 * Render `ToolsPage` inside a stateful harness whose navigate spy updates the
 * search param it receives — exactly how the shell router drives it. This is what
 * lets a click (or Back) actually change the selection so the focus effect fires.
 */
function renderToolsHarness(
  client: StubApiClient,
  initial: ToolsSearch = {},
  projection?: MeProjection,
) {
  let setSearch: ((next: ToolsSearch) => void) | undefined;
  function Harness(): ReactNode {
    const [search, setSearchState] = useState<ToolsSearch>(initial);
    setSearch = setSearchState;
    return <ToolsPage search={search} />;
  }
  const navigate = vi.fn((_token: string, next?: ToolsSearch) => {
    setSearch?.({ tool: next?.tool, tags: next?.tags });
  });
  return renderWithProviders(<Harness />, { client, navigate, projection });
}

/** Force `useBreakpoint` into the single-pane band (below 1024, not phone). */
function stubSinglePane(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query !== '(max-width: 639px)',
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

describe('ToolsPage — master list', () => {
  it('renders the tool names', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['echo', 'search']),
      ...emptyTags,
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    expect(await screen.findByText('echo')).toBeInTheDocument();
    expect(screen.getByText('search')).toBeInTheDocument();
  });

  it('renders the page header with the Capabilities eyebrow and the Tools h1', async () => {
    const client: StubApiClient = { listTools: vi.fn().mockResolvedValue(['echo']), ...emptyTags };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    // The h1's accessible name is the title VERBATIM; the eyebrow is a sibling, not
    // folded into the heading name.
    const heading = await screen.findByRole('heading', { level: 1, name: 'Tools' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
  });

  it('shows the empty state when there are no tools', async () => {
    const client: StubApiClient = { listTools: vi.fn().mockResolvedValue([]), ...emptyTags };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    expect(await screen.findByText('No tools available')).toBeInTheDocument();
  });

  it('shows a loud error state when the list request fails', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockRejectedValue(new Error('boom: list failed')),
      ...emptyTags,
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('boom: list failed');
  });

  it('sets the tool search param when a tool is selected', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { listTools: vi.fn().mockResolvedValue(['echo']), ...emptyTags };
    const { navigate } = renderWithProviders(<ToolsPage search={{}} />, { client });

    await user.click(await screen.findByRole('link', { name: 'Open tool echo' }));
    expect(navigate).toHaveBeenCalledWith('tools', { tool: 'echo', tags: undefined });
  });

  it('marks the selected tool link as the current page', async () => {
    renderWithProviders(<ToolsPage search={{ tool: 'echo' }} />, {
      client: detailClient(['echo', 'search']),
    });

    const active = await screen.findByRole('link', { name: 'Open tool echo' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Open tool search' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

describe('ToolsPage — selected tool', () => {
  it('mounts the run panel for the selected tool', async () => {
    renderWithProviders(<ToolsPage search={{ tool: 'echo' }} />, {
      client: detailClient(['echo']),
    });

    // The auto-form (no contributed panel) renders for the selected tool.
    expect(await screen.findByTestId('schema-form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  });

  it('shows the no-selection empty state when no tool is selected', async () => {
    const client: StubApiClient = { listTools: vi.fn().mockResolvedValue(['echo']), ...emptyTags };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    expect(await screen.findByText('No tool selected')).toBeInTheDocument();
  });
});

describe('ToolsPage — responsive master/detail', () => {
  it('moves focus to the detail heading when a tool is selected (client-side change)', async () => {
    const user = userEvent.setup();
    renderToolsHarness(detailClient(['echo']));

    await user.click(await screen.findByRole('link', { name: 'Open tool echo' }));

    const heading = await screen.findByRole('heading', { level: 2, name: 'echo' });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
  });

  it('does NOT steal focus on an initial deep-link mount (focus follows changes only)', async () => {
    renderToolsHarness(detailClient(['echo']), { tool: 'echo' });

    const heading = await screen.findByRole('heading', { level: 2, name: 'echo' });
    // The heading exists and is focusable, but a page opened straight at `?tool=echo`
    // must not yank focus onto it on load.
    expect(heading).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('shows a Back control single-pane that clears the selection and returns focus to the row', async () => {
    const user = userEvent.setup();
    stubSinglePane();
    renderToolsHarness(detailClient(['echo']), { tool: 'echo' });

    // Single-pane with a selection → the detail pane shows a Back control.
    const back = await screen.findByRole('button', { name: 'Back' });
    await user.click(back);

    // The selection clears (the no-selection state returns) and the Back control is gone.
    expect(await screen.findByText('No tool selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    // Focus returns to the originating list row.
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Open tool echo' })).toHaveFocus();
    });
  });

  it('shows no Back control above 1024 (both panes visible)', async () => {
    // Default jsdom has no matchMedia → the `full` band → not single-pane.
    renderWithProviders(<ToolsPage search={{ tool: 'echo' }} />, {
      client: detailClient(['echo']),
    });

    expect(await screen.findByRole('heading', { level: 2, name: 'echo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});

const toolNames = ['alpha', 'beta', 'gamma', 'solo'];
const toolTags: ToolTagEntry[] = [
  { name: 'alpha', tags: ['x', 'y'], hidden: false },
  { name: 'beta', tags: ['x'], hidden: false },
  { name: 'gamma', tags: ['y'], hidden: false },
  { name: 'solo', tags: [], hidden: false },
];

function taggedClient(overrides: StubApiClient = {}): StubApiClient {
  return {
    listTools: vi.fn().mockResolvedValue(toolNames),
    listToolTags: vi.fn().mockResolvedValue(toolTags),
    ...emptyOverlay,
    ...overrides,
  };
}

describe('ToolsPage — tag filtering', () => {
  it('renders a tag chip per tag with its count, plus an Untagged chip', async () => {
    renderWithProviders(<ToolsPage search={{}} />, { client: taggedClient() });

    expect(await screen.findByRole('button', { name: 'x (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'y (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Untagged (1)' })).toBeInTheDocument();
  });

  it('lists every tool once with no selection (flat, ungrouped)', async () => {
    renderWithProviders(<ToolsPage search={{}} />, { client: taggedClient() });

    // alpha carries both x and y, but the flat explorer lists it a single time.
    expect(await screen.findAllByRole('link', { name: 'Open tool alpha' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Open tool beta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open tool gamma' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open tool solo' })).toBeInTheDocument();
  });

  it('toggling a tag chip writes the tag into the ?tags= search param', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<ToolsPage search={{}} />, { client: taggedClient() });

    await user.click(await screen.findByRole('button', { name: 'x (2)' }));
    expect(navigate).toHaveBeenCalledWith('tools', { tool: undefined, tags: ['x'] });
  });

  it('filters to tools carrying a selected tag (OR semantics) from the route', async () => {
    renderWithProviders(<ToolsPage search={{ tags: ['x'] }} />, { client: taggedClient() });

    // Only x-tagged tools survive; alpha (x and y) still lists once.
    expect(await screen.findAllByRole('link', { name: 'Open tool alpha' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Open tool beta' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool gamma' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool solo' })).not.toBeInTheDocument();
    // The active chip reflects the route selection.
    expect(screen.getByRole('button', { name: 'x (2)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the Untagged chip selects only tools with no tag', async () => {
    renderWithProviders(<ToolsPage search={{ tags: ['__untagged__'] }} />, {
      client: taggedClient(),
    });

    expect(await screen.findByRole('link', { name: 'Open tool solo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool alpha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool beta' })).not.toBeInTheDocument();
  });

  it('preserves the selected tags when a tool link is followed', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<ToolsPage search={{ tags: ['x'] }} />, {
      client: taggedClient(),
    });

    await user.click(await screen.findByRole('link', { name: 'Open tool alpha' }));
    expect(navigate).toHaveBeenCalledWith('tools', { tool: 'alpha', tags: ['x'] });
  });

  it('survives a tags-query failure: flat list stays, a loud strip shows, no chips', async () => {
    renderWithProviders(<ToolsPage search={{}} />, {
      client: taggedClient({
        listToolTags: vi.fn().mockRejectedValue(new Error('boom: tags failed')),
      }),
    });

    // The flat list still renders every tool.
    expect(await screen.findByRole('link', { name: 'Open tool alpha' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open tool solo' })).toBeInTheDocument();
    // The tags failure is loud, and no grouping/filter chips are shown.
    expect(screen.getByRole('alert')).toHaveTextContent('boom: tags failed');
    expect(screen.queryByRole('button', { name: 'x (2)' })).not.toBeInTheDocument();
  });

  it('treats multiple selected tags as OR, not AND (a tool carrying only one still shows)', async () => {
    renderWithProviders(<ToolsPage search={{ tags: ['x', 'y'] }} />, { client: taggedClient() });

    // beta carries only x and gamma only y; OR keeps BOTH — under AND each would be dropped.
    expect(await screen.findByRole('link', { name: 'Open tool beta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open tool gamma' })).toBeInTheDocument();
    // alpha carries both, and still lists once in the flat explorer.
    expect(screen.getAllByRole('link', { name: 'Open tool alpha' })).toHaveLength(1);
    // solo is untagged → excluded by the tag selection.
    expect(screen.queryByRole('link', { name: 'Open tool solo' })).not.toBeInTheDocument();
  });

  it('keeps a selected tag whose tools have all vanished clearable, showing the no-match state', async () => {
    // A stale/shared `?tags=` link can select a tag no live tool carries. Nothing matches,
    // but the chip must still render (active) so the filter can be toggled off rather than
    // stranding the user on "No tools match" with no in-page way out.
    renderWithProviders(<ToolsPage search={{ tags: ['nope'] }} />, { client: taggedClient() });

    expect(await screen.findByText('No tools match')).toBeInTheDocument();
    const staleChip = screen.getByRole('button', { name: 'nope (0)' });
    expect(staleChip).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ToolsPage — tag chip overflow', () => {
  const manyNames = Array.from({ length: 10 }, (_, i) => `tool${String(i)}`);
  const manyTags: ToolTagEntry[] = manyNames.map((name, i) => ({
    name,
    tags: [`t${String(i)}`],
    hidden: false,
  }));
  function manyTagsClient(): StubApiClient {
    return {
      listTools: vi.fn().mockResolvedValue(manyNames),
      listToolTags: vi.fn().mockResolvedValue(manyTags),
      ...emptyOverlay,
    };
  }

  it('collapses the overflow into a STATIC "+N more" count, not an expander', async () => {
    renderWithProviders(<ToolsPage search={{}} />, { client: manyTagsClient() });

    // Ten distinct unselected tags, eight shown → two collapse.
    expect(await screen.findByRole('button', { name: 't0 (1)' })).toBeInTheDocument();
    const more = screen.getByText('+2 more');
    expect(more).toHaveClass('tai-chip-static');
    // It is a count, never a control.
    expect(screen.queryByRole('button', { name: '+2 more' })).toBeNull();
    // The collapsed tags are not rendered as chips.
    expect(screen.queryByRole('button', { name: 't8 (1)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 't9 (1)' })).toBeNull();
  });

  it('always keeps a SELECTED tag visible even when it would otherwise overflow', async () => {
    renderWithProviders(<ToolsPage search={{ tags: ['t9'] }} />, { client: manyTagsClient() });

    // t9 would fall into the overflow, but a selected chip stays visible so it is
    // still toggleable; only one unselected tag is then left to collapse.
    const selected = await screen.findByRole('button', { name: 't9 (1)' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('+1 more')).toHaveClass('tai-chip-static');
  });
});

describe('ToolsPage — capability projection', () => {
  const catalog = { listTools: vi.fn().mockResolvedValue(['echo', 'search']), ...emptyTags };

  it('a scoped projection shows only its projected tools', async () => {
    renderWithProviders(<ToolsPage search={{}} />, {
      client: { ...catalog },
      projection: scopedProjection({ tools: ['echo'] }),
    });

    expect(await screen.findByText('echo')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('search')).not.toBeInTheDocument();
    });
  });

  it('a full projection shows every tool in the catalog', async () => {
    renderWithProviders(<ToolsPage search={{}} />, {
      client: { ...catalog },
      projection: fullProjection(),
    });

    expect(await screen.findByText('echo')).toBeInTheDocument();
    expect(await screen.findByText('search')).toBeInTheDocument();
  });

  it('a scoped projection with no projected tools shows the empty state', async () => {
    renderWithProviders(<ToolsPage search={{}} />, {
      client: { listTools: vi.fn().mockResolvedValue(['echo']), ...emptyTags },
      projection: scopedProjection({ tools: [] }),
    });

    expect(await screen.findByText('No tools available')).toBeInTheDocument();
  });

  // Projection ⊆ gate: a deep-link to `?tool=<tool the projection excludes>` must
  // not mount the run panel / extensions editor for a tool the server would 403 on.
  const runnableClient = {
    listTools: vi.fn().mockResolvedValue(['echo', 'search']),
    ...emptyTags,
    getToolSchema: vi.fn().mockResolvedValue({
      input: { type: 'object', properties: {}, required: [] },
      output: null,
      description: null,
    }),
    getToolExtensions: vi.fn().mockResolvedValue({ combos: [], available: [] }),
    listPresets: vi.fn().mockResolvedValue([]),
  };

  it('a scoped session deep-linking an UNPROJECTED tool sees no run panel', async () => {
    renderWithProviders(<ToolsPage search={{ tool: 'search' }} />, {
      client: { ...runnableClient },
      projection: scopedProjection({ tools: ['echo'] }),
    });

    expect(await screen.findByText('Tool not available')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('schema-form')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
  });

  it('a scoped session deep-linking a PROJECTED tool mounts the run panel', async () => {
    renderWithProviders(<ToolsPage search={{ tool: 'echo' }} />, {
      client: { ...runnableClient },
      projection: scopedProjection({ tools: ['echo'] }),
    });

    expect(await screen.findByTestId('schema-form')).toBeInTheDocument();
    expect(screen.queryByText('Tool not available')).not.toBeInTheDocument();
  });

  it('a full projection mounts the run panel for any selected tool', async () => {
    renderWithProviders(<ToolsPage search={{ tool: 'search' }} />, {
      client: { ...runnableClient },
      projection: fullProjection(),
    });

    expect(await screen.findByTestId('schema-form')).toBeInTheDocument();
    expect(screen.queryByText('Tool not available')).not.toBeInTheDocument();
  });
});

describe('ToolsPage — tool_meta overlay merge', () => {
  it('renders the overlay display name and keeps the real name secondary', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['echo']),
      listToolTags: vi.fn().mockResolvedValue([]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          { tool_name: 'echo', display_name: 'Echo Tool', folder_id: null, tags: [], hidden: null },
        ],
      }),
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    expect(await screen.findByText('Echo Tool')).toBeInTheDocument();
    // The real name stays on screen (secondary) so the tool is still identifiable.
    expect(screen.getByText('echo')).toBeInTheDocument();
  });

  it('merges a tool native + overlay tags into one vocabulary (listed once)', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['echo']),
      listToolTags: vi.fn().mockResolvedValue([{ name: 'echo', tags: ['native'], hidden: false }]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          {
            tool_name: 'echo',
            display_name: null,
            folder_id: null,
            tags: ['custom'],
            hidden: null,
          },
        ],
      }),
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    // The tag vocabulary carries both sources merged, each counting the one tool.
    expect(await screen.findByRole('button', { name: 'custom (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'native (1)' })).toBeInTheDocument();
    // echo carries both tags, and the flat explorer lists it once.
    expect(screen.getAllByRole('link', { name: 'Open tool echo' })).toHaveLength(1);
  });

  it('survives an overlay-read failure: the flat list stays under a loud strip', async () => {
    renderWithProviders(<ToolsPage search={{}} />, {
      client: {
        listTools: vi.fn().mockResolvedValue(['echo']),
        listToolTags: vi.fn().mockResolvedValue([]),
        listToolMeta: vi.fn().mockRejectedValue(new Error('boom: overlay failed')),
      },
    });

    expect(await screen.findByRole('link', { name: 'Open tool echo' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('boom: overlay failed');
  });
});

describe('ToolsPage — effective visibility', () => {
  it('excludes an effectively hidden tool from the list outright', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['visible', 'secret']),
      listToolTags: vi.fn().mockResolvedValue([
        { name: 'visible', tags: [], hidden: false },
        { name: 'secret', tags: [], hidden: false },
      ]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          { tool_name: 'secret', display_name: null, folder_id: null, tags: [], hidden: true },
        ],
      }),
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    // The shown tool renders; the hidden tool is absent — unhiding is a CLI/API
    // operation (`tai tool-meta … --visibility shown`), verified by the overlay-unhide
    // test below, with no screen affordance to reveal it here.
    expect(await screen.findByRole('link', { name: 'Open tool visible' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool secret' })).toBeNull();
  });

  it('an overlay hidden:false unhides a plugin-hidden tool; no override defers to the plugin', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['unhidden', 'stillhidden']),
      listToolTags: vi.fn().mockResolvedValue([
        { name: 'unhidden', tags: [], hidden: true },
        { name: 'stillhidden', tags: [], hidden: true },
      ]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          { tool_name: 'unhidden', display_name: null, folder_id: null, tags: [], hidden: false },
        ],
      }),
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    // overlay `false` overrides the plugin's hidden → shown; a plugin-hidden tool with
    // no overlay override defers to the declaration → excluded.
    expect(await screen.findByRole('link', { name: 'Open tool unhidden' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool stillhidden' })).toBeNull();
  });

  it('shows the all-hidden empty state — not the install prompt — when every tool is hidden', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['secret']),
      listToolTags: vi.fn().mockResolvedValue([{ name: 'secret', tags: [], hidden: false }]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          { tool_name: 'secret', display_name: null, folder_id: null, tags: [], hidden: true },
        ],
      }),
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    // A non-empty catalog whose every tool is hidden → the all-hidden copy, NOT the
    // "install a plugin" prompt (plugins exist, they are just hidden).
    expect(await screen.findByText('No visible tools')).toBeInTheDocument();
    expect(screen.getByText(/Every installed tool is hidden/)).toBeInTheDocument();
    expect(screen.queryByText('No tools available')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open tool secret' })).toBeNull();
  });
});

describe('ToolsPage — folder navigation', () => {
  it('files tools by folder and navigates in and back out via the breadcrumb', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['root_tool', 'filed_tool']),
      listToolTags: vi.fn().mockResolvedValue([]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [{ id: 'f1', name: 'Weather', parent_id: null }],
        meta: [
          { tool_name: 'filed_tool', display_name: null, folder_id: 'f1', tags: [], hidden: null },
        ],
      }),
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    // At the root: the unfiled tool and the subfolder row, but not the filed tool.
    expect(await screen.findByRole('link', { name: 'Open tool root_tool' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool filed_tool' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Weather' }));

    // Inside Weather: the filed tool shows, the root tool does not.
    expect(await screen.findByRole('link', { name: 'Open tool filed_tool' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool root_tool' })).toBeNull();

    // The breadcrumb's root crumb navigates back out.
    await user.click(screen.getByRole('button', { name: 'All tools' }));
    expect(await screen.findByRole('link', { name: 'Open tool root_tool' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool filed_tool' })).toBeNull();
  });

  it('renders a subfolder as a first-class row above the tools in the table', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['root_tool']),
      listToolTags: vi.fn().mockResolvedValue([]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [{ id: 'f1', name: 'Weather', parent_id: null }],
        meta: [],
      }),
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    // The subfolder is a first-class row inside the tools table, beside the tool rows.
    const rows = await screen.findAllByRole('row');
    const weatherRow = rows.find(
      (row) => within(row).queryByRole('button', { name: 'Weather' }) !== null,
    );
    expect(weatherRow).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open tool root_tool' })).toBeInTheDocument();
  });

  it('renders folders and tools as cards in one grid in card view', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['root_tool']),
      listToolTags: vi.fn().mockResolvedValue([]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [{ id: 'f1', name: 'Weather', parent_id: null }],
        meta: [],
      }),
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    await user.click(await screen.findByRole('radio', { name: 'Card view' }));
    const grid = screen.getByRole('list', { name: 'Tools' });
    expect(within(grid).getByRole('button', { name: 'Weather' })).toBeInTheDocument();
    expect(within(grid).getByRole('link', { name: 'Open tool root_tool' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the folder-empty state inside a subfolder with nothing filed', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['root_tool']),
      listToolTags: vi.fn().mockResolvedValue([]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [{ id: 'f1', name: 'Empty', parent_id: null }],
        meta: [],
      }),
    };
    renderWithProviders(<ToolsPage search={{}} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Empty' }));
    expect(await screen.findByText('This folder is empty')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open tool root_tool' })).toBeNull();
  });
});

describe('ToolsPage — row/card open selects the tool', () => {
  it('selects a tool into the detail pane on a bare row click', async () => {
    const user = userEvent.setup();
    const { navigate } = renderToolsHarness(detailClient(['echo']), {}, fullProjection());

    // The bare row (not the name link, not the Edit button) opens the tool — the same
    // navigation the name link performs, so the detail pane mounts for it.
    const row = (await screen.findByRole('button', { name: 'Edit tool echo' })).closest('tr');
    if (row === null) throw new Error('tool row not rendered');
    await user.click(row);

    expect(navigate).toHaveBeenCalledWith('tools', { tool: 'echo', tags: undefined });
    expect(await screen.findByRole('heading', { level: 2, name: 'echo' })).toBeInTheDocument();
  });

  it('preserves the active tags in the row-open navigation', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['echo']),
      listToolTags: vi.fn().mockResolvedValue([{ name: 'echo', tags: ['x'], hidden: false }]),
      ...emptyOverlay,
      getToolSchema: vi.fn().mockResolvedValue({
        input: { type: 'object', properties: {}, required: [] },
        output: null,
        description: null,
      }),
      getToolExtensions: vi.fn().mockResolvedValue({ combos: [], available: [] }),
      listPresets: vi.fn().mockResolvedValue([]),
    };
    const { navigate } = renderToolsHarness(client, { tags: ['x'] }, fullProjection());

    const row = (await screen.findByRole('button', { name: 'Edit tool echo' })).closest('tr');
    if (row === null) throw new Error('tool row not rendered');
    await user.click(row);

    // The row-open mirrors the name link's search params exactly, tags included.
    expect(navigate).toHaveBeenCalledWith('tools', { tool: 'echo', tags: ['x'] });
  });

  it('does NOT select the tool when the Edit button is clicked (dialog opens instead)', async () => {
    const user = userEvent.setup();
    const { navigate } = renderToolsHarness(detailClient(['echo']), {}, fullProjection());

    await user.click(await screen.findByRole('button', { name: 'Edit tool echo' }));

    // The Edit control opens its dialog; the SDK yields to it, so no tool is selected.
    expect(await screen.findByText('Edit echo')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('No tool selected')).toBeInTheDocument();
  });
});

describe('ToolsPage — overlay edit affordance', () => {
  it('opens the per-tool edit dialog, writes a merge-patch, and invalidates the overlay', async () => {
    const user = userEvent.setup();
    const upsertToolMeta = vi.fn().mockResolvedValue({
      tool_name: 'echo',
      display_name: null,
      folder_id: null,
      tags: [],
      hidden: true,
    });
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['echo']),
      listToolTags: vi.fn().mockResolvedValue([]),
      listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }),
      upsertToolMeta,
    };
    const { queryClient } = renderWithProviders(<ToolsPage search={{}} />, {
      client,
      projection: fullProjection(),
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Edit tool echo' }));

    // The dialog opens for this tool.
    expect(await screen.findByText('Edit echo')).toBeInTheDocument();

    // Flip visibility to Hidden and save — the merge-patch carries all four owned fields.
    await user.click(screen.getByRole('radio', { name: 'Hidden' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(upsertToolMeta).toHaveBeenCalledWith('echo', {
      display_name: null,
      tags: [],
      folder_id: null,
      hidden: true,
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: toolMetaKey });
    });
  });

  it('withdraws the Edit affordance and shows the OFF note once the overlay store is not configured', async () => {
    const user = userEvent.setup();
    const upsertToolMeta = vi
      .fn()
      .mockRejectedValue(new ApiError('not configured', 501, 'tool-meta-not-configured'));
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['echo']),
      listToolTags: vi.fn().mockResolvedValue([]),
      listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }),
      upsertToolMeta,
    };
    renderWithProviders(<ToolsPage search={{}} />, { client, projection: fullProjection() });

    await user.click(await screen.findByRole('button', { name: 'Edit tool echo' }));
    await screen.findByText('Edit echo');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The dialog swaps its form for the muted OFF note, naming the env var.
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
    expect(screen.getByText(/TOOL_META_STORE_PG_PASSWORD/)).toBeInTheDocument();

    // The per-row Edit affordance is withdrawn list-wide — a write it can only refuse.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Edit tool echo' })).toBeNull();
    });
  });

  it('offers no Edit affordance to a read-only (scoped) caller', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['echo']),
      listToolTags: vi.fn().mockResolvedValue([]),
      listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }),
    };
    renderWithProviders(<ToolsPage search={{}} />, {
      client,
      projection: scopedProjection({ tools: ['echo'] }),
    });

    expect(await screen.findByRole('link', { name: 'Open tool echo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit tool echo' })).toBeNull();
  });
});
