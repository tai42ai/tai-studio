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

  it('refused: the no-grant note, no Retry and no ErrorState', () => {
    renderPicker(stubQuery(forbiddenRead), '', REQUIRED);
    expect(screen.getByRole('status')).toHaveTextContent(
      'This session cannot list agents. Picking one needs read access to GET /api/agents; ask an administrator to grant it.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  it('refused with a stored value: the value as the sole unflagged option, the note below, the error shown', async () => {
    renderPicker(stubQuery(forbiddenRead), 'alpha', REQUIRED);
    const combobox = screen.getByRole('combobox', { name: 'Agent' });
    expect(combobox).toHaveTextContent('alpha');
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();
    expect(screen.queryByText(/not registered/)).toBeNull();
    await userEvent.setup().click(combobox);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['alpha']);
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
