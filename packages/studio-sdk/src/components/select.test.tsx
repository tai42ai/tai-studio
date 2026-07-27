import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select, type SelectProps } from './select';

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
    render(<Select groups={[{ label: 'Group A', options: OPTIONS }]} aria-label="Number" />);

    await user.click(screen.getByRole('combobox', { name: 'Number' }));
    expect(await screen.findByText('Group A')).toHaveClass('tai-select-group-label', 'tai-label');
  });

  it('raises rather than discarding one of the two lists it was handed', () => {
    // The parameter type admits `options` or `groups`, never both, so only
    // untyped JavaScript reaches this. Rendering the groups and dropping every
    // flat option — or the reverse — loses a whole list without a word.
    const both = {
      options: OPTIONS,
      groups: [{ label: 'Group A', options: OPTIONS }],
    } as unknown as SelectProps;
    expect(() => render(<Select {...both} />)).toThrow(/exactly one of `options` or `groups`/);

    const neither = {} as unknown as SelectProps;
    expect(() => render(<Select {...neither} />)).toThrow(/exactly one of `options` or `groups`/);
  });

  it('marks the chosen option, so the moving highlight is not the only cue', async () => {
    const user = userEvent.setup();
    render(<Select options={OPTIONS} defaultValue="2" aria-label="Number" />);

    await user.click(screen.getByRole('combobox', { name: 'Number' }));

    const chosen = await screen.findByRole('option', { name: 'Two' });
    const other = screen.getByRole('option', { name: 'One' });
    // Radix renders the indicator for the selected option ONLY, so the mark is
    // what says "this is the value" once the highlight has moved elsewhere.
    expect(chosen.querySelector('.tai-select-item-indicator svg')).not.toBeNull();
    expect(other.querySelector('.tai-select-item-indicator')).toBeNull();
    // The mark is decorative: `aria-selected` is what carries the state.
    expect(chosen).toHaveAttribute('aria-selected', 'true');
    expect(chosen).toHaveTextContent('Two');
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

it('renders the trigger and its popup and keeps the accessible name', async () => {
  const user = userEvent.setup();
  render(<Select options={OPTIONS} aria-label="Number" placeholder="Pick one" />);

  const trigger = screen.getByRole('combobox', { name: 'Number' });
  expect(trigger).toHaveClass('tai-select-trigger');
  expect(trigger).toHaveTextContent('Pick one');

  await user.click(trigger);
  expect(await screen.findByRole('option', { name: 'One' })).toHaveClass('tai-select-item');
});
