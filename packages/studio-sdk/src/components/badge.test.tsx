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
    expect(screen.getByText('mcp_tool')).toHaveAttribute('data-variant', 'mcp_tool');
  });
});
