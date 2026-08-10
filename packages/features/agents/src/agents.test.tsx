import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AgentSummary } from '@tai42/api-client';

import { AgentsPage } from './agents';
import { ERROR_TRANSCRIPT, FULL_TRANSCRIPT, OPEN_TRANSCRIPT, parse } from './fixtures';
import {
  agent,
  fullProjection,
  hangingStream,
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
 * Every rendered control whose accessible name omits the words it SHOWS.
 *
 * WCAG 2.5.3 (Label in Name): a voice-control user says what they can read, so
 * an `aria-label` must contain the control's visible text. Derived over the
 * rendered DOM, so a control added later is judged by the same rule. Controls
 * with no visible text (an icon-only button) are outside the criterion.
 */
function labelInNameFailures(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[aria-label]')]
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

    await userEvent.click(await screen.findByRole('button', { name: 'Run' }));

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

    const row = await screen.findByTestId('agent-row');
    expect(row).toHaveAttribute('data-agent', 'writer');
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

    await userEvent.click(await screen.findByRole('button', { name: 'Run' }));
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

    await userEvent.click(await screen.findByRole('button', { name: 'Run' }));
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

    await userEvent.click(await screen.findByRole('button', { name: 'Run' }));
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

    await userEvent.click(await screen.findByRole('button', { name: 'Run' }));
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
