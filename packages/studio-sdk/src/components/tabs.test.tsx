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
});
