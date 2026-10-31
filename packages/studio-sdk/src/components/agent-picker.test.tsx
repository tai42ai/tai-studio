/** `AgentPicker` over a stub agent list read: each read state and its own copy. */
import type { AgentListing } from '@tai42/api-client';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentPicker } from './agent-picker';
import {
  forbiddenRead,
  pendingRead,
  renderWithNavigation,
  type StubQuery,
  stubQuery,
} from './named-list-test-utils';

const REQUIRED = 'An agent is required.';

function listing(names: readonly string[]): AgentListing {
  return {
    items: names.map((name) => ({
      name,
      description: '',
      tool_name: `run_${name}`,
      input_schema: {},
      spec_runnable: false,
    })),
    total: names.length,
  };
}

function renderPicker(query: StubQuery<AgentListing>, value = '', error?: string) {
  const onValueChange = vi.fn();
  renderWithNavigation(
    <AgentPicker query={query} value={value} onValueChange={onValueChange} error={error} />,
  );
  return { onValueChange };
}

describe('AgentPicker', () => {
  it('pending: a disabled select reading "Loading agents…"', () => {
    renderPicker(stubQuery(pendingRead));
    const combobox = screen.getByRole('combobox', { name: 'Agent' });
    expect(combobox).toBeDisabled();
    expect(combobox).toHaveTextContent('Loading agents…');
  });

  it('error: the server message with Retry, the field error hidden', async () => {
    const query = stubQuery<AgentListing>({ isError: true, error: new Error('agents boom') });
    renderPicker(query, '', REQUIRED);
    expect(screen.getByRole('alert')).toHaveTextContent('agents boom');
    await userEvent.setup().click(screen.getByRole('button', { name: /Retry/ }));
    expect(query.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(REQUIRED)).toBeNull();
    expect(screen.getByRole('group', { name: 'Agent' })).toBeInTheDocument();
  });

  it('loaded: the names as options; picking one reports it', async () => {
    const { onValueChange } = renderPicker(
      stubQuery({ data: listing(['alpha', 'beta']), isSuccess: true }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Agent' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'alpha',
      'beta',
    ]);
    await user.click(screen.getByRole('option', { name: 'beta' }));
    expect(onValueChange).toHaveBeenCalledWith('beta');
  });

  it('loaded: the search box narrows the agents, ignoring case, and Enter picks', async () => {
    const { onValueChange } = renderPicker(
      stubQuery({ data: listing(['alpha', 'beta', 'alphabet']), isSuccess: true }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Agent' }));
    await user.type(screen.getByRole('combobox', { name: 'Search agents' }), 'BET');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'beta',
      'alphabet',
    ]);
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('beta');
  });

  it('empty: the note and the link to the Agents screen in place of the control', () => {
    renderPicker(stubQuery({ data: listing([]), isSuccess: true }), '', REQUIRED);
    expect(screen.getByRole('status')).toHaveTextContent(
      'No agents are registered on this deployment.',
    );
    expect(screen.getByRole('link', { name: 'Open the Agents screen' })).toHaveAttribute(
      'href',
      '/agents',
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  it('refused: a typed entry named by the field, described by the no-list note', () => {
    renderPicker(stubQuery(forbiddenRead));
    const input = screen.getByRole('textbox', { name: 'Agent' });
    expect(input).toHaveValue('');
    expect(input).toHaveAccessibleDescription(
      "This session cannot list agents, so type the agent's exact name. Saving checks that the agent is registered.",
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('refused: hands the typed name, trimmed, to onValueChange on blur', async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderPicker(stubQuery(forbiddenRead));
    await user.type(screen.getByRole('textbox', { name: 'Agent' }), '  typed_agent ');
    expect(onValueChange).not.toHaveBeenCalled();
    await user.tab();
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('typed_agent');
  });

  it('refused with a stored value: the typed entry holds it, unflagged', () => {
    renderPicker(stubQuery(forbiddenRead), 'alpha', REQUIRED);
    expect(screen.getByRole('textbox', { name: 'Agent' })).toHaveValue('alpha');
    expect(screen.queryByText(/not registered|not installed/)).toBeNull();
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();
  });

  it('unlisted: the stored value flagged "not registered", described by the warning line', () => {
    renderPicker(stubQuery({ data: listing(['alpha']), isSuccess: true }), 'ghost');
    const combobox = screen.getByRole('combobox', { name: 'Agent' });
    expect(combobox).toHaveTextContent('ghost (not registered)');
    const line = screen.getByText(/ghost is not registered\. Pick another, or saving is refused\./);
    expect(line).toHaveTextContent(
      'not registered ghost is not registered. Pick another, or saving is refused.',
    );
    expect(combobox.getAttribute('aria-describedby')?.split(' ')).toContain(line.id);
  });

  it('a stored value is not flagged while the list is pending', () => {
    renderPicker(stubQuery(pendingRead), 'ghost');
    expect(screen.queryByText(/not registered/)).toBeNull();
  });

  it('an empty list with an unlisted stored value: the flagged sole option and the empty line', async () => {
    renderPicker(stubQuery({ data: listing([]), isSuccess: true }), 'ghost');
    expect(screen.getByRole('status')).toHaveTextContent(
      'No agents are registered on this deployment.',
    );
    const combobox = screen.getByRole('combobox', { name: 'Agent' });
    await userEvent.setup().click(combobox);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'ghost (not registered)',
    ]);
  });
});
