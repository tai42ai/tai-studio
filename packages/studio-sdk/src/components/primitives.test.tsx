import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AlertTriangleIcon, XCircleIcon } from './icons';
import { Button, Card, EmptyState, ErrorState, Skeleton, Spinner } from './primitives';
import * as barrel from '../index';

describe('the link-safety pair on the published surface', () => {
  it('publishes BOTH halves, so a caller never re-parses to get the URL', () => {
    // The barrel published only the boolean half, which forced every caller that
    // wanted the URL into `isSafeHttpUrl(u) && new URL(u)` — parsing twice, and
    // parsing the second time OUTSIDE the check that judged it.
    expect(typeof barrel.isSafeHttpUrl).toBe('function');
    expect(typeof barrel.safeHttpUrl).toBe('function');
    expect(barrel.safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(barrel.safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(barrel.isSafeHttpUrl('javascript:alert(1)')).toBe(false);
  });
});

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

  it('wears the ERROR mark, not the warning one', () => {
    // The mark vocabulary: the crossed circle is a failure, the triangle is a
    // warning. Both `.tai-error-state` panels in the SDK must carry the same one
    // — two marks on one class state two different severities for one state.
    const { container } = render(<ErrorState message="it broke" />);
    const mark = container.querySelector('.tai-error-state-title svg');
    const error = render(<XCircleIcon />).container.querySelector('svg');
    const warning = render(<AlertTriangleIcon />).container.querySelector('svg');

    expect(mark?.innerHTML).toBe(error?.innerHTML);
    expect(mark?.innerHTML).not.toBe(warning?.innerHTML);
  });

  it('speaks with one voice: the headline is the surface, not a caller choice', () => {
    // The mark, the ground and `role="alert"` all say the system failed, so a
    // caller-supplied headline could only ever contradict three things it does not
    // reach. A server's considered NO takes a warn surface instead — the warn
    // ground `.tai-warn-state`, or `role="status"` with a warn `Badge` as
    // `verdict.tsx` does — rather than this fixed error headline.
    render(<ErrorState message="Your role cannot delete scopes." />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(alert).toHaveTextContent('Your role cannot delete scopes.');
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

  it('Card forwards a consumer ref to its own element', () => {
    // A ref a component accepts and drops is worse than one it refuses: React 19
    // warns about neither, so the consumer's measurement silently reads null.
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref}>card body</Card>);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toHaveClass('tai-card');
  });

  it.each([
    ['Skeleton', <Skeleton key="s" className="mine" />, 'tai-skeleton'],
    ['EmptyState', <EmptyState key="e" title="none" className="mine" />, 'tai-empty-state'],
    ['ErrorState', <ErrorState key="r" message="broke" className="mine" />, 'tai-error-state'],
    ['Spinner', <Spinner key="p" className="mine" />, 'tai-spinner'],
  ])('%s appends the caller class to its own, as Card does', (_name, element, own) => {
    // The four siblings took no `className` at all while `Card` took one, so a
    // caller could position a card and nothing else. Merging, never replacing:
    // the surface can not lose its paint by being positioned.
    const { container } = render(element);
    expect(container.querySelector(`.${own}`)).toHaveClass(own, 'mine');
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
    // The name is TEXT, not `aria-label`: ARIA prohibits both naming attributes
    // on the `generic` role a bare <span> maps to, so a platform that honours
    // the prohibition computes no name from them at all — and an assertion that
    // read the attribute back would stay green while the name did not exist.
    const blocked = screen.getByText(/Open docs/);
    expect(blocked.textContent).toBe(
      'Open docs. This link was blocked because it is neither an in-app reference nor an http(s) URL.',
    );
    expect(blocked).toHaveClass('tai-visually-hidden');
    const neutralized = blocked.parentElement;
    expect(neutralized).toHaveAttribute('id', 'docs-link');
    expect(neutralized).toHaveAttribute('data-neutralized', 'true');
    expect(neutralized).not.toHaveAttribute('aria-label');
    // Still not announced as a link, because it is not one.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('announces a named blocked link once, not twice', () => {
    // `aria-label` REPLACES the content as the name on the live anchor, so the
    // neutralized form has to do the same: rendering the caller's name as hidden
    // text beside visible children that already say it reads the name twice.
    render(
      <Button href="javascript:alert(1)" aria-label="Open docs">
        Open docs
      </Button>,
    );
    const neutralized = screen.getByText(/Open docs\./).parentElement;
    expect(neutralized).toHaveAttribute('data-neutralized', 'true');
    expect(neutralized?.textContent).toBe(
      'Open docsOpen docs. This link was blocked because it is neither an in-app reference nor an http(s) URL.',
    );
    // Only ONE of those two "Open docs" is in the accessibility tree.
    const visible = screen.getByText('Open docs');
    expect(visible.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('carries the blocked reason alone when the caller named nothing', () => {
    render(
      <Button href="javascript:alert(1)">
        <svg />
      </Button>,
    );
    expect(
      screen.getByText(
        'This link was blocked because it is neither an in-app reference nor an http(s) URL.',
      ),
    ).toHaveClass('tai-visually-hidden');
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

  it("a caller cannot drop the external branch's rel or retarget it", () => {
    // REVERSE TABNABBING. `rel`/`target` are settable on the published surface
    // (`LinkButtonProps extends AnchorHTMLAttributes`), and the hardening is
    // carried entirely by JSX property ORDER: `{...rest}` is spread FIRST and
    // these two are written after it. Move the spread below them and this exact
    // call renders a cross-origin `_blank` with a live `window.opener` on the
    // operator's authenticated tab — with nothing else in the suite reddening.
    render(
      <Button href="https://evil.example" rel="opener" target="_self">
        go
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'go' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer external');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it("a blocked link does not forward the caller's click handler", async () => {
    // The blocked branch passes only `id` and `aria-label` to the neutralized
    // span — deliberately, and pinned here because forwarding `rest` instead
    // would fire the caller's handler on a reference the UI simultaneously
    // claims was blocked.
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button href="javascript:alert(1)" onClick={onClick}>
        go
      </Button>,
    );
    await user.click(screen.getByText(/go/));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a blocked link drops the navigation props too, not just the handler', () => {
    // `target`/`rel` describe a navigation that is not happening. Spreading the
    // rest of the anchor props onto the span would ship them on an element with
    // no href, which reads as a link the browser merely failed to open.
    render(
      <Button href="javascript:alert(1)" target="_blank" rel="opener" title="Open it">
        go
      </Button>,
    );

    const blocked = screen.getByText(/go/).closest('[data-neutralized="true"]');
    expect(blocked).not.toBeNull();
    expect(blocked).not.toHaveAttribute('target');
    expect(blocked).not.toHaveAttribute('rel');
    // The `title` the span DOES carry is the blocked reason, never the caller's.
    expect(blocked).toHaveAttribute(
      'title',
      'This link was blocked because it is neither an in-app reference nor an http(s) URL.',
    );
  });

  it('the action form of Button forwards a consumer ref to its own button', () => {
    // The LINK form declares none: its blocked branch renders a span and no
    // anchor, so a `Ref<HTMLAnchorElement>` would be filled on two renderings
    // of three and silently null on the one the safety check produces.
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button type="button" ref={ref}>
        go
      </Button>,
    );
    expect(ref.current).toBe(screen.getByRole('button', { name: 'go' }));
  });

  it.each([['#top'], ['#/agents'], ['?tab=logs'], ['?/x'], ['#//evil.example'], ['./a'], ['../a']])(
    'renders the in-app reference form %j as a live anchor',
    (href) => {
      // The five spellings this module's docblock says "stay in-app". `#/agents`
      // is a hash route, the commonest client-routed form there is. `?/x` and
      // `#//evil.example` are the two forms the docblock's own argument turns on:
      // a query-only or fragment-only reference cannot carry an authority, so
      // neither can leave the origin, and both belong on the live side.
      render(<Button href={href}>go</Button>);
      expect(screen.getByRole('link', { name: 'go' })).toHaveAttribute('href', href);
    },
  );
});
