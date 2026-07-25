import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from './select';

const OPTIONS = [
  { value: '1', label: 'One' },
  { value: '2', label: 'Two' },
];

describe('Select', () => {
  it('renders a combobox showing the placeholder', () => {
    render(<Select options={OPTIONS} placeholder="Pick one" />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Pick one');
  });

  it('opens and selecting an option fires onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select options={OPTIONS} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('combobox'));
    const option = await screen.findByRole('option', { name: 'Two' });
    await user.click(option);

    expect(onValueChange).toHaveBeenCalledWith('2');
  });

  it('marks each option so the keyboard-highlight style can target it', async () => {
    const user = userEvent.setup();
    render(<Select options={OPTIONS} />);

    await user.click(screen.getByRole('combobox'));
    const option = await screen.findByRole('option', { name: 'One' });
    expect(option).toHaveClass('tai-select-item');
  });

  it('renders labelled groups when `groups` is provided', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        options={[]}
        groups={[
          { label: 'Group A', options: [{ value: 'a1', label: 'Alpha One' }] },
          { label: 'Group B', options: [{ value: 'b1', label: 'Bravo One' }] },
        ]}
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByText('Group A')).toBeInTheDocument();
    expect(screen.getByText('Group B')).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Bravo One' }));
    expect(onValueChange).toHaveBeenCalledWith('b1');
  });
});
