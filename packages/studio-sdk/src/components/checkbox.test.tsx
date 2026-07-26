import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Checkbox } from './checkbox';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

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

  it('is a tai-checkbox whose data-state tracks the box, controlled or not', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Accept terms" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Accept terms' });
    expect(checkbox).toHaveClass('tai-checkbox');
    expect(checkbox).toHaveAttribute('data-state', 'unchecked');

    await user.click(checkbox);
    expect(checkbox).toHaveAttribute('data-state', 'checked');
  });

  it('reflects a controlled indeterminate box through data-state', () => {
    // Radix drives `data-state` off the checked value it is given; the
    // stylesheet paints the indeterminate ground from that same hook.
    render(<Checkbox aria-label="Select all" checked={undefined} defaultChecked />);
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toHaveAttribute(
      'data-state',
      'checked',
    );
  });

  it('draws the tick as an icon, never a Unicode glyph, and keeps the name', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Accept terms" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Accept terms' });
    expect(checkbox.querySelector('svg')).toBeNull();

    await user.click(checkbox);
    expect(checkbox.querySelector('svg')).not.toBeNull();
    // The mark is artwork only: it contributes no text, so the name is unchanged.
    expect(checkbox.textContent).toBe('');
    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toBeInTheDocument();
  });

  it('puts the label row on the shared choice class', () => {
    render(<Checkbox label="Accept terms" />);
    expect(screen.getByText('Accept terms').closest('label')).toHaveClass('tai-choice');
  });
});

describe.each(['light', 'dark'] as const)('Checkbox under the %s theme', (theme) => {
  it('renders its content and keeps its accessible name', () => {
    document.documentElement.setAttribute('data-theme', theme);
    render(<Checkbox label="Accept terms" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Accept terms' });
    expect(checkbox).toHaveClass('tai-checkbox');
    expect(screen.getByText('Accept terms')).toBeInTheDocument();
  });
});
