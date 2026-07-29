import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';

describe('Badge', () => {
  it('renders its content as text', () => {
    render(<Badge>oauth</Badge>);
    expect(screen.getByText('oauth')).toBeInTheDocument();
  });

  it('reflects a known variant on the element', () => {
    render(<Badge variant="success">connected</Badge>);
    expect(screen.getByText('connected')).toHaveAttribute('data-variant', 'success');
  });

  it('accepts an arbitrary kind string (falls back to neutral styling)', () => {
    render(<Badge variant="mcp_tool">mcp_tool</Badge>);
    const badge = screen.getByText('mcp_tool');
    expect(badge).toHaveAttribute('data-variant', 'mcp_tool');
    expect(badge).toHaveClass('tai-badge', 'tai-badge-neutral');
  });

  it('maps every known variant onto its tint class', () => {
    const variants = [
      ['neutral', 'tai-badge-neutral'],
      ['success', 'tai-badge-ok'],
      ['warning', 'tai-badge-warn'],
      ['danger', 'tai-badge-err'],
    ] as const;
    for (const [variant, expected] of variants) {
      const view = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toHaveClass('tai-badge', expected);
      view.unmount();
    }
  });

  it('defaults to neutral and leaves the accent tint to the primary variant', () => {
    const { unmount } = render(<Badge>plain</Badge>);
    expect(screen.getByText('plain')).toHaveClass('tai-badge', 'tai-badge-neutral');
    unmount();

    render(<Badge variant="primary">accent</Badge>);
    const accent = screen.getByText('accent');
    expect(accent).toHaveAttribute('class', 'tai-badge');
  });
});
