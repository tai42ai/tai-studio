import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Button } from './primitives';
import { Dialog } from './dialog';

describe('Dialog', () => {
  it('opens from its trigger and exposes an accessible modal labelled by its title', async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        title="Confirm delete"
        description="This cannot be undone"
        trigger={<Button>Open</Button>}
      >
        <p>body</p>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName('Confirm delete');
    expect(screen.getByText('This cannot be undone')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="Confirm delete" description="This cannot be undone" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
