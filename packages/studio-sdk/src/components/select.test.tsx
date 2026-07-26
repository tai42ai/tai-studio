import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Select } from './select';

const OPTIONS = [
  { value: '1', label: 'One' },
  { value: '2', label: 'Two' },
];

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

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

  it('puts the trigger and the popup on the design-system classes', async () => {
    const user = userEvent.setup();
    render(<Select options={OPTIONS} placeholder="Pick one" />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('tai-select-trigger');

    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'One' });
    expect(option.closest('.tai-select-content')).not.toBeNull();
  });

  it('gives a group label the shared uppercase label style', async () => {
    const user = userEvent.setup();
    render(
      <Select options={[]} groups={[{ label: 'Group A', options: OPTIONS }]} aria-label="Number" />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Number' }));
    expect(await screen.findByText('Group A')).toHaveClass('tai-select-group-label', 'tai-label');
  });

  it('draws the disclosure mark as an icon, never a Unicode glyph', () => {
    render(<Select options={OPTIONS} placeholder="Pick one" />);

    const trigger = screen.getByRole('combobox');
    expect(trigger.querySelector('svg')).not.toBeNull();
    // The mark contributes no text, so the trigger still reads as its value.
    expect(trigger).toHaveTextContent('Pick one');
    expect(trigger.textContent).not.toContain('▾');
  });
});

describe.each(['light', 'dark'] as const)('Select under the %s theme', (theme) => {
  it('renders the trigger and its popup and keeps the accessible name', async () => {
    document.documentElement.setAttribute('data-theme', theme);
    const user = userEvent.setup();
    render(<Select options={OPTIONS} aria-label="Number" placeholder="Pick one" />);

    const trigger = screen.getByRole('combobox', { name: 'Number' });
    expect(trigger).toHaveClass('tai-select-trigger');
    expect(trigger).toHaveTextContent('Pick one');

    await user.click(trigger);
    expect(await screen.findByRole('option', { name: 'One' })).toHaveClass('tai-select-item');
  });
});
