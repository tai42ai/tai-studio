/**
 * The compose dialog — the opt-in bake checklist for non-spec fields, the
 * response_format editor, the shared-tools-list invalidation, and the picker-read
 * failure resilience (a failed load walls the picker and blocks submit; a tags
 * failure is stated but degrades gracefully).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

import { type CreatePresetBody } from '@tai42/api-client';
import { toolsListKey } from '@tai42/studio-sdk';

import { ComposeAgentDialog } from './authoring';
import {
  authorableAgent,
  composeClient,
  fillNameAndDescription,
  pickBaseAgent,
  presetRecord,
  renderWithProviders,
} from './test-utils';

describe('ComposeAgentDialog', () => {
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
