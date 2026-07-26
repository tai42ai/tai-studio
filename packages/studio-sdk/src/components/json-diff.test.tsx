import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JsonDiff, diffJson } from './json-diff';

describe('diffJson — pure structural diff', () => {
  it('emits added / removed / changed rows over object keys', () => {
    const rows = diffJson({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(rows).toEqual([
      { path: 'a', kind: 'removed', before: 1 },
      { path: 'b', kind: 'changed', before: 2, after: 3 },
      { path: 'c', kind: 'added', after: 4 },
    ]);
  });

  it('descends into nested objects, emitting the dotted leaf path only', () => {
    const rows = diffJson(
      { fixed_kwargs: { city: 'Paris', units: 'metric' } },
      { fixed_kwargs: { city: 'London', units: 'metric' } },
    );
    // Only the changed leaf, never the container.
    expect(rows).toEqual([
      { path: 'fixed_kwargs.city', kind: 'changed', before: 'Paris', after: 'London' },
    ]);
  });

  it('treats an array as a LEAF: one changed row carrying both whole arrays (no per-index rows)', () => {
    const rows = diffJson({ tags: ['a', 'b'] }, { tags: ['a', 'c', 'd'] });
    expect(rows).toEqual([
      { path: 'tags', kind: 'changed', before: ['a', 'b'], after: ['a', 'c', 'd'] },
    ]);
    // Exactly one row for the differing array — no `tags.0` / `tags.1` rows.
    expect(rows).toHaveLength(1);
  });

  it('emits nothing for equal arrays (deep compare)', () => {
    expect(diffJson({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([]);
  });

  it('surfaces an output_schema difference as output_schema.* rows (Item 6 fold)', () => {
    const before = {
      base_tool: 'weather',
      output_schema: { type: 'object', properties: { a: { type: 'string' } } },
    };
    const after = {
      base_tool: 'weather',
      output_schema: { type: 'object', properties: { a: { type: 'number' } } },
    };
    const rows = diffJson(before, after);
    expect(rows).toEqual([
      {
        path: 'output_schema.properties.a.type',
        kind: 'changed',
        before: 'string',
        after: 'number',
      },
    ]);
  });

  it('treats a type change (object ↔ scalar) as a single changed leaf, not a descent', () => {
    expect(diffJson({ v: { deep: 1 } }, { v: 'now-a-string' })).toEqual([
      { path: 'v', kind: 'changed', before: { deep: 1 }, after: 'now-a-string' },
    ]);
    expect(diffJson({ v: 5 }, { v: [1, 2] })).toEqual([
      { path: 'v', kind: 'changed', before: 5, after: [1, 2] },
    ]);
  });

  it('distinguishes null from a value and from a missing key', () => {
    expect(diffJson({ v: null }, { v: 0 })).toEqual([
      { path: 'v', kind: 'changed', before: null, after: 0 },
    ]);
    // A present null key vs an absent key is removed, not "unchanged".
    expect(diffJson({ v: null }, {})).toEqual([{ path: 'v', kind: 'removed', before: null }]);
  });

  it('diffs two root scalars as a single root-path changed row', () => {
    expect(diffJson('before', 'after')).toEqual([
      { path: '', kind: 'changed', before: 'before', after: 'after' },
    ]);
  });

  it('keeps a literal dotted key distinct from a nested path (no row collision)', () => {
    const rows = diffJson({ 'a.b': 1, a: { b: 10 } }, { 'a.b': 2, a: { b: 20 } });
    // Both leaves differ and share the textual path `a.b`, but they are two rows.
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.path === 'a.b' && r.kind === 'changed')).toBe(true);
  });
});

describe('JsonDiff — rendered table', () => {
  it('renders one row per difference with the path and kind badge', () => {
    render(<JsonDiff before={{ a: 1, b: 2 }} after={{ b: 3 }} />);

    const removed = screen.getByTestId('diff-row-a');
    expect(within(removed).getByText('removed')).toBeInTheDocument();
    const changed = screen.getByTestId('diff-row-b');
    expect(within(changed).getByText('changed')).toBeInTheDocument();
  });

  it('tints each row by kind while keeping the kind spelled out in words', () => {
    render(<JsonDiff before={{ a: 1, b: 2 }} after={{ b: 3, c: 4 }} />);

    const removed = screen.getByTestId('diff-row-a');
    expect(removed).toHaveClass('tai-diff-removed');
    const changed = screen.getByTestId('diff-row-b');
    expect(changed).toHaveClass('tai-diff-changed');
    const added = screen.getByTestId('diff-row-c');
    expect(added).toHaveClass('tai-diff-added');
    // The tint only reinforces the Badge — every row still names its kind.
    for (const [row, kind] of [
      [removed, 'removed'],
      [changed, 'changed'],
      [added, 'added'],
    ] as const) {
      expect(within(row).getByText(kind)).toBeInTheDocument();
    }
  });

  it('renders a scalar value on the shared inline code style', () => {
    render(<JsonDiff before={{ a: 1 }} after={{ a: 2 }} />);
    expect(screen.getByText('1')).toHaveClass('tai-code');
    expect(screen.getByText('2')).toHaveClass('tai-code');
  });

  it('renders identical bodies as a no-difference message', () => {
    render(<JsonDiff before={{ a: 1 }} after={{ a: 1 }} />);
    expect(screen.getByText(/No differences/i)).toBeInTheDocument();
  });

  it('renders a changed array as a single row (one-row-per-changed-array rule)', () => {
    render(<JsonDiff before={{ tags: ['a'] }} after={{ tags: ['a', 'b'] }} />);
    expect(screen.getByTestId('diff-row-tags')).toBeInTheDocument();
    expect(screen.queryByTestId('diff-row-tags.0')).toBeNull();
  });

  it('escapes payload markup as text (never an HTML sink)', () => {
    const { container } = render(
      <JsonDiff before={{ note: 'x' }} after={{ note: '<script>alert(1)</script>' }} />,
    );
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders both rows when a literal dotted key collides with a nested path', () => {
    render(<JsonDiff before={{ 'a.b': 1, a: { b: 10 } }} after={{ 'a.b': 2, a: { b: 20 } }} />);
    // Two changed rows share the textual path `a.b`; each is keyed uniquely so both render.
    expect(screen.getAllByTestId('diff-row-a.b')).toHaveLength(2);
  });
});
