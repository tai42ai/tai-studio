import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JsonTree } from './json-tree';

function firstOf<T extends Element>(nodes: NodeListOf<T>): T {
  const [node] = nodes;
  if (node === undefined) throw new Error('expected a matching element');
  return node;
}

/** Lets the clipboard write settle so the copied state has been applied. */
async function settleClipboard(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function mockClipboard() {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

/** A chain `{ k0: { k1: { … { leaf: 'deep' } } } }`, one distinct key per level. */
function nest(depth: number, max: number): unknown {
  if (depth === max) return { leaf: 'deep' };
  return { [`k${String(depth)}`]: nest(depth + 1, max) };
}

/** A balanced object tree `depth` levels deep with `width` children per node; leaves are `0`. */
function makeWide(depth: number, width: number): unknown {
  if (depth === 0) return 0;
  const node: Record<string, unknown> = {};
  for (let i = 0; i < width; i += 1) node[`c${String(i)}`] = makeWide(depth - 1, width);
  return node;
}

describe('JsonTree', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  describe('scale guards', () => {
    it('collapses nodes deeper than depth 1 by default, rendering none of their children', () => {
      render(<JsonTree data={{ a: { b: { c: 1 } } }} label="Body" />);
      // The root (depth 0) and its child (depth 1) are open...
      expect(screen.getByText('a:')).toBeInTheDocument();
      expect(screen.getByText('b:')).toBeInTheDocument();
      // ...but the depth-2 node is collapsed, so `c` is not in the DOM at all.
      expect(screen.queryByText('c:')).not.toBeInTheDocument();
    });

    it('honours defaultExpanded for small payloads that opt to expand', () => {
      render(<JsonTree data={{ a: { b: { c: 1 } } }} defaultExpanded label="Body" />);
      // Every level is open, so the deep value renders.
      expect(screen.getByText('c:')).toBeInTheDocument();
      expect(screen.getByText('1')).toHaveClass('tai-syntax-number');
    });

    it('collapses to the root when defaultExpanded is false', () => {
      const { container } = render(
        <JsonTree data={{ a: { b: 1 } }} defaultExpanded={false} label="Body" />,
      );
      // The root disclosure is closed, so not even its direct children render.
      expect(firstOf(container.querySelectorAll('details')).open).toBe(false);
      expect(screen.queryByText('a:')).not.toBeInTheDocument();
    });

    it('expands and collapses every node from the toolbar controls', async () => {
      const user = userEvent.setup();
      render(<JsonTree data={{ a: { b: { c: 1 } } }} label="Body" />);
      expect(screen.queryByText('c:')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Expand all' }));
      expect(screen.getByText('c:')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Collapse all' }));
      // Collapse-all closes the root too, so its children disappear.
      expect(screen.queryByText('a:')).not.toBeInTheDocument();
    });

    it('pages a large container, revealing the next page on demand', async () => {
      const user = userEvent.setup();
      const data = Array.from({ length: 150 }, (_, index) => index);
      const { container } = render(<JsonTree data={data} label="Body" />);

      // The first page renders exactly PAGE_SIZE children, the rest wait.
      expect(container.querySelectorAll('.tai-syntax-number')).toHaveLength(100);
      const showMore = screen.getByRole('button', { name: 'Show 50 more' });

      await user.click(showMore);

      expect(container.querySelectorAll('.tai-syntax-number')).toHaveLength(150);
      expect(screen.queryByRole('button', { name: /Show \d+ more/ })).not.toBeInTheDocument();
    });

    it('caps expand-all at a depth, past which a node opens only on an explicit click', async () => {
      const user = userEvent.setup();
      render(<JsonTree data={nest(0, 8)} label="Body" />);

      await user.click(screen.getByRole('button', { name: 'Expand all' }));
      // Expand-all opens through the cap: the last auto-opened level shows its key,
      // but the node at the cap stays closed, so the key inside it does not render.
      expect(screen.getByText('k5:')).toBeInTheDocument();
      expect(screen.queryByText('k6:')).not.toBeInTheDocument();

      // An explicit toggle of the capped node opens it — expansion past the cap is
      // always available, it is just never forced.
      await user.click(screen.getByText('k5:'));
      expect(screen.getByText('k6:')).toBeInTheDocument();
    });

    it('bounds expand-all by a total node budget on a wide-and-deep payload', async () => {
      const user = userEvent.setup();
      // Full expansion (every container through the depth cap) would render 7**4
      // leaves; the node budget must open only a bounded subset of that product.
      const fullLeaves = 7 ** 4;
      const { container } = render(<JsonTree data={makeWide(4, 7)} label="Body" />);

      await user.click(screen.getByRole('button', { name: 'Expand all' }));

      const leaves = container.querySelectorAll('.tai-syntax-number').length;
      // Far fewer than a full expansion would lay out — the budget stopped it short.
      expect(leaves).toBeLessThan(fullLeaves);
      // ...yet a usable subset did open.
      expect(leaves).toBeGreaterThan(0);
      // A container the budget left collapsed keeps its click-to-expand affordance.
      const closed = Array.from(container.querySelectorAll('details')).filter((d) => !d.open);
      expect(closed.length).toBeGreaterThan(0);
    });

    it('skips an over-budget node yet still opens a smaller sibling within the budget', async () => {
      const user = userEvent.setup();
      // Fourteen sibling arrays of one page each drain the budget down to 84 before
      // `big` is reached; `big`'s own page (100) no longer fits, so it is skipped —
      // and a later one-key `small` still opens on the 84 that remain. Abandoning the
      // whole queue when `big` overspends would deny `small` an open it clearly fits.
      const filler = (): unknown => Array.from({ length: 100 }, (_, index) => index);
      const data: Record<string, unknown> = {};
      for (let i = 0; i < 14; i += 1) data[`f${String(i)}`] = filler();
      data.big = Array.from({ length: 100 }, (_, index) => `big-${String(index)}`);
      data.small = { small_marker: 'small-here' };
      render(<JsonTree data={data} label="Body" />);

      await user.click(screen.getByRole('button', { name: 'Expand all' }));

      // `big` is skipped: its distinctive elements never render.
      expect(screen.queryByText('"big-0"')).not.toBeInTheDocument();
      // ...but the smaller sibling opened, so its leaf is in the DOM.
      expect(screen.getByText('small_marker:')).toBeInTheDocument();
      expect(screen.getByText('"small-here"')).toBeInTheDocument();
    });

    it('keeps expand-all within the total node budget even when it skips past nodes', async () => {
      const user = userEvent.setup();
      // Forty full-page arrays: opening them all would lay out 4000 leaves. The sweep
      // opens as many as fit and skips the rest, so the total rendered leaf count
      // stays at or below the page-bounded budget.
      const rows: Record<string, unknown> = {};
      for (let i = 0; i < 40; i += 1)
        rows[`row${String(i)}`] = Array.from({ length: 100 }, (_, index) => index);
      const { container } = render(<JsonTree data={rows} label="Body" />);

      await user.click(screen.getByRole('button', { name: 'Expand all' }));

      const leaves = container.querySelectorAll('.tai-syntax-number').length;
      expect(leaves).toBeGreaterThan(0);
      expect(leaves).toBeLessThanOrEqual(1500);
    });

    it('opens a budget-collapsed node on an explicit click', async () => {
      const user = userEvent.setup();
      const { container } = render(<JsonTree data={makeWide(4, 7)} label="Body" />);
      await user.click(screen.getByRole('button', { name: 'Expand all' }));

      const before = container.querySelectorAll('.tai-syntax-number').length;
      const closed = Array.from(container.querySelectorAll('details')).find((d) => !d.open);
      if (closed === undefined) throw new Error('expected a collapsed container');
      const summary = closed.querySelector('summary');
      if (summary === null) throw new Error('expected a summary to click');

      await user.click(summary);

      // Clicking a collapsed container reveals more of the tree than the budget did.
      expect(container.querySelectorAll('.tai-syntax-number').length).toBeGreaterThan(before);
    });

    it('materializes only the visible window of a large object, never every value', () => {
      const width = 150;
      const read = new Set<string>();
      const target: Record<string, unknown> = {};
      for (let i = 0; i < width; i += 1) target[`k${String(i)}`] = i;
      // The get trap records which values are read; keys enumeration does not fire it,
      // so only values the render actually materializes show up here.
      const proxied = new Proxy(target, {
        get(object, prop, receiver): unknown {
          if (typeof prop === 'string') read.add(prop);
          return Reflect.get(object, prop, receiver);
        },
      });

      render(<JsonTree data={proxied} label="Body" />);

      // Exactly the first page (PAGE_SIZE = 100) of values is read...
      expect(read.has('k0')).toBe(true);
      expect(read.has('k99')).toBe(true);
      expect(read.size).toBe(100);
      // ...and nothing past the window is ever materialized.
      expect(read.has('k100')).toBe(false);
      expect(read.has('k149')).toBe(false);
    });

    it('shows no toolbar for a primitive root', () => {
      render(<JsonTree data={42} label="Body" />);
      expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument();
      expect(screen.getByText('42')).toHaveClass('tai-syntax-number');
    });
  });

  describe('copy', () => {
    it('copies the whole payload from the toolbar', async () => {
      const user = userEvent.setup();
      const writeText = mockClipboard();
      const data = { a: 1, b: [2, 3] };
      render(<JsonTree data={data} label="Body" />);

      await user.click(screen.getByRole('button', { name: 'Copy' }));
      await settleClipboard();

      expect(writeText).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it('copies a single node from its disclosure', async () => {
      const user = userEvent.setup();
      const writeText = mockClipboard();
      render(<JsonTree data={{ inner: { x: 1 } }} label="Body" />);

      await user.click(screen.getByRole('button', { name: 'Copy inner' }));
      await settleClipboard();

      expect(writeText).toHaveBeenCalledWith(JSON.stringify({ x: 1 }, null, 2));
    });

    it('does not toggle the disclosure when its copy button is pressed', async () => {
      const user = userEvent.setup();
      mockClipboard();
      const { container } = render(<JsonTree data={{ inner: { x: 1 } }} label="Body" />);

      const disclosure = container.querySelectorAll('details')[1];
      if (disclosure === undefined) throw new Error('expected a nested disclosure');
      const before = disclosure.open;

      await user.click(screen.getByRole('button', { name: 'Copy inner' }));
      await settleClipboard();

      expect(disclosure.open).toBe(before);
    });

    it('announces a successful copy through one polite region', async () => {
      const user = userEvent.setup();
      mockClipboard();
      const { container } = render(<JsonTree data={{ a: 1 }} label="Body" />);

      const live = firstOf(container.querySelectorAll('[aria-live]'));
      expect(live).toHaveAttribute('aria-live', 'polite');
      expect(live.textContent).toBe('');

      await user.click(screen.getByRole('button', { name: 'Copy' }));
      await settleClipboard();

      expect(live.textContent).toBe('Copied to clipboard');
    });

    it('surfaces a loud alert when the clipboard write is refused', async () => {
      const user = userEvent.setup();
      const writeText = vi
        .fn<(text: string) => Promise<void>>()
        .mockRejectedValue(new Error('clipboard denied by permissions policy'));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      render(<JsonTree data={{ a: 1 }} label="Body" />);

      await user.click(screen.getByRole('button', { name: 'Copy' }));
      await settleClipboard();

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Copy failed');
      expect(alert).toHaveTextContent('clipboard denied by permissions policy');
    });

    it('says so when the browser offers no clipboard at all', async () => {
      const user = userEvent.setup();
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      render(<JsonTree data={{ a: 1 }} label="Body" />);

      await user.click(screen.getByRole('button', { name: 'Copy' }));
      await settleClipboard();

      expect(screen.getByRole('alert')).toHaveTextContent(
        'This browser will not write to the clipboard here.',
      );
    });

    it('names a node copy button with the words it is showing (WCAG 2.5.3)', async () => {
      const user = userEvent.setup();
      mockClipboard();
      render(<JsonTree data={{ inner: { x: 1 } }} label="Body" />);

      const button = screen.getByRole('button', { name: 'Copy inner' });
      expect(button).toHaveAccessibleName('Copy inner');

      await user.click(button);
      await settleClipboard();

      expect(button).toHaveAccessibleName('Copied');
    });
  });
});
