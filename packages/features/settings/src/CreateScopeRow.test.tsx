/**
 * The new-scope row: the server rules a scope name, so the row refuses only what it can
 * know locally — a blank name, the served public marker, a name already present — and
 * hands every other name (`*` included) to the caller; a server refusal shows on submit.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateScopeRow } from './CreateScopeRow';

function renderRow(existing: string[] = []) {
  const onCreate = vi.fn();
  render(<CreateScopeRow existingIds={new Set(existing)} publicId="public" onCreate={onCreate} />);
  return { onCreate, user: userEvent.setup() };
}

async function add(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  if (name !== '') await user.type(screen.getByLabelText('New scope name'), name);
  await user.click(screen.getByRole('button', { name: 'Add scope' }));
}

describe('CreateScopeRow', () => {
  it('accepts the wildcard scope name', async () => {
    const { onCreate, user } = renderRow();
    await add(user, '*');
    expect(onCreate).toHaveBeenCalledWith('*');
  });

  it('accepts any other name the server may rule on', async () => {
    const { onCreate, user } = renderRow();
    await add(user, 'team.alpha/edit');
    expect(onCreate).toHaveBeenCalledWith('team.alpha/edit');
  });

  it('refuses a blank name', async () => {
    const { onCreate, user } = renderRow();
    await add(user, '');
    expect(screen.getByText('Enter a scope name.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('refuses the served public marker', async () => {
    const { onCreate, user } = renderRow();
    await add(user, 'public');
    expect(
      screen.getByText('“public” is the reserved public marker, not a scope. Use the Public zone.'),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('refuses a name already present', async () => {
    const { onCreate, user } = renderRow(['ops']);
    await add(user, 'ops');
    expect(screen.getByText('A scope with that name already exists.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
