import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ActionMenu } from './action-menu';

function setup() {
  const onRemove = vi.fn();
  const onEdit = vi.fn();
  render(
    <ActionMenu
      label="Actions for Acme"
      items={[
        { id: 'edit', label: 'Edit', onSelect: onEdit },
        { id: 'remove', label: 'Remove', onSelect: onRemove, danger: true },
      ]}
    />,
  );
  return { onRemove, onEdit };
}

describe('ActionMenu', () => {
  it('is a collapsed menu button named by its label', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Actions for Acme' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click with focus on the first item, and runs an item', async () => {
    const user = userEvent.setup();
    const { onRemove } = setup();
    const trigger = screen.getByRole('button', { name: 'Actions for Acme' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('moves with the arrow keys, wraps, and closes on Escape back to the trigger', async () => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole('button', { name: 'Actions for Acme' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on a press outside', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('draws nothing with no items', () => {
    const { container } = render(<ActionMenu label="Actions for Acme" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
