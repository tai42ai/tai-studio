/**
 * The agent-authoring surface, minus the compose dialog (its own suites):
 *  - the capability gate (empty-state when no authorable agent; the run UI stays,
 *    and Compose is method-aware on the presets write route);
 *  - the authored agents as a group on the authoring surface (loading while their
 *    reads load, "No authored agents yet" with the Compose hint for a caller who may
 *    compose) and each entry's kind in the list and card views;
 *  - the authored agents in the one agents explorer (derived, distinct from
 *    tool-presets) with their streaming run, their baked-field read-only display,
 *    and a Manage link out to the presets-page detail;
 *  - a run whose stream open 400s surfaces the server message verbatim;
 *  - user-supplied names render as ESCAPED text (XSS-safe).
 */
import { ApiError } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentsPage } from './agents';
import { FULL_TRANSCRIPT, parse } from './fixtures';
import {
  agent,
  authorableAgent,
  findAgentNames,
  findAgentRow,
  fullProjection,
  presetDetail,
  presetRecord,
  renderWithProviders,
  scopedProjection,
  scriptedStream,
  stubClient,
} from './test-utils';

function listOf(...agents: ReturnType<typeof agent>[]) {
  return () => Promise.resolve({ items: agents, total: agents.length });
}

describe('capability gate', () => {
  it('shows the empty-state when no agent is authorable, while the run list still shows', async () => {
    const client = stubClient({
      listSpecRunnableAgents: listOf(),
      listAgents: listOf(agent({ name: 'writer', tool_name: 'writer' })),
    });
    renderWithProviders(<AgentsPage />, client);

    expect(await screen.findByText('No authorable agent installed')).toBeInTheDocument();
    // The plain run UI is unaffected: the registered agent is still listed.
    expect(await findAgentRow('writer', 'registered')).toBeInTheDocument();
  });

  it('fails closed while the projection is not ready — no Compose before the gate is known', async () => {
    // With no projection the capability context stays loading; the write action must
    // stay hidden (fail-safe) even though an authorable agent exists.
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
    });
    renderWithProviders(<AgentsPage />, client);

    // The agents still list, but the write action is gone.
    expect(await findAgentRow('authorable_agent', 'registered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compose agent' })).not.toBeInTheDocument();
    expect(screen.queryByText('No authorable agent installed')).not.toBeInTheDocument();
  });

  it('hides Compose for a read-scoped session whose projection lacks the presets write route', async () => {
    // The compose action POSTs `/api/presets`; a projection that cannot reach it
    // must degrade to read-only rather than offer an action that 403s.
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
    });
    renderWithProviders(<AgentsPage />, client, {
      projection: scopedProjection({
        routes: [{ path: '/api/agents', methods: ['GET'] }],
        agents: [authorableAgent().name],
      }),
    });

    // The agents still list read-only, but the write action is gone.
    expect(await findAgentRow('authorable_agent', 'registered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compose agent' })).not.toBeInTheDocument();
  });

  it('hides Compose for a VIEWER whose projection admits only GET on the presets route', async () => {
    // A read-scoped VIEWER carries `/api/presets` but with GET-only methods (its jq
    // fence denies POST). The gate is method-aware, so the write action stays hidden
    // — a path-only gate would over-show a button that 403s on submit.
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
    });
    renderWithProviders(<AgentsPage />, client, {
      projection: scopedProjection({
        routes: [{ path: '/api/presets', methods: ['GET'] }],
        agents: [authorableAgent().name],
      }),
    });

    expect(await findAgentRow('authorable_agent', 'registered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compose agent' })).not.toBeInTheDocument();
  });

  it('offers Compose for a scoped session whose projection covers the presets write route', async () => {
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
    });
    renderWithProviders(<AgentsPage />, client, {
      projection: scopedProjection({
        routes: [
          { path: '/api/agents', methods: ['GET'] },
          { path: '/api/presets', methods: ['GET', 'POST'] },
        ],
        agents: [authorableAgent().name],
      }),
    });

    expect(await screen.findByRole('button', { name: 'Compose agent' })).toBeInTheDocument();
  });

  it('offers Compose for a full projection', async () => {
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
    });
    renderWithProviders(<AgentsPage />, client, { projection: fullProjection() });

    expect(await screen.findByRole('button', { name: 'Compose agent' })).toBeInTheDocument();
  });
});

describe('the authored agents as a group', () => {
  // The explorer persists its list/card choice per surface in localStorage; clear it
  // so the card-view case leaves later tests on the list.
  afterEach(() => {
    globalThis.localStorage.clear();
  });

  const COMPOSE_HINT = 'Compose an agent to bake a prompt, tools, and presets over a base agent.';

  it('says there are no authored agents yet and how to compose one', async () => {
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
    });
    renderWithProviders(<AgentsPage />, client, { projection: fullProjection() });

    expect(await screen.findByText('No authored agents yet')).toBeInTheDocument();
    expect(screen.getByText(COMPOSE_HINT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compose agent' })).toBeInTheDocument();
  });

  it('says there are none yet to a read-only caller, without naming Compose', async () => {
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
    });
    renderWithProviders(<AgentsPage />, client, {
      projection: scopedProjection({
        routes: [{ path: '/api/presets', methods: ['GET'] }],
        agents: [authorableAgent().name],
      }),
    });

    expect(await screen.findByText('No authored agents yet')).toBeInTheDocument();
    expect(screen.queryByText(COMPOSE_HINT)).not.toBeInTheDocument();
  });

  it('shows loading while the presets load, then the authored agents', async () => {
    let resolvePresets: (presets: ReturnType<typeof presetRecord>[]) => void = () => undefined;
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
      listPresets: () =>
        new Promise((resolve) => {
          resolvePresets = resolve;
        }),
    });
    renderWithProviders(<AgentsPage />, client, { projection: fullProjection() });

    expect(await screen.findByTestId('authored-agents-loading')).toBeInTheDocument();
    // Loading never claims there are none.
    expect(screen.queryByText('No authored agents yet')).not.toBeInTheDocument();

    resolvePresets([presetRecord({ name: 'assistant', base_tool: 'authorable_agent' })]);
    expect(
      await screen.findByText('assistant', { selector: '[data-kind="authored"]' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('authored-agents-loading')).not.toBeInTheDocument();
    expect(screen.queryByText('No authored agents yet')).not.toBeInTheDocument();
  });

  it('does not claim none yet when the presets read failed', async () => {
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
      listPresets: () => Promise.reject(new ApiError('presets store down', 500)),
    });
    renderWithProviders(<AgentsPage />, client, { projection: fullProjection() });

    expect(await screen.findByText(/Authored agents could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('No authored agents yet')).not.toBeInTheDocument();
  });

  it('tells an authored agent from a registered one in the card view too', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
      listPresets: () =>
        Promise.resolve([presetRecord({ name: 'assistant', base_tool: 'authorable_agent' })]),
    });
    renderWithProviders(<AgentsPage />, client, { projection: fullProjection() });

    await findAgentRow('assistant', 'authored');
    await user.click(screen.getByRole('radio', { name: 'Card view' }));
    const cards = await screen.findAllByRole('listitem');
    const cardOf = (name: string): HTMLElement => {
      const card = cards.find(
        (item) => within(item).queryByText(name, { selector: '[data-agent]' }) !== null,
      );
      if (card === undefined) throw new Error(`no card for ${name}`);
      return card;
    };
    expect(within(cardOf('assistant')).getByText('Authored')).toBeInTheDocument();
    expect(within(cardOf('authorable_agent')).getByText('Registered')).toBeInTheDocument();
  });
});

describe('authored agents in the agents explorer', () => {
  function authoredClient(over = {}) {
    return stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
      listPresets: () =>
        Promise.resolve([presetRecord({ name: 'assistant', base_tool: 'authorable_agent' })]),
      ...over,
    });
  }

  it('lists an authored agent with a Manage link to its presets-page detail', async () => {
    renderWithProviders(<AgentsPage />, authoredClient());

    const row = await findAgentRow('assistant', 'authored');
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    expect(within(row).getByText('Authored')).toBeInTheDocument();
    // Versioning/rollback/delete live on the presets page; Manage links out there
    // with the preset search param (never duplicating those controls here).
    const manage = within(row).getByRole('link', { name: /Manage authored agent assistant/ });
    expect(manage).toHaveAttribute('href', '/presets?preset=assistant');
  });

  it('opens Manage (its canonical destination) when the row body is clicked', async () => {
    const { navigate } = renderWithProviders(<AgentsPage />, authoredClient());

    const row = await findAgentRow('assistant', 'authored');
    // The description cell is plain, non-interactive text — a body click, which
    // opens the row's one canonical destination (Manage → the presets page).
    await userEvent.click(within(row).getByText('An assistant agent'));
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'assistant' });
  });

  it('leaves Run to run and Manage to manage — the row yields to both, no double-nav', async () => {
    const { navigate } = renderWithProviders(<AgentsPage />, authoredClient());

    const row = await findAgentRow('assistant', 'authored');
    // The Manage link navigates exactly once (the row-open yields to it).
    await userEvent.click(
      within(row).getByRole('link', { name: /Manage authored agent assistant/ }),
    );
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'assistant' });

    // The Run button is an action, not the row's destination: it never navigates.
    navigate.mockClear();
    await userEvent.click(
      within(row).getByRole('button', { name: 'Run authored agent assistant' }),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('degrades to absence (no wall) when the presets read fails/uncovered, keeping the authorable content', async () => {
    // A scoped caller reaching `/api/agents` but not `/api/presets` gets a 403 on the
    // presets read. That read only enriches registered agents into authored entries, so
    // the explorer lists the registered agents alone rather than walling this reachable
    // surface — the authorable content (driven by the specRunnable read) still renders.
    renderWithProviders(
      <AgentsPage />,
      authoredClient({ listPresets: () => Promise.reject(new ApiError('forbidden', 403)) }),
    );

    expect(await findAgentNames('registered')).toEqual(['authorable_agent']);
    expect(screen.queryAllByTestId('agent-name').map((node) => node.dataset.kind)).toEqual([
      'registered',
    ]);
    // No ErrorState walls the list, and the authorable-agent gate never trips.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('No authorable agent installed')).not.toBeInTheDocument();
  });

  it.each([
    ['a 500', new ApiError('presets exploded', 500)],
    ['a network drop', new TypeError('Failed to fetch')],
  ])(
    'surfaces %s from the presets read instead of degrading it to absence',
    async (_label, rejection) => {
      // Only the scoped-caller 403 is absence. Every other class is a real failure and
      // must SAY so — silently listing no authored agent tells the operator the
      // deployment has none when the read simply never landed.
      renderWithProviders(
        <AgentsPage />,
        authoredClient({ listPresets: () => Promise.reject(rejection) }),
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(rejection.message);
      // The list itself is NOT walled — the agents read succeeded, so it still renders.
      expect(await findAgentRow('authorable_agent', 'registered')).toBeInTheDocument();
      expect(screen.queryByText('No authorable agent installed')).not.toBeInTheDocument();
    },
  );

  it('resolves an authored agent whose base agent tool_name differs from its registration name', async () => {
    // base_tool is the registration name, so the list must map it back by name, not
    // tool_name — otherwise a divergent-name agent's authored rows vanish.
    const diverging = authorableAgent({ name: 'reg_name', tool_name: 'different_tool' });
    renderWithProviders(
      <AgentsPage />,
      authoredClient({
        listSpecRunnableAgents: listOf(diverging),
        listAgents: listOf(diverging),
        listPresets: () =>
          Promise.resolve([presetRecord({ name: 'assistant', base_tool: 'reg_name' })]),
      }),
    );

    const row = await findAgentRow('assistant', 'authored');
    // Base-agent column shows the registration name resolved via base_tool.
    expect(within(row).getByText('reg_name')).toBeInTheDocument();
  });

  it('runs an authored agent with live streaming (reusing the SSE run panel)', async () => {
    const streamAuthoredAgentRun = vi.fn(scriptedStream(parse(FULL_TRANSCRIPT)));
    const getPreset = vi.fn(() =>
      Promise.resolve(
        presetDetail({
          name: 'assistant',
          base_tool: 'authorable_agent',
          fixed_kwargs: { system_prompt: 'You are a helpful assistant.' },
        }),
      ),
    );
    renderWithProviders(<AgentsPage />, authoredClient({ streamAuthoredAgentRun, getPreset }), {
      projection: fullProjection(),
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Run authored agent assistant' }),
    );
    // Now in the authored run view; start the run.
    await userEvent.click(await screen.findByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Finished')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-message')).toHaveTextContent('Here you go');
    // The baked field is resolved server-side, so it is NOT an input control here.
    expect(screen.queryByLabelText('system_prompt')).not.toBeInTheDocument();
    // ...and the run body carries ONLY the remaining (non-baked) fields.
    const runInput = streamAuthoredAgentRun.mock.lastCall?.[1];
    expect(runInput).not.toHaveProperty('system_prompt');
    expect(runInput).toHaveProperty('user_message');
  });

  it('walls the authored run view when its preset detail read fails, keeping the way back', async () => {
    // Without the preset detail there is no baked-field set and no reduced schema, so
    // the run form cannot be rendered honestly — the read is walled and the operator
    // keeps a route back to the list.
    const getPreset = vi.fn(() => Promise.reject(new ApiError('preset read failed', 500)));
    renderWithProviders(<AgentsPage />, authoredClient({ getPreset }), {
      projection: fullProjection(),
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Run authored agent assistant' }),
    );

    expect(await screen.findByText('preset read failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to agents' })).toBeInTheDocument();
    // `←`/`→` are in NO shipped font subset, so a literal arrow paints in a
    // platform fallback face beside Inter. The icon set carries the mark instead.
    expect(document.body.textContent).not.toMatch(/[\u2190\u2192]/u);
  });

  it('shows the authored run read-only (no Run) for a scoped caller who cannot reach the authored-run door', async () => {
    const streamAuthoredAgentRun = vi.fn();
    const getPreset = vi.fn(() =>
      Promise.resolve(
        presetDetail({
          name: 'assistant',
          base_tool: 'authorable_agent',
          fixed_kwargs: { system_prompt: 'You are a helpful assistant.' },
        }),
      ),
    );
    // The authored agent is visible (its preset reads), but the projection lists no POST
    // on the authored-run route, so the run degrades to read-only.
    renderWithProviders(<AgentsPage />, authoredClient({ streamAuthoredAgentRun, getPreset }), {
      projection: scopedProjection({ routes: [{ path: '/api/agents', methods: ['GET'] }] }),
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Run authored agent assistant' }),
    );
    const note = await screen.findByTestId('run-read-only-note');
    expect(note).toHaveAttribute('role', 'status');
    expect(note).toHaveTextContent(
      'Running this agent is outside your access — it is shown read-only.',
    );
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
    expect(streamAuthoredAgentRun).not.toHaveBeenCalled();
  });

  it('surfaces a run-open 400 server message verbatim in the run panel', async () => {
    // The stream opener throws the server's verbatim `{ "error" }` message; it
    // must reach the run panel intact, not collapse to a bare status text.
    const message =
      "cannot override the fixed field 'system_prompt' baked into this authored agent";
    const streamAuthoredAgentRun = vi.fn(() => Promise.reject(new ApiError(message, 400)));
    const getPreset = vi.fn(() =>
      Promise.resolve(
        presetDetail({
          name: 'assistant',
          base_tool: 'authorable_agent',
          fixed_kwargs: { system_prompt: 'You are a helpful assistant.' },
        }),
      ),
    );
    renderWithProviders(<AgentsPage />, authoredClient({ streamAuthoredAgentRun, getPreset }), {
      projection: fullProjection(),
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Run authored agent assistant' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Run' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(message)).toBeInTheDocument();
  });

  it('excludes a preset whose base_tool is a plain tool (not an agent) from the list', async () => {
    renderWithProviders(
      <AgentsPage />,
      authoredClient({
        listPresets: () =>
          Promise.resolve([
            presetRecord({ name: 'assistant', base_tool: 'authorable_agent' }),
            // A plain-tool preset (its base is not an agent registration name) — it
            // lives on the presets page, never among the authored agents.
            presetRecord({ name: 'plain_preset', base_tool: 'echo' }),
          ]),
      }),
    );

    expect(await findAgentNames('authored')).toEqual(['assistant']);
    expect(screen.queryByText('plain_preset')).toBeNull();
  });

  it('shows baked fields read-only and drops them from the run form (properties AND required)', async () => {
    // The base agent declares a generic knob (`count`) beyond the spec vocabulary,
    // and marks it REQUIRED — reduceSchema must drop it from `required` too, else the
    // run form would demand a control that no longer exists and block the run.
    const knobAgent = authorableAgent({
      input_schema: {
        type: 'object',
        required: ['count'],
        properties: {
          user_message: { type: 'string', default: '' },
          system_prompt: { type: 'string', default: '' },
          count: { type: 'number' },
        },
      },
    });
    const getPreset = vi.fn(() =>
      Promise.resolve(
        presetDetail({
          name: 'assistant',
          base_tool: 'authorable_agent',
          fixed_kwargs: { system_prompt: 'You are a helpful assistant.', count: 3 },
        }),
      ),
    );
    const streamAuthoredAgentRun = vi.fn(scriptedStream([]));
    renderWithProviders(
      <AgentsPage />,
      authoredClient({
        listSpecRunnableAgents: listOf(knobAgent),
        listAgents: listOf(knobAgent),
        getPreset,
        streamAuthoredAgentRun,
      }),
      { projection: fullProjection() },
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Run authored agent assistant' }),
    );

    // Baked fields render read-only above the run form...
    const baked = await screen.findByTestId('run-baked-fields');
    expect(within(baked).getByText('count')).toBeInTheDocument();
    expect(within(baked).getByText('system_prompt')).toBeInTheDocument();
    // ...and neither the baked spec field nor the baked generic knob is a run input.
    expect(screen.queryByLabelText('count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('system_prompt')).not.toBeInTheDocument();
    // The non-baked query field remains editable.
    expect(screen.getByLabelText('user_message')).toBeInTheDocument();

    // The run starts: `count` was dropped from `required`, so validation passes with
    // no control for it — a baked required key left in `required` would block here.
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => {
      expect(streamAuthoredAgentRun).toHaveBeenCalled();
    });
  });

  it('escapes an arbitrary authored-agent name (XSS-safe)', async () => {
    const evil = '<script>alert(1)</script>';
    renderWithProviders(
      <AgentsPage />,
      authoredClient({
        listPresets: () =>
          Promise.resolve([presetRecord({ name: evil, base_tool: 'authorable_agent' })]),
      }),
    );

    const row = await findAgentRow(evil, 'authored');
    // Rendered as TEXT (React escapes it), never a live <script> sink.
    expect(row).toHaveTextContent(evil);
    expect(row.querySelector('script')).toBeNull();
  });
});
