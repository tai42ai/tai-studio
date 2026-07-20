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

  it('renders a string containing <script> as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(<JsonTree data={{ note: payload }} />);
    // The literal text is present (React escaped it)...
    expect(screen.getByText(`"${payload}"`)).toBeInTheDocument();
    // ...and NO real <script> element was created from the payload.
    expect(container.querySelector('script')).toBeNull();
  });
});
