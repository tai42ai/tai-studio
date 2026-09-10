import { describe, expect, it } from 'vitest';

import { findByRef, resolveCallName, resolveTemplateJq } from './catalog';
import type { BindingTemplateOption } from './types';

const CATALOG: BindingTemplateOption[] = [
  {
    name: 'tally',
    templateJq: [
      { name: 'current', purpose: 'input', description: 'The running tally.' },
      {
        name: 'bump',
        purpose: 'update',
        description: 'Add to the tally.',
        writes: [['tally']],
      },
    ],
  },
  {
    name: 'log',
    templateJq: [
      { name: 'current', purpose: 'input', description: 'The log head.' },
      { name: 'append', purpose: 'update', writes: [['entries']] },
    ],
  },
];

describe('resolveTemplateJq', () => {
  it('offers only the chosen templates', () => {
    const resolved = resolveTemplateJq(['tally'], CATALOG);
    expect(resolved.map((entry) => entry.ref).sort()).toEqual(['bump', 'current']);
  });

  it('filters by purpose', () => {
    const inputs = resolveTemplateJq(['tally'], CATALOG, 'input');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.ref).toBe('current');
    const updates = resolveTemplateJq(['tally'], CATALOG, 'update');
    expect(updates[0]?.ref).toBe('bump');
  });

  it('qualifies an ambiguous name across two templates and leaves a unique one bare', () => {
    const inputs = resolveTemplateJq(['tally', 'log'], CATALOG, 'input');
    // `current` is declared by both → both qualified.
    expect(inputs.map((entry) => entry.ref).sort()).toEqual(['log.current', 'tally.current']);
    const updates = resolveTemplateJq(['tally', 'log'], CATALOG, 'update');
    // `bump` and `append` are each unique → bare.
    expect(updates.map((entry) => entry.ref).sort()).toEqual(['append', 'bump']);
  });

  it('is empty when no template is chosen', () => {
    expect(resolveTemplateJq([], CATALOG)).toEqual([]);
  });
});

describe('findByRef', () => {
  it('finds a resolved entry by its reference', () => {
    const resolved = resolveTemplateJq(['tally'], CATALOG, 'update');
    expect(findByRef('bump', resolved)?.template).toBe('tally');
    expect(findByRef('missing', resolved)).toBeUndefined();
  });
});

describe('resolveCallName — catalog-driven, never split by string', () => {
  const catalog: BindingTemplateOption[] = [
    { name: 'my-tally', templateJq: [{ name: 'bump', purpose: 'update' }] },
    {
      name: 'tally',
      templateJq: [
        { name: 'bump__count', purpose: 'update' },
        { name: 'current', purpose: 'input' },
      ],
    },
    { name: 'log', templateJq: [{ name: 'append', purpose: 'update' }] },
  ];

  it('resolves a hyphenated qualified call name back to the catalog ref', () => {
    expect(resolveCallName('my_tally__bump', catalog)).toBe('my-tally.bump');
  });

  it('round-trips a jq name that itself contains `__`', () => {
    expect(resolveCallName('tally__bump__count', catalog)).toBe('tally.bump__count');
  });

  it('resolves a hyphenated template AND a `__` jq name together (first `__` is the boundary)', () => {
    const withPair: BindingTemplateOption[] = [
      { name: 'my-tally', templateJq: [{ name: 'bump__count', purpose: 'update' }] },
    ];
    expect(resolveCallName('my_tally__bump__count', withPair)).toBe('my-tally.bump__count');
  });

  it('resolves an unqualified name a single template declares', () => {
    expect(resolveCallName('append', catalog)).toBe('append');
  });

  it('returns null for an unknown handle', () => {
    expect(resolveCallName('ghost__x', catalog)).toBeNull();
    expect(resolveCallName('nope', catalog)).toBeNull();
  });
});
