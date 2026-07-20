import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('renders an accessible checkbox with its label as the name', () => {
    render(<Checkbox label="Accept terms" />);
    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toBeInTheDocument();
  });

  it('checking updates state and fires onCheckedChange(true)', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Accept terms" onCheckedChange={onCheckedChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Accept terms' });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(checkbox).toBeChecked();
  });

  it('toggles when the associated label text is clicked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Accept terms" onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByText('Accept terms'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('takes its accessible name from aria-label when it has no visible label', () => {
    render(<Checkbox aria-label="Select worker-1" />);
    expect(screen.getByRole('checkbox', { name: 'Select worker-1' })).toBeInTheDocument();
  });
});
