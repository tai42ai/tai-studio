/**
 * The sub-agent composer renders one editor card per inline sub-agent. Each card's
 * per-item Remove is a routine list-item control in a repeated editor, so it wears
 * the low-emphasis (ghost) style rather than filled danger.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

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
