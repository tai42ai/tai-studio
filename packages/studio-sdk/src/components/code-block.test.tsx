import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CodeBlock } from './code-block';

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

  it('renders on the terminal ground with no inline palette', () => {
    const { container } = render(<CodeBlock code="{}" language="json" />);
    const pre = container.querySelector('pre');
    expect(pre).toHaveClass('tai-code-block');
    expect(pre?.getAttribute('style')).toBeNull();
  });
});
