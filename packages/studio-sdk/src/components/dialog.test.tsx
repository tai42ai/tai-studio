import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './primitives';
import { Dialog } from './dialog';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

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

  it('dresses the panel and the title in the design-system surface classes', () => {
    render(
      <Dialog title="Confirm delete" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('tai-dialog');
    expect(screen.getByText('Confirm delete')).toHaveClass('tai-dialog-title');
  });

  it('paints the scrim from the overlay class, never an inline color', () => {
    render(
      <Dialog title="Confirm delete" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const overlay = document.querySelector<HTMLElement>('.tai-overlay');
    expect(overlay).not.toBeNull();
    // The scrim resolves from --tai-color-scrim inside the class, never inline.
    expect(overlay?.style.background).toBe('');
    expect(overlay?.style.backgroundColor).toBe('');
  });

  describe.each(['light', 'dark'] as const)('under the %s theme', (theme) => {
    it('renders its content and keeps its accessible name', () => {
      document.documentElement.setAttribute('data-theme', theme);
      render(
        <Dialog title="Confirm delete" description="This cannot be undone" defaultOpen>
          <p>body</p>
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAccessibleName('Confirm delete');
      expect(dialog).toHaveClass('tai-dialog');
      expect(screen.getByText('body')).toBeInTheDocument();
      expect(document.querySelector('.tai-overlay')).not.toBeNull();
    });
  });
});
