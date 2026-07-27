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
    const button = screen.getByRole('button', { name: 'Run' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to the secondary variant and maps each variant to its class', () => {
    const { unmount } = render(<Button>Run</Button>);
    expect(screen.getByRole('button', { name: 'Run' })).toHaveClass('tai-btn', 'tai-btn-secondary');
    unmount();

    const variants = [
      ['primary', 'tai-btn-primary'],
      ['secondary', 'tai-btn-secondary'],
      ['ghost', 'tai-btn-ghost'],
      ['danger', 'tai-btn-danger'],
    ] as const;
    for (const [variant, expected] of variants) {
      const view = render(<Button variant={variant}>Run</Button>);
      expect(screen.getByRole('button', { name: 'Run' })).toHaveClass('tai-btn', expected);
      view.unmount();
    }
  });

  it("appends the caller's className after the variant class", () => {
    render(<Button className="tai-mono">Run</Button>);
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute(
      'class',
      'tai-btn tai-btn-secondary tai-mono',
    );
  });

  it('keeps its accessible name and wears the primary variant class', () => {
    render(<Button variant="primary">Run</Button>);
    const button = screen.getByRole('button', { name: 'Run' });
    expect(button).toHaveAccessibleName('Run');
    expect(button).toHaveClass('tai-btn-primary');
  });
});

describe('Button link variant', () => {
  it('renders a relative href as a plain in-app anchor', () => {
    render(<Button href="/tools">Tools</Button>);
    const link = screen.getByRole('link', { name: 'Tools' });
    expect(link).toHaveAttribute('href', '/tools');
    expect(link).not.toHaveAttribute('target');
    expect(link).not.toHaveAttribute('rel');
    expect(link).toHaveClass('tai-btn', 'tai-btn-secondary');
  });

  it('renders an absolute http(s) href as a new-tab anchor', () => {
    render(
      <Button href="https://example.com" variant="primary">
        Docs
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer external');
    expect(link).toHaveClass('tai-btn-primary');
  });

  it('NEUTRALIZES a non-http(s) scheme — no anchor, no href', () => {
    render(<Button href="javascript:alert(1)">Click me</Button>);
    expect(screen.queryByRole('link')).toBeNull();
    const blocked = screen.getByText('Click me');
    expect(blocked.tagName).not.toBe('A');
    expect(blocked).not.toHaveAttribute('href');
    expect(blocked).toHaveAttribute('data-neutralized', 'true');
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
  });

  it('NEUTRALIZES a protocol-relative href, which is cross-origin, not in-app', () => {
    render(<Button href="//evil.example">Go</Button>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Go')).toHaveAttribute('data-neutralized', 'true');
  });
});

describe('ErrorState', () => {
  it('has role=alert and calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="it broke" onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('it broke');
    expect(alert).toHaveClass('tai-error-state');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('pairs its title with an icon so the state is never color alone', () => {
    const { container } = render(<ErrorState message="it broke" />);
    const title = container.querySelector('.tai-error-state-title');
    expect(title).not.toBeNull();
    expect(title?.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('status/loading primitives', () => {
  it('EmptyState renders its title with role=status', () => {
    render(<EmptyState title="Nothing here" description="Add one" />);
    const status = screen.getByRole('status');
    expect(status).toHaveClass('tai-empty-state');
    expect(status).toHaveTextContent('Nothing here');
    expect(status).toHaveTextContent('Add one');
    expect(screen.getByText('Nothing here')).toHaveClass('tai-empty-state-title');
  });

  it('EmptyState renders the action slot after the description', () => {
    render(
      <EmptyState
        title="No tools"
        description="Add one to get started."
        action={<Button variant="primary">Add tool</Button>}
      />,
    );
    const status = screen.getByRole('status');
    const action = screen.getByRole('button', { name: 'Add tool' });
    expect(status).toContainElement(action);
    const description = screen.getByText('Add one to get started.');
    expect(
      description.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('Spinner exposes an accessible label', () => {
    render(<Spinner label="Loading tools" />);
    const spinner = screen.getByRole('status', { name: 'Loading tools' });
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('tai-spinner');
  });

  it('Card renders its children and Skeleton is decorative (aria-hidden)', () => {
    render(
      <Card>
        <span>card body</span>
      </Card>,
    );
    expect(screen.getByText('card body')).toBeInTheDocument();

    const { container } = render(<Skeleton />);
    const skeleton = container.querySelector('[aria-hidden="true"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton).toHaveClass('tai-skeleton');
  });

  it('Card lifts only when it opts in', () => {
    const flat = render(<Card>flat</Card>);
    const staticCard = flat.container.querySelector('.tai-card');
    expect(staticCard).not.toBeNull();
    expect(staticCard).not.toHaveClass('tai-card-interactive');
    flat.unmount();

    const lifted = render(
      <Card interactive className="tai-stack">
        lifts
      </Card>,
    );
    expect(lifted.container.querySelector('.tai-card')).toHaveClass(
      'tai-card-interactive',
      'tai-stack',
    );
  });

  it('Card renders its children inside the card class', () => {
    const { container } = render(
      <Card>
        <span>card body</span>
      </Card>,
    );
    expect(screen.getByText('card body')).toBeInTheDocument();
    expect(container.querySelector('.tai-card')).not.toBeNull();
  });
});

describe('Button link normalization', () => {
  // The URL parser deletes ASCII tab/LF/CR before parsing, and for a scheme that
  // matches the document's, the authority-less spelling is a PATH. Both make the
  // raw string a different URL from the one the browser resolves, which is why
  // the check and the anchor must both read the normalized form.
  it.each([
    ['/\t/evil.com'],
    ['/\n/evil.com'],
    ['/\r/evil.com'],
    ['//evil.com'],
    ['/\\evil.com'],
    ['https:/evil.com'],
    ['https:evil.com'],
    ['javascript:alert(1)'],
    ['JAVASCRIPT:alert(1)'],
    ['java\tscript:alert(1)'],
    ['vbscript:x'],
    ['blob:https://a/b'],
    ['page.html'],
  ])('neutralizes %j instead of rendering a live anchor', (href) => {
    const { container } = render(<Button href={href}>go</Button>);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-neutralized="true"]')).not.toBeNull();
  });

  it('keeps a neutralized icon-only link nameable', () => {
    render(
      <Button href="javascript:alert(1)" aria-label="Open docs" id="docs-link">
        <svg />
      </Button>,
    );
    const blocked = screen.getByLabelText('Open docs');
    expect(blocked).toHaveAttribute('id', 'docs-link');
    expect(blocked).toHaveAttribute('data-neutralized', 'true');
  });

  it('renders the normalized absolute URL it validated', () => {
    render(<Button href={'  https://example.com/a\tb  '}>go</Button>);
    const anchor = screen.getByRole('link', { name: 'go' });
    expect(anchor).toHaveAttribute('href', 'https://example.com/ab');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer external');
  });

  it('pins rel on an internal link a caller opens in a new tab', () => {
    render(
      <Button href="/tools" target="_blank">
        go
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'go' })).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
