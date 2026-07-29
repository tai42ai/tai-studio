import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Tabs } from './tabs';

const ITEMS = [
  { value: 'one', label: 'One', content: <p>first panel</p> },
  { value: 'two', label: 'Two', content: <p>second panel</p> },
];

describe('Tabs', () => {
  it('renders a tablist and shows the first panel by default', () => {
    render(<Tabs items={ITEMS} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('first panel')).toBeInTheDocument();
    expect(screen.queryByText('second panel')).not.toBeInTheDocument();
  });

  it('clicking a tab switches the visible panel', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);
    await user.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('second panel')).toBeInTheDocument();
  });

  it('carries the design-system classes and marks the active tab with data-state', async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    expect(screen.getByRole('tablist')).toHaveClass('tai-tablist');
    const first = screen.getByRole('tab', { name: 'One' });
    const second = screen.getByRole('tab', { name: 'Two' });
    expect(first).toHaveClass('tai-tab');
    expect(second).toHaveClass('tai-tab');

    // The active-tab styling is keyed off data-state, not off an inline style.
    expect(first).toHaveAttribute('data-state', 'active');
    expect(second).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByRole('tabpanel')).toHaveClass('tai-tabpanel');

    await user.click(second);
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('data-state', 'inactive');
  });

  it('disables a tab that declares it', () => {
    render(
      <Tabs
        items={[...ITEMS, { value: 'three', label: 'Three', content: null, disabled: true }]}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Three' })).toBeDisabled();
  });

  it('renders its tabs on the tab class with the first panel showing', () => {
    render(<Tabs items={ITEMS} />);
    const tab = screen.getByRole('tab', { name: 'One' });
    expect(tab).toHaveAccessibleName('One');
    expect(tab).toHaveClass('tai-tab');
    expect(screen.getByText('first panel')).toBeInTheDocument();
  });
});
