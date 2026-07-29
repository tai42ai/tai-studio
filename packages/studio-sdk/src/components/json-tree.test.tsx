import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { JsonTree } from './json-tree';

function firstOf<T extends Element>(nodes: NodeListOf<T>): T {
  const [node] = nodes;
  if (node === undefined) throw new Error('expected a matching element');
  return node;
}

describe('JsonTree', () => {
  it('renders primitives inline and objects/arrays as disclosures', () => {
    render(<JsonTree data={{ name: 'echo', tags: ['a', 'b'] }} />);
    expect(screen.getByText(/"echo"/)).toBeInTheDocument();
    // Nested array is a details/summary disclosure.
    expect(screen.getByText(/Array\(2\)/)).toBeInTheDocument();
  });

  it('collapses and expands a node when its summary is toggled', async () => {
    const user = userEvent.setup();
    const { container } = render(<JsonTree data={{ a: 1, b: 2 }} defaultExpanded />);
    const root = firstOf(container.querySelectorAll('details'));
    const summary = firstOf(container.querySelectorAll('summary'));
    expect(root.open).toBe(true);
    await user.click(summary);
    expect(root.open).toBe(false);
  });

  it('renders on the terminal ground', () => {
    const { container } = render(<JsonTree data={{ a: 1 }} />);
    expect(container.querySelector('.tai-code-block')).not.toBeNull();
  });

  it('tints each primitive with the syntax class for its type', () => {
    render(
      <JsonTree data={{ s: 'txt', n: 1, b: true, z: null, u: undefined, f: () => undefined }} />,
    );
    expect(screen.getByText('"txt"')).toHaveClass('tai-syntax-string');
    expect(screen.getByText('1')).toHaveClass('tai-syntax-number');
    expect(screen.getByText('true')).toHaveClass('tai-syntax-bool');
    expect(screen.getByText('null')).toHaveClass('tai-syntax-null');
    expect(screen.getByText('undefined')).toHaveClass('tai-syntax-null');
    // A non-JSON value has no syntax color of its own; it reads as muted.
    expect(screen.getByText('[Function]')).toHaveClass('tai-muted');
  });

  it('marks a key with the key syntax class', () => {
    render(<JsonTree data={{ name: 'echo' }} />);
    expect(screen.getByText('name:')).toHaveClass('tai-syntax-key');
  });

  it('renders a string containing <script> as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(<JsonTree data={{ note: payload }} />);
    // The literal text is present (React escaped it)...
    expect(screen.getByText(`"${payload}"`)).toBeInTheDocument();
    // ...and NO real <script> element was created from the payload.
    expect(container.querySelector('script')).toBeNull();
  });
});
