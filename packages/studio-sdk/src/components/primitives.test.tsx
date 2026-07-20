import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, Card, EmptyState, ErrorState, Skeleton, Spinner } from './primitives';

describe('Button', () => {
  it('renders an accessible button and fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);
    const button = screen.getByRole('button', { name: 'Run' });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Run
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ErrorState', () => {
  it('has role=alert and calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="it broke" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('it broke');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('status/loading primitives', () => {
  it('EmptyState renders its title with role=status', () => {
    render(<EmptyState title="Nothing here" description="Add one" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Nothing here');
    expect(status).toHaveTextContent('Add one');
  });

  it('Spinner exposes an accessible label', () => {
    render(<Spinner label="Loading tools" />);
    expect(screen.getByRole('status', { name: 'Loading tools' })).toBeInTheDocument();
  });

  it('Card renders its children and Skeleton is decorative (aria-hidden)', () => {
    render(
      <Card>
        <span>card body</span>
      </Card>,
    );
    expect(screen.getByText('card body')).toBeInTheDocument();

    const { container } = render(<Skeleton />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
