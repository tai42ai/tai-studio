/**
 * The sub-agent composer renders one editor card per inline sub-agent. Each card's
 * per-item Remove is a routine list-item control in a repeated editor, so it wears
 * the low-emphasis (ghost) style rather than filled danger.
 */
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PresetDetail } from '@tai42/api-client';

import type { InlineSubAgentSpec } from './authoring-types';
import { SubAgentComposer } from './SubAgentComposer';
import { presetRecord, renderWithProviders, stubClient } from './test-utils';

function spec(overrides: Partial<InlineSubAgentSpec> = {}): InlineSubAgentSpec {
  return {
    name: 'researcher',
    system_prompt: '',
    tool_names: [],
    presets: [],
    subagents: [],
    ...overrides,
  };
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
  fixed_kwargs: { pinned: true },
  ...over,
});

/**
 * A stateful host that owns the composer's `value`, so a test drives the SAME
 * controlled edit/add/remove seam the compose dialog uses. `seen` captures the
 * latest emitted list so a test can assert the exact array the composer produced.
 */
function Harness({
  initial = [],
  toolNames = ['echo', 'ping'],
  presetRecords = [],
  seen,
}: {
  initial?: readonly InlineSubAgentSpec[];
  toolNames?: readonly string[];
  presetRecords?: ReturnType<typeof presetRecord>[];
  seen?: (next: InlineSubAgentSpec[]) => void;
}): ReactNode {
  const [value, setValue] = useState<readonly InlineSubAgentSpec[]>(initial);
  return (
    <SubAgentComposer
      toolNames={toolNames}
      presetRecords={presetRecords}
      value={value}
      onChange={(next) => {
        seen?.(next);
        setValue(next);
      }}
    />
  );
}

describe('SubAgentComposer — low-emphasis item control', () => {
  it('wears the ghost style on a sub-agent card Remove, not filled danger', () => {
    renderWithProviders(
      <SubAgentComposer
        toolNames={['echo']}
        presetRecords={[presetRecord()]}
        value={[spec()]}
        onChange={vi.fn()}
      />,
      stubClient(),
    );

    const remove = screen.getByRole('button', { name: 'Remove sub-agent 1' });
    expect(remove).toHaveClass('tai-btn-ghost');
    expect(remove).not.toHaveClass('tai-btn-danger');
  });
});

describe('SubAgentComposer — compose/edit/remove seam', () => {
  it('appends a fresh empty sub-agent card when Add sub-agent is clicked', async () => {
    const seen = vi.fn();
    renderWithProviders(<Harness seen={seen} />, stubClient());

    // Starts empty: no card, only the add control.
    expect(screen.queryByTestId('subagent-0')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Add sub-agent' }));

    // The composer emitted one appended, fully-defaulted inline spec…
    expect(seen).toHaveBeenLastCalledWith([
      { name: '', system_prompt: '', tool_names: [], presets: [], subagents: [] },
    ]);
    // …and re-rendered a card for it.
    expect(await screen.findByTestId('subagent-0')).toBeInTheDocument();
    expect(screen.getByText('Sub-agent 1')).toBeInTheDocument();
  });

  it('edits a card name and system prompt through its own fields', async () => {
    const seen = vi.fn();
    renderWithProviders(<Harness initial={[spec({ name: '' })]} seen={seen} />, stubClient());

    await userEvent.type(screen.getByLabelText('Name'), 'planner');
    await userEvent.type(screen.getByLabelText('System prompt'), 'Plan the work.');

    // The controlled inputs reflect the accumulated per-keystroke edits, proving
    // the card's field onChange threads back through the composer's per-item merge.
    expect(screen.getByLabelText('Name')).toHaveValue('planner');
    expect(screen.getByLabelText('System prompt')).toHaveValue('Plan the work.');
    const last = seen.mock.lastCall?.[0] as InlineSubAgentSpec[];
    expect(last[0]).toMatchObject({ name: 'planner', system_prompt: 'Plan the work.' });
  });

  it('adds then removes a tool on a sub-agent card', async () => {
    renderWithProviders(<Harness initial={[spec()]} toolNames={['echo', 'ping']} />, stubClient());

    await userEvent.click(await screen.findByRole('combobox', { name: 'Add a tool' }));
    await userEvent.click(await screen.findByRole('option', { name: 'echo' }));

    const removeTool = await screen.findByRole('button', { name: 'Remove tool echo' });
    expect(removeTool).toBeInTheDocument();

    await userEvent.click(removeTool);
    expect(screen.queryByRole('button', { name: 'Remove tool echo' })).toBeNull();
  });

  it('removes one sub-agent card and keeps the sibling intact', async () => {
    const seen = vi.fn();
    renderWithProviders(
      <Harness initial={[spec({ name: 'researcher' }), spec({ name: 'writer' })]} seen={seen} />,
      stubClient(),
    );

    // Two cards to start.
    expect(screen.getByTestId('subagent-0')).toBeInTheDocument();
    expect(screen.getByTestId('subagent-1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove sub-agent 1' }));

    // The composer dropped the first entry, leaving only the sibling.
    expect(seen).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'writer' })]);
    expect(screen.queryByTestId('subagent-1')).toBeNull();
    // The survivor is re-keyed to card 0 and still carries its own name.
    expect(within(screen.getByTestId('subagent-0')).getByLabelText('Name')).toHaveValue('writer');
  });

  it('expands a stored custom node into a chip, then removes it', async () => {
    const getPreset = vi.fn(() => Promise.resolve(presetDetail()));
    const seen = vi.fn();
    renderWithProviders(
      <Harness
        initial={[spec()]}
        presetRecords={[presetRecord({ name: 'echo_pinned', base_tool: 'echo' })]}
        seen={seen}
      />,
      stubClient({ getPreset }),
    );

    await userEvent.click(await screen.findByRole('combobox', { name: 'Custom node to expand' }));
    await userEvent.click(await screen.findByRole('option', { name: 'echo_pinned' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add custom node' }));

    // The picked stored preset was resolved (via getPreset) into an inline object
    // and threaded back onto the card's `presets`.
    await waitFor(() => {
      expect(getPreset).toHaveBeenCalledWith('echo_pinned');
    });
    const entry = await screen.findByTestId('subagent-0-presets-entry');
    expect(entry).toHaveTextContent('echo_pinned');
    const last = seen.mock.lastCall?.[0] as InlineSubAgentSpec[];
    expect(last[0]?.presets).toEqual([
      {
        name: 'echo_pinned',
        description: 'Pinned echo',
        base_tool: 'echo',
        fixed_kwargs: { pinned: true },
      },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove custom node echo_pinned' }));

    expect(screen.queryByTestId('subagent-0-presets-entry')).toBeNull();
    const afterRemove = seen.mock.lastCall?.[0] as InlineSubAgentSpec[];
    expect(afterRemove[0]?.presets).toEqual([]);
  });
});
