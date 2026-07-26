import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CodeBlock } from './code-block';
import { setElementOverflow } from '../testing';

/** The `<pre>` — the scrolling box itself — failing loudly if it is missing. */
function codeBox(container: HTMLElement): HTMLElement {
  const pre = container.querySelector<HTMLElement>('pre');
  if (pre === null) throw new Error('no <pre> rendered');
  return pre;
}

describe('CodeBlock', () => {
  it('renders code inside a <pre> preserving the text', () => {
    const { container } = render(<CodeBlock code={'line 1\nline 2'} />);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre).toHaveTextContent('line 1');
    expect(pre).toHaveTextContent('line 2');
  });

  it('renders a payload containing <script> as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(<CodeBlock code={payload} />);
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('shows an optional language caption on the shared label style', () => {
    render(<CodeBlock code="{}" language="json" />);
    expect(screen.getByText('json')).toHaveClass('tai-label');
  });

  it('omits the caption entirely when no language is given', () => {
    const { container } = render(<CodeBlock code="{}" />);
    expect(container.querySelector('.tai-label')).toBeNull();
  });

  it('names the block and makes it reachable ONLY while it overflows', async () => {
    const { container, rerender } = render(<CodeBlock code="{}" language="json" />);
    const pre = codeBox(container);
    expect(pre).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    // The text is edited IN PLACE — React keeps the same <pre> and the same
    // <code>, so nothing is added or removed and no observed box changes size.
    // The measurement still has to be re-taken.
    setElementOverflow(pre, true);
    rerender(<CodeBlock code={'{ "a": 1 }'.repeat(40)} language="json" />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'json' })).toBe(pre);
    });
    expect(pre).toHaveAttribute('tabindex', '0');
  });

  it('renders on the terminal ground with no inline palette', () => {
    const { container } = render(<CodeBlock code="{}" language="json" />);
    const pre = container.querySelector('pre');
    expect(pre).toHaveClass('tai-code-block');
    expect(pre?.getAttribute('style')).toBeNull();
  });
});
