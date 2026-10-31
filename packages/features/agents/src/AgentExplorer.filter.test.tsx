/**
 * The agents explorer's filter: the search box over the tool name and the description
 * (committed to `?q=` on Enter), and the tag chips over the overlay tags (kept in
 * `?tags=`).
 */
import type { AgentSummary, ToolMetaRecord } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AgentsPage } from './agents';
import {
  agent,
  findAgentNames,
  fullProjection,
  renderWithProviders,
  stubClient,
} from './test-utils';

function listOf(
  ...agents: AgentSummary[]
): () => Promise<{ items: AgentSummary[]; total: number }> {
  return () => Promise.resolve({ items: agents, total: agents.length });
}

const tagged = (toolName: string, tags: string[]): ToolMetaRecord => ({
  tool_name: toolName,
  folder_id: null,
  display_name: null,
  hidden: null,
  tags,
  badges: [],
});

function filterClient(listToolMeta?: () => Promise<never>) {
  return stubClient({
    listAgents: listOf(
      agent({ name: 'writer', description: 'Drafts long-form text' }),
      agent({ name: 'planner', description: 'Breaks a goal into steps' }),
    ),
    listToolMeta:
      listToolMeta ??
      (() =>
        Promise.resolve({
          folders: [],
          meta: [tagged('writer', ['text']), tagged('planner', ['steps'])],
        })),
  });
}

describe('AgentsPage filter', () => {
  it('filters by the committed ?q= over the name', async () => {
    renderWithProviders(<AgentsPage search={{ q: 'writ' }} />, filterClient(), {
      projection: fullProjection(),
    });

    expect(await screen.findByRole('textbox', { name: 'Filter agents' })).toHaveValue('writ');
    expect(await findAgentNames('registered')).toEqual(['writer']);
  });

  it('filters by the committed ?q= over the description', async () => {
    renderWithProviders(<AgentsPage search={{ q: 'goal' }} />, filterClient(), {
      projection: fullProjection(),
    });

    expect(await findAgentNames('registered')).toEqual(['planner']);
  });

  it('commits the trimmed query to ?q= on Enter, keeping the tags', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(
      <AgentsPage search={{ tags: ['text'] }} />,
      filterClient(),
      { projection: fullProjection() },
    );

    await user.type(await screen.findByRole('textbox', { name: 'Filter agents' }), '  wri {Enter}');
    expect(navigate).toHaveBeenCalledWith(
      'agents',
      { tags: ['text'], q: 'wri' },
      { replace: true },
    );
  });

  it('filters by the selected tags and adds a tag through its chip', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(
      <AgentsPage search={{ tags: ['text'] }} />,
      filterClient(),
      { projection: fullProjection() },
    );

    expect(await findAgentNames('registered')).toEqual(['writer']);
    await user.click(await screen.findByRole('button', { name: 'steps (1)' }));
    expect(navigate).toHaveBeenCalledWith('agents', { tags: ['text', 'steps'], q: undefined });
  });

  it('offers no tag chips when the overlay read fails', async () => {
    renderWithProviders(
      <AgentsPage search={{}} />,
      filterClient(() => Promise.reject(new Error('overlay store unreachable'))),
      { projection: fullProjection() },
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('overlay store unreachable');
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Filter agents by tag' })).toBeNull();
    });
    expect(screen.getByRole('textbox', { name: 'Filter agents' })).toBeInTheDocument();
  });
});
