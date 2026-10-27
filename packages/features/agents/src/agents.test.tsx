import type { AgentSummary, ToolMetaRecord } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentsPage } from './agents';
import { ERROR_TRANSCRIPT, FULL_TRANSCRIPT, OPEN_TRANSCRIPT, parse } from './fixtures';
import {
  agent,
  authorableAgent,
  findAgentNames,
  findAgentRow,
  fullProjection,
  hangingStream,
  presetRecord,
  renderWithProviders,
  scopedProjection,
  scriptedStream,
  stubClient,
} from './test-utils';

function listOf(
  ...agents: AgentSummary[]
): () => Promise<{ items: AgentSummary[]; total: number }> {
  return () => Promise.resolve({ items: agents, total: agents.length });
}

/**
 * Every rendered button or link whose accessible name omits the words it SHOWS.
 *
 * WCAG 2.5.3 (Label in Name): a voice-control user says what they can read, so
 * an `aria-label` must contain the control's visible text. Derived over the
 * rendered DOM, so a control added later is judged by the same rule. Controls
 * with no visible text (an icon-only button) are outside the criterion, and so
 * are landmarks/regions (their label names a container, not a visible caption)
 * and selects (their visible text is the chosen value, not their label).
 */
function labelInNameFailures(container: HTMLElement): string[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'button[aria-label]:not([role="combobox"]), a[aria-label], [role="button"][aria-label], [role="link"][aria-label]',
    ),
  ]
    .filter((node) => {
      const visible = node.textContent.trim().toLowerCase();
      return (
        visible !== '' && !(node.getAttribute('aria-label') ?? '').toLowerCase().includes(visible)
      );
    })
    .map((node) => `${node.getAttribute('aria-label') ?? ''} !~ ${node.textContent.trim()}`);
}

describe('AgentsPage header', () => {
  it('renders the PageHeader: a "Capabilities" eyebrow above the level-1 "Agents" title', async () => {
    renderWithProviders(<AgentsPage />, stubClient({ listAgents: listOf(agent()) }));

    // The h1 keeps its verbatim title and level (Playwright/DOM contract).
    const heading = await screen.findByRole('heading', { level: 1, name: 'Agents' });
    expect(heading).toBeInTheDocument();
    // The nav-section eyebrow is a SIBLING label, never folded into the h1's name.
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(heading).not.toHaveTextContent('Capabilities');
  });

  it('titles the run view on the agent name under the Capabilities eyebrow', async () => {
    const client = stubClient({ listAgents: listOf(agent({ name: 'writer' })) });
    renderWithProviders(<AgentsPage />, client);

    await userEvent.click(await screen.findByRole('button', { name: 'Run agent writer' }));

    // The run view's h1 is the agent name (verbatim), still under the section eyebrow.
    expect(await screen.findByRole('heading', { level: 1, name: 'writer' })).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
  });
});

describe('AgentsPage list', () => {
  it('lists registered agents with a link to the run tool', async () => {
    const client = stubClient({
      listAgents: listOf(agent({ name: 'writer', tool_name: 'writer_tool' })),
    });
    renderWithProviders(<AgentsPage />, client);

    const row = await findAgentRow('writer', 'registered');
    expect(within(row).getByText('Registered')).toBeInTheDocument();
    // The run tool is registered under the REGISTRATION name ('writer'), not the
    // divergent tool_name ('writer_tool'), so the link targets the registration name.
    expect(screen.getByRole('link', { name: 'Open run tool for writer' })).toBeInTheDocument();
    expect(labelInNameFailures(document.body)).toEqual([]);
  });

  it('shows an empty state when no agents are registered', async () => {
    renderWithProviders(<AgentsPage />, stubClient({ listAgents: listOf() }));
    expect(await screen.findByText('No agents registered')).toBeInTheDocument();
  });

  it('a scoped projection shows only its projected agents', async () => {
    const client = stubClient({
      listAgents: listOf(agent({ name: 'writer' }), agent({ name: 'planner' })),
    });
    renderWithProviders(<AgentsPage />, client, {
      projection: scopedProjection({ agents: ['writer'] }),
    });

    expect(
      await screen.findByRole('link', { name: 'Open run tool for writer' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('planner')).not.toBeInTheDocument();
    });
  });

  it('a full projection shows every registered agent', async () => {
    const client = stubClient({
      listAgents: listOf(agent({ name: 'writer' }), agent({ name: 'planner' })),
    });
    renderWithProviders(<AgentsPage />, client, { projection: fullProjection() });

    expect(
      await screen.findByRole('link', { name: 'Open run tool for writer' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Open run tool for planner' }),
    ).toBeInTheDocument();
  });

  it('a scoped projection with no projected agents shows the empty state', async () => {
    const client = stubClient({ listAgents: listOf(agent({ name: 'writer' })) });
    renderWithProviders(<AgentsPage />, client, { projection: scopedProjection({ agents: [] }) });

    expect(await screen.findByText('No agents registered')).toBeInTheDocument();
  });
});

describe('AgentsPage run', () => {
  it('runs the selected agent and settles Finished after streaming', async () => {
    const client = stubClient({
      listAgents: listOf(agent()),
      streamAgentRun: scriptedStream(parse(FULL_TRANSCRIPT)),
    });
    renderWithProviders(<AgentsPage />, client);

    await userEvent.click(await screen.findByRole('button', { name: /^Run agent / }));
    // Now in the run view; start the run.
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Finished')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-message')).toHaveTextContent('Here you go');
    // `←`/`→` are in NO shipped font subset, so a literal arrow paints in a
    // platform fallback face beside Inter. The icon set carries the mark instead.
    expect(document.body.textContent).not.toMatch(/[\u2190\u2192]/u);
  });

  it('settles Failed and surfaces a stream.error message exactly once (timeline only)', async () => {
    const client = stubClient({
      listAgents: listOf(agent()),
      streamAgentRun: scriptedStream(parse(ERROR_TRANSCRIPT)),
    });
    renderWithProviders(<AgentsPage />, client);

    await userEvent.click(await screen.findByRole('button', { name: /^Run agent / }));
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Failed')).toBeInTheDocument();
    // The frame message renders once — the timeline owns it. `run.error` is not
    // set for a `stream.error` frame, so there is no second top-level ErrorState.
    expect(screen.getByTestId('timeline-error')).toHaveTextContent('boom');
    expect(screen.getAllByText('boom')).toHaveLength(1);
  });

  it('surfaces a transport error once, with no timeline item', async () => {
    const client = stubClient({
      listAgents: listOf(agent()),
      // The stream fails to open (non-2xx / dropped connection): the run hook's
      // catch path sets `run.error` and no event is ever folded into a timeline.
      streamAgentRun: () => Promise.reject(new Error('connection dropped')),
    });
    renderWithProviders(<AgentsPage />, client);

    await userEvent.click(await screen.findByRole('button', { name: /^Run agent / }));
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(screen.getAllByText('connection dropped')).toHaveLength(1);
    expect(screen.queryByTestId('timeline-error')).not.toBeInTheDocument();
  });

  it('Stop aborts the fetch (abort-by-disconnect)', async () => {
    const captured: { signal: AbortSignal | undefined } = { signal: undefined };
    const client = stubClient({
      listAgents: listOf(agent()),
      streamAgentRun: hangingStream(parse(OPEN_TRANSCRIPT), captured),
    });
    renderWithProviders(<AgentsPage />, client);

    await userEvent.click(await screen.findByRole('button', { name: /^Run agent / }));
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    // The run is open: a Stop button appears and the fetch signal is live.
    const stop = await screen.findByRole('button', { name: 'Stop the run' });
    expect(captured.signal?.aborted).toBe(false);

    await userEvent.click(stop);
    await waitFor(() => {
      expect(captured.signal?.aborted).toBe(true);
    });
  });
});

describe('AgentsPage folders', () => {
  const folder = (id: string, name: string, parentId: string | null = null) => ({
    id,
    name,
    parent_id: parentId,
  });
  const filed = (toolName: string, folderId: string): ToolMetaRecord => ({
    tool_name: toolName,
    folder_id: folderId,
    display_name: null,
    hidden: null,
    tags: [],
    badges: [],
  });

  /** A registered `writer`, an authorable base, the authored `assistant`, and a tree
   *  where `Agents` files writer, `Authored` files assistant, `Other tools` holds only
   *  a plain tool, `Fresh` is empty and `Nested` is an empty child of `Other tools`. */
  function folderClient(over = {}) {
    return stubClient({
      listAgents: listOf(agent({ name: 'writer' }), authorableAgent()),
      listSpecRunnableAgents: listOf(authorableAgent()),
      listPresets: () =>
        Promise.resolve([presetRecord({ name: 'assistant', base_tool: 'authorable_agent' })]),
      listToolMeta: () =>
        Promise.resolve({
          folders: [
            folder('f-agents', 'Agents'),
            folder('f-authored', 'Authored'),
            folder('f-other', 'Other tools'),
            folder('f-nested', 'Nested', 'f-other'),
            folder('f-fresh', 'Fresh'),
          ],
          meta: [
            filed('writer', 'f-agents'),
            filed('assistant', 'f-authored'),
            filed('http_get', 'f-other'),
          ],
        }),
      ...over,
    });
  }

  it('draws the folders holding an agent or nothing, never those holding only other tools', async () => {
    renderWithProviders(<AgentsPage />, folderClient(), { projection: fullProjection() });

    expect(await screen.findByRole('button', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Authored' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fresh' })).toBeInTheDocument();
    // `Other tools` holds only a plain tool; its empty child keeps it reachable.
    expect(screen.getByRole('button', { name: 'Other tools' })).toBeInTheDocument();
    // Only the unfiled base agent is at the root; the filed ones sit in their folders.
    expect(await findAgentNames('registered')).toEqual(['authorable_agent']);
  });

  it('lists registered and authored agents together inside a folder, each with its own actions', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<AgentsPage />, folderClient(), { projection: fullProjection() });

    await user.click(await screen.findByRole('button', { name: 'Authored' }));
    const authored = await findAgentRow('assistant', 'authored');
    expect(
      within(authored).getByRole('link', { name: 'Manage authored agent assistant' }),
    ).toBeInTheDocument();

    const path = screen.getByRole('navigation', { name: 'Folder path' });
    await user.click(within(path).getByRole('button', { name: 'All agents' }));
    await user.click(screen.getByRole('button', { name: 'Agents' }));
    const registered = await findAgentRow('writer', 'registered');
    expect(
      within(registered).getByRole('link', { name: 'Open run tool for writer' }),
    ).toBeInTheDocument();
    expect(labelInNameFailures(document.body)).toEqual([]);
  });

  it('files an agent into a folder through its Move action', async () => {
    const user = userEvent.setup({ delay: null });
    const upsertToolMeta = vi.fn((toolName: string) => Promise.resolve(filed(toolName, 'f-fresh')));
    renderWithProviders(<AgentsPage />, folderClient({ upsertToolMeta }), {
      projection: fullProjection(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Move authorable_agent to a folder' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Move authorable_agent to a folder',
    });
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Fresh' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => {
      expect(upsertToolMeta).toHaveBeenCalledWith('authorable_agent', { folder_id: 'f-fresh' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('offers the folder actions to a writer', async () => {
    renderWithProviders(<AgentsPage />, folderClient(), { projection: fullProjection() });

    expect(await screen.findByRole('button', { name: 'Rename folder Agents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move folder Agents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete folder Fresh' })).toBeInTheDocument();
  });

  it('gives a read-only caller the folders without any filing action', async () => {
    renderWithProviders(<AgentsPage />, folderClient(), {
      projection: scopedProjection({
        routes: [
          { path: '/api/agents', methods: ['GET'] },
          { path: '/api/tool-meta', methods: ['GET'] },
        ],
        agents: ['writer', 'authorable_agent'],
      }),
    });

    expect(await screen.findByRole('button', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Rename folder / })).toBeNull();
    expect(screen.queryByRole('button', { name: /to a folder$/ })).toBeNull();
  });

  it('offers a caller who reaches only the tool edit route filing, but no folder action', async () => {
    renderWithProviders(<AgentsPage />, folderClient(), {
      projection: scopedProjection({
        routes: [
          { path: '/api/agents', methods: ['GET'] },
          { path: '/api/tool-meta', methods: ['GET'] },
          { path: '/api/tool-meta/tools/{tool_name}', methods: ['PATCH'] },
        ],
        agents: ['writer', 'authorable_agent'],
      }),
    });

    expect(
      await screen.findByRole('button', { name: 'Move authorable_agent to a folder' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Rename|Move|Delete) folder / })).toBeNull();
  });

  it('withdraws every overlay write once the store refuses one as not configured', async () => {
    const user = userEvent.setup({ delay: null });
    const upsertToolMeta = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error('Tool metadata needs a tool_meta store.'), {
          status: 501,
          code: 'tool-meta-not-configured',
        }),
      ),
    );
    renderWithProviders(<AgentsPage />, folderClient({ upsertToolMeta }), {
      projection: fullProjection(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Move authorable_agent to a folder' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Move authorable_agent to a folder',
    });
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Fresh' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    expect(await within(dialog).findByTestId('feature-disabled')).toHaveTextContent(
      'Tool metadata needs a tool_meta store.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: /to a folder$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Rename|Move|Delete) folder / })).toBeNull();
  });

  it('does not tell a read-only caller to move an agent into an empty folder', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<AgentsPage />, folderClient(), {
      projection: scopedProjection({
        routes: [
          { path: '/api/agents', methods: ['GET'] },
          { path: '/api/tool-meta', methods: ['GET'] },
        ],
        agents: ['writer', 'authorable_agent'],
      }),
    });

    await user.click(await screen.findByRole('button', { name: 'Fresh' }));
    expect(await screen.findByText('This folder is empty')).toBeInTheDocument();
    expect(screen.queryByText(/Move an agent here/)).toBeNull();
  });

  it('tells a writer how to fill an empty folder', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<AgentsPage />, folderClient(), { projection: fullProjection() });

    await user.click(await screen.findByRole('button', { name: 'Fresh' }));
    expect(
      await screen.findByText('Move an agent here with its "Move" action.'),
    ).toBeInTheDocument();
  });

  it('shows the authored agent active version', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(
      <AgentsPage />,
      folderClient({
        listPresets: () =>
          Promise.resolve([
            presetRecord({ name: 'assistant', base_tool: 'authorable_agent', active_version: 3 }),
          ]),
      }),
      { projection: fullProjection() },
    );

    await user.click(await screen.findByRole('button', { name: 'Authored' }));
    const row = await findAgentRow('assistant', 'authored');
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    const versionColumn = headers.indexOf('Active version');
    expect(versionColumn).toBeGreaterThan(-1);
    expect(within(row).getAllByRole('cell')[versionColumn]).toHaveTextContent('3');
  });

  it('shows the whole-screen empty state when no agent exists, even with folders', async () => {
    renderWithProviders(
      <AgentsPage />,
      folderClient({
        listAgents: listOf(),
        listSpecRunnableAgents: listOf(),
      }),
      { projection: fullProjection() },
    );

    expect(await screen.findByText('No agents registered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fresh' })).toBeNull();
  });

  it('states a failed overlay read loudly and still lists every agent at the root', async () => {
    renderWithProviders(
      <AgentsPage />,
      folderClient({ listToolMeta: () => Promise.reject(new Error('overlay store unreachable')) }),
      { projection: fullProjection() },
    );

    expect(await findAgentRow('writer', 'registered')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('overlay store unreachable');
  });
});
