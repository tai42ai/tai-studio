/**
 * Agent-authoring surface:
 *  - the capability gate (empty-state when no authorable agent; the run UI stays);
 *  - the compose dialog builds a valid `fixed_kwargs` from the pickers, EXPANDS a
 *    stored preset into an inline `PresetSpec` OBJECT, excludes
 *    conflicted/quarantined rows, carries `tags`, offers an opt-in bake checklist
 *    for non-spec fields, invalidates the tools list, and surfaces a server 400
 *    loudly;
 *  - the authored-agents list (derived, distinct from tool-presets) with its
 *    streaming run, its baked-field read-only display, and a Manage link out to the
 *    presets-page detail;
 *  - a run whose stream open 400s surfaces the server message verbatim;
 *  - user-supplied names render as ESCAPED text (XSS-safe).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

import { ApiError, type CreatePresetBody, type PresetDetail } from '@tai42/api-client';
import { toolsListKey } from '@tai42/studio-sdk';
import { StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';

import { AgentsPage } from './agents';
import { ComposeAgentDialog } from './authoring';
import { FULL_TRANSCRIPT, parse } from './fixtures';
import {
  agent,
  authorableAgent,
  fullProjection,
  presetRecord,
  renderWithProviders,
  scopedProjection,
  scriptedStream,
  stubClient,
} from './test-utils';

function listOf(...agents: ReturnType<typeof agent>[]) {
  return () => Promise.resolve({ items: agents, total: agents.length });
}

const presetDetail = (over: Partial<PresetDetail> = {}): PresetDetail => ({
  name: 'echo_pinned',
  base_tool: 'echo',
  description: 'Pinned echo',
  active_version: 1,
  extensions: [],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
  uses: [],
  used_by: [],
  fixed_kwargs: {},
  ...over,
});

describe('capability gate', () => {
  it('shows the empty-state when no agent is authorable, while the run list still shows', async () => {
    const client = stubClient({
      listSpecRunnableAgents: listOf(),
      listAgents: listOf(agent({ name: 'writer', tool_name: 'writer' })),
    });
    renderWithProviders(<AgentsPage />, client);

    expect(await screen.findByText('No authorable agent installed')).toBeInTheDocument();
    // The plain run UI is unaffected: the registered agent is still listed.
    expect(await screen.findByTestId('agent-row')).toHaveAttribute('data-agent', 'writer');
  });

  it('fails closed while the projection is not ready — no Compose before the gate is known', async () => {
    // With no projection the capability context stays loading; the write action must
    // stay hidden (fail-safe) even though an authorable agent exists.
    const client = stubClient({
      listSpecRunnableAgents: listOf(authorableAgent()),
      listAgents: listOf(authorableAgent()),
    });
    renderWithProviders(<AgentsPage />, client);

    // The authoring section renders (its authored list shows) but the write action is gone.
    expect(await screen.findByText('No authored agents yet')).toBeInTheDocument();
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

    // The authoring section rendered read-only (its authored list shows) but the
    // write action is gone.
    expect(await screen.findByText('No authored agents yet')).toBeInTheDocument();
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

    expect(await screen.findByText('No authored agents yet')).toBeInTheDocument();
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

describe('ComposeAgentDialog', () => {
  function composeClient(over = {}) {
    return stubClient({
      listTools: () => Promise.resolve(['echo', 'weather']),
      listToolTags: () => Promise.resolve([]),
      listPresets: () => Promise.resolve([]),
      createPreset: vi.fn(() => Promise.resolve(presetRecord())),
      ...over,
    });
  }

  async function pickBaseAgent(): Promise<void> {
    await userEvent.click(await screen.findByRole('combobox', { name: 'Base agent' }));
    // The option label is `name — description`, so match by the name fragment.
    await userEvent.click(await screen.findByRole('option', { name: /authorable_agent/ }));
  }

  // Name + description — both REQUIRED, both gate submit. Used by every test that
  // drives a successful create (an empty description would block it like a missing name).
  async function fillNameAndDescription(name: string): Promise<void> {
    await userEvent.type(screen.getByLabelText('Name'), name);
    await userEvent.type(screen.getByLabelText('Description'), 'An assistant agent');
  }

  it('builds a valid fixed_kwargs from the pickers and submits POST /api/presets', async () => {
    const createPreset = vi.fn((_body: CreatePresetBody) => Promise.resolve(presetRecord()));
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    await fillNameAndDescription('assistant');
    await pickBaseAgent();

    await userEvent.type(screen.getByLabelText('System prompt'), 'You are a helpful assistant.');

    // Add a tool via the reused ToolPicker.
    await userEvent.click(await screen.findByRole('combobox', { name: 'Add a tool' }));
    await userEvent.click(await screen.findByRole('option', { name: 'echo' }));
    // A picked tool reads as a TAG, so its chip wears the published pair rather
    // than a local copy of the shape.
    expect(screen.getByText('echo', { selector: 'span' }).closest('.tai-chip')).toHaveClass(
      'tai-chip-static',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    await waitFor(() => {
      // NO tags key on the create body — overlay tags are written separately, after.
      expect(createPreset).toHaveBeenCalledWith({
        name: 'assistant',
        base_tool: 'authorable_agent',
        description: 'An assistant agent',
        fixed_kwargs: {
          system_prompt: 'You are a helpful assistant.',
          tool_names: ['echo'],
        },
      });
    });
    // An un-checked non-spec field (user_message) is never baked into fixed_kwargs.
    const body = createPreset.mock.lastCall?.[0];
    expect(body).toBeDefined();
    expect(body?.fixed_kwargs).not.toHaveProperty('user_message');
  });

  it('labels a tool option "Display (raw)" and shows the bare display name on its chip', async () => {
    renderWithProviders(
      <StaticToolDisplayNamesProvider names={{ echo: 'Echo' }}>
        <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />
      </StaticToolDisplayNamesProvider>,
      composeClient(),
    );

    await pickBaseAgent();

    await userEvent.click(await screen.findByRole('combobox', { name: 'Add a tool' }));
    // The option carries the human name with the raw name in parentheses.
    await userEvent.click(await screen.findByRole('option', { name: 'Echo (echo)' }));

    // The chip is a COMPACT surface: it shows the bare display name, not `Display (raw)`.
    const chip = screen.getByText('Echo', { selector: 'span' }).closest('.tai-chip');
    expect(chip).toHaveClass('tai-chip-static');
    expect(screen.queryByText('Echo (echo)', { selector: 'span' })).toBeNull();
  });

  it('HIDES the tags input when the tool_meta kind is OFF, and still composes', async () => {
    const createPreset = vi.fn(() => Promise.resolve(presetRecord()));
    const upsertToolMeta = vi.fn();
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({ createPreset, upsertToolMeta }),
      // The kind-status table reports the overlay store OFF, so the tags input is
      // withdrawn PROACTIVELY — an author can never type tags the OFF overlay drops.
      { systemKinds: [{ kind: 'tool_meta', state: 'off', plugin: null, detail: '' }] },
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Tags')).toBeNull();
    });

    // The compose still works with the input hidden, and never writes the overlay.
    await fillNameAndDescription('assistant');
    await pickBaseAgent();
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));
    await waitFor(() => {
      expect(createPreset).toHaveBeenCalledTimes(1);
    });
    expect(upsertToolMeta).not.toHaveBeenCalled();
  });

  it('KEEPS the tags input when the tool_meta kind is active', async () => {
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient(),
      { systemKinds: [{ kind: 'tool_meta', state: 'active', plugin: 'overlay', detail: '' }] },
    );
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    });
  });

  it('submits the base agent REGISTRATION name as base_tool (not tool_name, which can differ)', async () => {
    // The backend registers/resolves the agent run tool under its REGISTRATION name,
    // which can differ from tool_name; base_tool must be the registration name.
    const createPreset = vi.fn(() => Promise.resolve(presetRecord()));
    const diverging = authorableAgent({ name: 'reg_name', tool_name: 'different_tool' });
    renderWithProviders(
      <ComposeAgentDialog agents={[diverging]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    await fillNameAndDescription('assistant');
    await userEvent.click(await screen.findByRole('combobox', { name: 'Base agent' }));
    await userEvent.click(await screen.findByRole('option', { name: /reg_name/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    await waitFor(() => {
      expect(createPreset).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'assistant', base_tool: 'reg_name' }),
      );
    });
  });

  it('EXPANDS a stored preset into an inline PresetSpec OBJECT (not a name reference)', async () => {
    const createPreset = vi.fn((_body: CreatePresetBody) => Promise.resolve(presetRecord()));
    const getPreset = vi.fn(() =>
      Promise.resolve(presetDetail({ base_tool: 'echo', fixed_kwargs: { pinned: true } })),
    );
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({
        createPreset,
        getPreset,
        listPresets: () =>
          Promise.resolve([
            presetRecord({ name: 'echo_pinned', base_tool: 'echo', conflicted: false }),
          ]),
      }),
    );

    await fillNameAndDescription('assistant');
    await pickBaseAgent();

    await userEvent.click(await screen.findByRole('combobox', { name: 'Custom node to expand' }));
    await userEvent.click(await screen.findByRole('option', { name: 'echo_pinned' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add custom node' }));

    // The stored preset resolved into an inline object.
    const entry = await screen.findByTestId('compose-presets-entry');
    // A chip is a TAG, so it wears the published pair rather than a third local
    // copy of the shape — and with it the narrow-viewport wrapping that copy
    // lacked.
    expect(entry).toHaveClass('tai-chip', 'tai-chip-static');
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    await waitFor(() => {
      expect(createPreset).toHaveBeenCalled();
    });
    const body = createPreset.mock.lastCall?.[0];
    const inlinePresets = (body?.fixed_kwargs?.presets ?? []) as unknown[];
    expect(inlinePresets).toEqual([
      {
        name: 'echo_pinned',
        description: 'Pinned echo',
        base_tool: 'echo',
        fixed_kwargs: { pinned: true },
      },
    ]);
    // Crucially an OBJECT, never the bare stored name.
    expect(inlinePresets[0]).not.toBe('echo_pinned');
    expect(typeof inlinePresets[0]).toBe('object');
    expect(getPreset).toHaveBeenCalledWith('echo_pinned');
  });

  it('excludes conflicted/quarantined preset rows from the picker', async () => {
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({
        listPresets: () =>
          Promise.resolve([
            presetRecord({ name: 'echo_pinned', base_tool: 'echo', conflicted: false }),
            presetRecord({ name: 'quarantined', base_tool: 'echo', conflicted: true }),
          ]),
      }),
    );

    await pickBaseAgent();
    await userEvent.click(await screen.findByRole('combobox', { name: 'Custom node to expand' }));

    expect(await screen.findByRole('option', { name: 'echo_pinned' })).toBeInTheDocument();
    // A conflicted record is delete-only and must never seed a composition.
    expect(screen.queryByRole('option', { name: 'quarantined' })).toBeNull();
  });

  it('excludes an EFFECTIVE-hidden tool from the tools picker, keeping an overlay-`false` unhidden one', async () => {
    // `secret` is plugin-hidden with no overlay opinion → excluded. `open_tool` is
    // plugin-hidden but the overlay forces it visible (`hidden: false`) → offered.
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({
        listTools: () => Promise.resolve(['echo', 'secret', 'open_tool']),
        listToolTags: () =>
          Promise.resolve([
            { name: 'echo', tags: [], hidden: false },
            { name: 'secret', tags: [], hidden: true },
            { name: 'open_tool', tags: [], hidden: true },
          ]),
        listToolMeta: () =>
          Promise.resolve({
            folders: [],
            meta: [
              {
                tool_name: 'open_tool',
                display_name: null,
                folder_id: null,
                tags: [],
                hidden: false,
              },
            ],
          }),
      }),
    );

    await pickBaseAgent();
    await userEvent.click(await screen.findByRole('combobox', { name: 'Add a tool' }));

    expect(await screen.findByRole('option', { name: 'echo' })).toBeInTheDocument();
    // The overlay UNHIDES the plugin-hidden `open_tool`, so it IS offered.
    expect(screen.getByRole('option', { name: 'open_tool' })).toBeInTheDocument();
    // The effective-hidden `secret` is absent from the picker.
    expect(screen.queryByRole('option', { name: 'secret' })).toBeNull();
  });

  it('surfaces a server 400 (an unknown/blocked reference) loudly', async () => {
    const createPreset = vi.fn(() =>
      Promise.reject(
        new ApiError("fixed_kwargs...tool_names references unknown tool 'ghost'", 400),
      ),
    );
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    await fillNameAndDescription('assistant');
    await pickBaseAgent();
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/references unknown tool 'ghost'/)).toBeInTheDocument();
  });

  it('writes the entered tags to the tool_meta overlay AFTER create, not in the body', async () => {
    const createPreset = vi.fn((_body: CreatePresetBody) => Promise.resolve(presetRecord()));
    const upsertToolMeta = vi.fn(() =>
      Promise.resolve({
        tool_name: 'assistant',
        display_name: null,
        folder_id: null,
        tags: ['assistant'],
        hidden: null,
      }),
    );
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({ createPreset, upsertToolMeta }),
    );

    await fillNameAndDescription('assistant');
    await pickBaseAgent();
    await userEvent.type(screen.getByLabelText('Tags'), 'assistant');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    await waitFor(() => {
      expect(createPreset).toHaveBeenCalled();
    });
    // The create body carries NO tags key…
    expect(createPreset.mock.lastCall?.[0]).not.toHaveProperty('tags');
    // …the tags land in the overlay, keyed by the composed agent's tool name, after.
    await waitFor(() => {
      expect(upsertToolMeta).toHaveBeenCalledWith('assistant', { tags: ['assistant'] });
    });
  });

  it('completes the compose even when the overlay tag write is refused as not-configured', async () => {
    const createPreset = vi.fn((_body: CreatePresetBody) => Promise.resolve(presetRecord()));
    const upsertToolMeta = vi
      .fn()
      .mockRejectedValue(new ApiError('not configured', 501, 'tool-meta-not-configured'));
    const onClose = vi.fn();
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={onClose} />,
      composeClient({ createPreset, upsertToolMeta }),
    );

    await fillNameAndDescription('assistant');
    await pickBaseAgent();
    await userEvent.type(screen.getByLabelText('Tags'), 'assistant');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    // The compose succeeds and closes: the store-off tag write is a no-op, never a
    // failure that turns a successful create red.
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(createPreset).toHaveBeenCalled();
    expect(upsertToolMeta).toHaveBeenCalledWith('assistant', { tags: ['assistant'] });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('blocks submit and shows the field error when the description is empty', async () => {
    const createPreset = vi.fn(() => Promise.resolve(presetRecord()));
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    // Name + base are set but the description is blank — blocked like a missing name.
    await userEvent.type(screen.getByLabelText('Name'), 'assistant');
    await pickBaseAgent();
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    expect(screen.getByText('A description is required.')).toBeInTheDocument();
    expect(createPreset).not.toHaveBeenCalled();
  });

  // A base agent declaring a non-spec bakeable knob (e.g. a step budget) beyond the
  // curated spec vocabulary — the server bakes any ToolInput field.
  const agentWithKnob = () =>
    authorableAgent({
      input_schema: {
        type: 'object',
        properties: {
          user_message: { type: 'string', default: '' },
          system_prompt: { type: 'string', default: '' },
          count: { type: 'number', description: 'Max steps' },
        },
      },
    });

  it('offers an opt-in bake checklist for non-spec fields only (never the curated spec fields)', async () => {
    renderWithProviders(
      <ComposeAgentDialog agents={[agentWithKnob()]} onClose={vi.fn()} />,
      composeClient(),
    );
    await pickBaseAgent();

    // The non-spec knobs are opt-in bake checkboxes...
    expect(await screen.findByRole('checkbox', { name: /count/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /user_message/ })).toBeInTheDocument();
    // ...but a curated spec field is edited by its own control, never the checklist.
    expect(screen.queryByRole('checkbox', { name: /system_prompt/ })).toBeNull();
  });

  it('bakes a CHECKED non-spec field into fixed_kwargs (opt-in), coerced by the subset form', async () => {
    const createPreset = vi.fn((_body: CreatePresetBody) => Promise.resolve(presetRecord()));
    renderWithProviders(
      <ComposeAgentDialog agents={[agentWithKnob()]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    await fillNameAndDescription('bounded_agent');
    await pickBaseAgent();
    await userEvent.click(await screen.findByRole('checkbox', { name: /count/ }));
    // Checking the field surfaces its subset-form input (a number spinbutton,
    // distinct from the checkbox); set a value and submit.
    await userEvent.type(await screen.findByRole('spinbutton', { name: 'count' }), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    await waitFor(() => {
      expect(createPreset).toHaveBeenCalled();
    });
    const body = createPreset.mock.lastCall?.[0];
    expect(body?.fixed_kwargs).toEqual(expect.objectContaining({ count: 3 }));
  });

  it('bakes a $ref-typed non-spec field (schema $defs preserved into the subset form)', async () => {
    // A Pydantic-style enum knob arrives as a `$ref` into `$defs`; the subset form
    // and its seed must resolve it against the root, not crash on an orphan ref.
    const createPreset = vi.fn((_body: CreatePresetBody) => Promise.resolve(presetRecord()));
    const refAgent = authorableAgent({
      input_schema: {
        type: 'object',
        $defs: { Mode: { type: 'string', enum: ['fast', 'slow'] } },
        properties: {
          user_message: { type: 'string', default: '' },
          mode: { $ref: '#/$defs/Mode' },
        },
      },
    });
    renderWithProviders(
      <ComposeAgentDialog agents={[refAgent]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    await fillNameAndDescription('moded_agent');
    await pickBaseAgent();
    // Checking the $ref field renders its resolved enum control (does not throw).
    await userEvent.click(await screen.findByRole('checkbox', { name: /mode/ }));
    await userEvent.click(await screen.findByRole('radio', { name: 'fast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    await waitFor(() => {
      expect(createPreset).toHaveBeenCalled();
    });
    const body = createPreset.mock.lastCall?.[0];
    expect(body?.fixed_kwargs).toEqual(expect.objectContaining({ mode: 'fast' }));
  });

  it('blocks submit when a checked bake field has no value (subset validation)', async () => {
    const createPreset = vi.fn(() => Promise.resolve(presetRecord()));
    renderWithProviders(
      <ComposeAgentDialog agents={[agentWithKnob()]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    await fillNameAndDescription('bounded_agent');
    await pickBaseAgent();
    await userEvent.click(await screen.findByRole('checkbox', { name: /count/ }));
    // Leave the required subset field empty → the subset validation blocks submit.
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    expect(await screen.findByText(/is required/)).toBeInTheDocument();
    expect(createPreset).not.toHaveBeenCalled();
  });

  // An agent that ADVERTISES a `response_format` field on its ToolInput — the one
  // structured-output authoring surface for agents.
  const responseFormatAgent = () =>
    authorableAgent({
      input_schema: {
        type: 'object',
        properties: {
          user_message: { type: 'string', default: '' },
          response_format: { type: 'object', default: null },
        },
      },
    });

  it('routes response_format to the SchemaEditor for an advertiser, absent for a non-advertiser', async () => {
    const { unmount } = renderWithProviders(
      <ComposeAgentDialog agents={[responseFormatAgent()]} onClose={vi.fn()} />,
      composeClient(),
    );
    await pickBaseAgent();
    expect(await screen.findByLabelText('Response format JSON')).toBeInTheDocument();
    unmount();

    // The default authorable agent declares no response_format → no editor.
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient(),
    );
    await pickBaseAgent();
    expect(await screen.findByText('System prompt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Response format JSON')).toBeNull();
  });

  it('clears the response_format editor when the base agent is switched (no stale schema)', async () => {
    const otherAdvertiser = authorableAgent({
      name: 'other_agent',
      tool_name: 'other_agent',
      input_schema: {
        type: 'object',
        properties: { response_format: { type: 'object', default: null } },
      },
    });
    renderWithProviders(
      <ComposeAgentDialog agents={[responseFormatAgent(), otherAdvertiser]} onClose={vi.fn()} />,
      composeClient(),
    );

    await pickBaseAgent();
    const editor = await screen.findByLabelText('Response format JSON');
    fireEvent.change(editor, { target: { value: '{"type":"object","title":"A"}' } });
    expect(editor).toHaveValue('{"type":"object","title":"A"}');

    // Switch to the other advertiser: the editor must remount EMPTY, never showing the
    // previous agent's schema (which would submit as un-baked — display ≠ value).
    await userEvent.click(screen.getByRole('combobox', { name: 'Base agent' }));
    await userEvent.click(await screen.findByRole('option', { name: /other_agent/ }));
    expect(await screen.findByLabelText('Response format JSON')).toHaveValue('');
  });

  it('bakes an authored response_format schema into fixed_kwargs (round-trip)', async () => {
    const createPreset = vi.fn((_body: CreatePresetBody) => Promise.resolve(presetRecord()));
    renderWithProviders(
      <ComposeAgentDialog agents={[responseFormatAgent()]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    await fillNameAndDescription('structured_bot');
    await pickBaseAgent();
    const schema = { type: 'object', title: 'Report', properties: {} };
    fireEvent.change(await screen.findByLabelText('Response format JSON'), {
      target: { value: JSON.stringify(schema) },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    await waitFor(() => {
      expect(createPreset).toHaveBeenCalled();
    });
    expect(createPreset.mock.lastCall?.[0]?.fixed_kwargs).toEqual(
      expect.objectContaining({ response_format: schema }),
    );
  });

  it('blocks submit when the response_format is missing its required title', async () => {
    const createPreset = vi.fn(() => Promise.resolve(presetRecord()));
    renderWithProviders(
      <ComposeAgentDialog agents={[responseFormatAgent()]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    await fillNameAndDescription('structured_bot');
    await pickBaseAgent();
    // A schema with no top-level title fails the requireTitle lint (loud + inline).
    fireEvent.change(await screen.findByLabelText('Response format JSON'), {
      target: { value: '{"type":"object","properties":{}}' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/title/i);

    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));
    expect(createPreset).not.toHaveBeenCalled();
  });

  it('invalidates the shared tools list on success (so the new preset-tool appears)', async () => {
    // A composed agent binds a live preset-tool; the tools master list must refetch.
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const createPreset = vi.fn(() => Promise.resolve(presetRecord()));
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({ createPreset }),
    );

    await fillNameAndDescription('assistant');
    await pickBaseAgent();
    await userEvent.click(screen.getByRole('button', { name: 'Compose agent' }));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: toolsListKey });
    });
    invalidateSpy.mockRestore();
  });

  it.each([
    [
      'listTools',
      { listTools: () => Promise.reject(new Error('tools down')) },
      'tools down',
      'Add a tool',
    ],
    [
      'listPresets',
      { listPresets: () => Promise.reject(new Error('presets down')) },
      'presets down',
      'Preset to expand',
    ],
  ])(
    'replaces the picker with a loud error and blocks submit when the %s read fails',
    async (_label, override, message, pickerName) => {
      // "the deployment has nothing to choose" and "the read failed" must never be
      // the same screen: an enabled EMPTY picker composes an agent with no tools.
      const createPreset = vi.fn(() => Promise.resolve(presetRecord()));
      renderWithProviders(
        <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
        composeClient({ ...override, createPreset }),
      );

      await userEvent.type(screen.getByLabelText('Name'), 'assistant');
      await pickBaseAgent();

      const alerts = await screen.findAllByRole('alert');
      expect(alerts.map((node) => node.textContent).join('\n')).toContain(message);
      // The empty picker is GONE, not merely empty.
      expect(screen.queryByRole('combobox', { name: pickerName })).not.toBeInTheDocument();

      const submit = screen.getByRole('button', { name: 'Compose agent' });
      expect(submit).toBeDisabled();
      const form = submit.closest('form');
      if (form === null) throw new Error('expected the submit button to be inside a form');
      fireEvent.submit(form);
      expect(createPreset).not.toHaveBeenCalled();
    },
  );

  it('states a failed TAG read without walling the tool picker or the submit', async () => {
    // Tags only group the picker's options, so their failure degrades the control
    // rather than emptying it — but it is stated, never silently ungrouped.
    renderWithProviders(
      <ComposeAgentDialog agents={[authorableAgent()]} onClose={vi.fn()} />,
      composeClient({ listToolTags: () => Promise.reject(new Error('tags down')) }),
    );

    await userEvent.type(screen.getByLabelText('Name'), 'assistant');
    await pickBaseAgent();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((node) => node.textContent).join('\n')).toContain('tags down');
    expect(await screen.findByRole('combobox', { name: 'Add a tool' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Compose agent' })).toBeEnabled();

    // EVERY tag-grouped picking surface states it, not just the first one: a Field
    // that hands its picker the (empty) tag map without stating the failure drops
    // silently to flat mode, which reads as "this deployment has no tags".
    for (const groupName of ['Tools', 'Sub-agents']) {
      const group = screen.getByRole('group', { name: groupName });
      expect(within(group).getByRole('alert')).toHaveTextContent('tags down');
    }
  });
});

describe('authored-agents list', () => {
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

    const row = await screen.findByTestId('authored-agent-row');
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    expect(row).toHaveAttribute('data-agent', 'assistant');
    // Versioning/rollback/delete live on the presets page; Manage links out there
    // with the preset search param (never duplicating those controls here).
    const manage = within(row).getByRole('link', { name: /Manage authored agent assistant/ });
    expect(manage).toHaveAttribute('href', '/presets?preset=assistant');
  });

  it('opens Manage (its canonical destination) when the row body is clicked', async () => {
    const { navigate } = renderWithProviders(<AgentsPage />, authoredClient());

    const row = await screen.findByTestId('authored-agent-row');
    // The description cell is plain, non-interactive text — a body click, which
    // opens the row's one canonical destination (Manage → the presets page).
    await userEvent.click(within(row).getByText('An assistant agent'));
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'assistant' });
  });

  it('leaves Run to run and Manage to manage — the row yields to both, no double-nav', async () => {
    const { navigate } = renderWithProviders(<AgentsPage />, authoredClient());

    const row = await screen.findByTestId('authored-agent-row');
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
    // presets read. That read only enriches registered agents into authored rows, so the
    // section degrades to its own empty state rather than walling this reachable surface —
    // the authorable content (driven by the load-bearing specRunnable read) still renders.
    renderWithProviders(
      <AgentsPage />,
      authoredClient({ listPresets: () => Promise.reject(new ApiError('forbidden', 403)) }),
    );

    expect(await screen.findByText('No authored agents yet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Authored agents' })).toBeInTheDocument();
    // No ErrorState walls the section, and the authorable-agent gate never trips.
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
      // must SAY so — silently rendering "No authored agents yet" tells the operator the
      // deployment has no authored agents when the read simply never landed.
      renderWithProviders(
        <AgentsPage />,
        authoredClient({ listPresets: () => Promise.reject(rejection) }),
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(rejection.message);
      // The list itself is NOT walled — the agents read succeeded, so it still renders.
      expect(screen.getByRole('heading', { name: 'Authored agents' })).toBeInTheDocument();
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

    const row = await screen.findByTestId('authored-agent-row');
    expect(row).toHaveAttribute('data-agent', 'assistant');
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
    // The authored agent is visible (its preset reads), but the dynamic authored-run POST
    // is not method-expressible in the projection, so the run degrades to read-only.
    renderWithProviders(<AgentsPage />, authoredClient({ streamAuthoredAgentRun, getPreset }), {
      projection: scopedProjection({ routes: [{ path: '/api/agents', methods: ['GET'] }] }),
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Run authored agent assistant' }),
    );
    expect(await screen.findByTestId('run-read-only-note')).toBeInTheDocument();
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
            // lives on the presets page, never in the authored-agents list.
            presetRecord({ name: 'plain_preset', base_tool: 'echo' }),
          ]),
      }),
    );

    const rows = await screen.findAllByTestId('authored-agent-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-agent', 'assistant');
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

    const row = await screen.findByTestId('authored-agent-row');
    // Rendered as TEXT (React escapes it), never a live <script> sink.
    expect(row).toHaveTextContent(evil);
    expect(row.querySelector('script')).toBeNull();
  });
});
