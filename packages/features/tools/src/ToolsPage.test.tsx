/**
 * Behavioural tests for the tools page: the master list (data / empty /
 * loud error), selecting a tool sets the `tool` search param via the shell
 * navigate spy, a selected tool mounts the run panel driven by its fetched
 * schema, and the tag filter row groups + filters the list, persisting the
 * selection through the `?tags=` search param.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __resetContributions } from '@tai42/studio-sdk/testing';
import type { ToolTagEntry } from '@tai42/api-client';

import { ToolsPage } from './ToolsPage';
import {
  fullProjection,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
} from './test-utils';

afterEach(() => {
  __resetContributions();
});

const emptyTags = { listToolTags: vi.fn().mockResolvedValue([]) };

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
    const client: StubApiClient = {
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
    renderWithProviders(<ToolsPage search={{ tool: 'echo' }} />, { client });

    const active = await screen.findByRole('link', { name: 'Open tool echo' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Open tool search' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

describe('ToolsPage — selected tool', () => {
  it('mounts the run panel for the selected tool', async () => {
    const client: StubApiClient = {
      listTools: vi.fn().mockResolvedValue(['echo']),
      ...emptyTags,
      getToolSchema: vi.fn().mockResolvedValue({
        input: { type: 'object', properties: {}, required: [] },
        output: null,
        description: null,
      }),
      getToolExtensions: vi.fn().mockResolvedValue({ combos: [], available: [] }),
      listPresets: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<ToolsPage search={{ tool: 'echo' }} />, { client });

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

const toolNames = ['alpha', 'beta', 'gamma', 'solo'];
const toolTags: ToolTagEntry[] = [
  { name: 'alpha', tags: ['x', 'y'] },
  { name: 'beta', tags: ['x'] },
  { name: 'gamma', tags: ['y'] },
  { name: 'solo', tags: [] },
];

function taggedClient(overrides: StubApiClient = {}): StubApiClient {
  return {
    listTools: vi.fn().mockResolvedValue(toolNames),
    listToolTags: vi.fn().mockResolvedValue(toolTags),
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

  it('groups all tools with no selection; a multi-tag tool appears under each group', async () => {
    renderWithProviders(<ToolsPage search={{}} />, { client: taggedClient() });

    // alpha carries both x and y, so it renders under both groups.
    expect(await screen.findAllByRole('link', { name: 'Open tool alpha' })).toHaveLength(2);
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

    // Only x-tagged tools survive; alpha also shows under its y group.
    expect(await screen.findAllByRole('link', { name: 'Open tool alpha' })).toHaveLength(2);
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

    const [firstAlpha] = await screen.findAllByRole('link', { name: 'Open tool alpha' });
    if (firstAlpha === undefined) throw new Error('expected an alpha tool link');
    await user.click(firstAlpha);
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
    // alpha carries both, so it appears under each selected group.
    expect(screen.getAllByRole('link', { name: 'Open tool alpha' })).toHaveLength(2);
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
