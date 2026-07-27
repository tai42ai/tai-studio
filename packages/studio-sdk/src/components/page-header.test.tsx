import { render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { Page, PageHeader, Stack } from './page-header';
import { Button } from './primitives';

describe('PageHeader', () => {
  it('renders exactly one h1 whose accessible name is the title verbatim', () => {
    render(<PageHeader title="Tools" />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    const [h1] = headings;
    expect(h1).toHaveAccessibleName('Tools');
    expect(h1).toHaveClass('tai-page-title');
  });

  it('keeps the eyebrow out of the h1 and out of its accessible name', () => {
    const { container } = render(<PageHeader title="Tools" eyebrow="Build" />);

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveAccessibleName('Tools');
    expect(within(h1).queryByText('Build')).not.toBeInTheDocument();
    expect(h1.textContent).toBe('Tools');

    const eyebrow = screen.getByText('Build');
    expect(eyebrow).toHaveClass('tai-label');
    expect(eyebrow.contains(h1)).toBe(false);
    expect(h1.contains(eyebrow)).toBe(false);
    expect(container.querySelector('header')).toHaveClass('tai-page-header');
  });

  it('renders the description and the actions slot', () => {
    const { container } = render(
      <PageHeader
        title="Tools"
        description="Everything the agent can call."
        actions={<Button>New tool</Button>}
      />,
    );

    const description = screen.getByText('Everything the agent can call.');
    expect(description).toHaveClass('tai-page-description');

    const actions = container.querySelector('.tai-page-actions');
    expect(actions).not.toBeNull();
    expect(within(actions as HTMLElement).getByRole('button', { name: 'New tool' })).toBeVisible();
  });

  it('omits the description and actions blocks when they are not supplied', () => {
    const { container } = render(<PageHeader title="Tools" />);

    expect(container.querySelector('.tai-page-description')).toBeNull();
    expect(container.querySelector('.tai-page-actions')).toBeNull();
    expect(container.querySelector('.tai-label')).toBeNull();
  });

  it('forwards titleRef and id, and keeps the h1 programmatically focusable', () => {
    const titleRef = createRef<HTMLHeadingElement>();
    render(<PageHeader title="Tools" titleRef={titleRef} id="tools-title" />);

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(titleRef.current).toBe(h1);
    expect(h1).toHaveAttribute('id', 'tools-title');
    expect(h1).toHaveAttribute('tabindex', '-1');

    titleRef.current?.focus();
    expect(h1).toHaveFocus();
  });

  it('puts its title, eyebrow and description on their design-system classes', () => {
    render(
      <PageHeader title="Tools" eyebrow="Build" description="Everything the agent can call." />,
    );

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveAccessibleName('Tools');
    expect(h1).toHaveClass('tai-page-title');
    expect(screen.getByText('Build')).toHaveClass('tai-label');
    expect(screen.getByText('Everything the agent can call.')).toHaveClass('tai-page-description');
  });
});

describe('Page', () => {
  it('renders a tai-page wrapper around its children', () => {
    const { container } = render(
      <Page>
        <p>body</p>
      </Page>,
    );

    const page = container.firstElementChild;
    expect(page).toHaveClass('tai-page');
    expect(within(page as HTMLElement).getByText('body')).toBeInTheDocument();
  });

  it('merges a caller className and style', () => {
    const { container } = render(
      <Page className="narrow" style={{ maxWidth: '40rem' }}>
        <p>body</p>
      </Page>,
    );

    const page = container.firstElementChild as HTMLElement;
    expect(page).toHaveClass('tai-page', 'narrow');
    expect(page.style.maxWidth).toBe('40rem');
  });
});

describe('Stack', () => {
  it('adds no modifier at the default gap', () => {
    const { container } = render(
      <Stack>
        <p>body</p>
      </Stack>,
    );

    const stack = container.firstElementChild as HTMLElement;
    expect(stack.className).toBe('tai-stack');
  });

  it.each([2, 3, 6] as const)('adds the tai-stack-%i modifier for gap %i', (gap) => {
    const { container } = render(
      <Stack gap={gap}>
        <p>body</p>
      </Stack>,
    );

    expect(container.firstElementChild).toHaveClass('tai-stack', `tai-stack-${String(gap)}`);
  });

  it('accepts gap 4 explicitly without a modifier, and merges className and style', () => {
    const { container } = render(
      <Stack gap={4} className="pad" style={{ paddingBlock: '1rem' }}>
        <p>body</p>
      </Stack>,
    );

    const stack = container.firstElementChild as HTMLElement;
    expect(stack.className).toBe('tai-stack pad');
    expect(stack.style.paddingBlock).toBe('1rem');
  });
});
