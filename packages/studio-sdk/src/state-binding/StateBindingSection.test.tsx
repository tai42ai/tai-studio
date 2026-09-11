import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StateBindingSection } from './StateBindingSection';

describe('StateBindingSection', () => {
  it('is collapsed by default and expands on the toggle', async () => {
    const user = userEvent.setup();
    render(
      <StateBindingSection
        value={null}
        onChange={vi.fn()}
        statesCatalog={[]}
        templatesCatalog={[]}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Bind state (optional)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('No state bound')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('No state bound')).toBeInTheDocument();
  });

  it('opens expanded when a binding already exists', () => {
    render(
      <StateBindingSection
        value={{
          states: [
            {
              state: 'counters',
              templates: [],
              subject_expr: { content: '.id' },
              scope_expr: null,
              input_injections: [],
              updates: [],
            },
          ],
        }}
        onChange={vi.fn()}
        statesCatalog={[{ name: 'counters' }]}
        templatesCatalog={[]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Bind state (optional)' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
