/**
 * The compose dialog — building a valid create body from the pickers: identity,
 * base agent, tools/preset pickers, overlay tags (written after create), the
 * conflicted/hidden exclusions, and the server-error surfacing.
 */
import { ApiError, type CreatePresetBody } from '@tai42/api-client';
import { StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ComposeAgentDialog } from './authoring';
import {
  authorableAgent,
  composeClient,
  fillNameAndDescription,
  pickBaseAgent,
  presetDetail,
  presetRecord,
  renderWithProviders,
} from './test-utils';

describe('ComposeAgentDialog', () => {
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

    await userEvent.click(await screen.findByRole('combobox', { name: 'Preset to expand' }));
    await userEvent.click(await screen.findByRole('option', { name: 'echo_pinned' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add preset' }));

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
    await userEvent.click(await screen.findByRole('combobox', { name: 'Preset to expand' }));

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
});
