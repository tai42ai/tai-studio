import { describe, expect, it } from 'vitest';

import {
  indexSections,
  type SearchEntry,
  shownEntry,
  stepEntry,
  visibleOptions,
} from './searchable-select-model';

const FLAT = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', disabled: true },
  { value: 'c', label: 'Gamma' },
  { value: 'd', label: 'Alphabet' },
];

describe('indexSections', () => {
  it('numbers options across groups in reading order and lowers their labels', () => {
    const sections = indexSections(undefined, [
      { label: 'One', options: [{ value: 'a', label: 'Alpha' }] },
      { label: 'Two', options: [{ value: 'b', label: 'BETA' }] },
    ]);
    expect(sections.map((section) => section.label)).toEqual(['One', 'Two']);
    expect(sections[1]?.entries[0]).toMatchObject({ position: 1, loweredLabel: 'beta' });
  });

  it('indexes a flat run as one unlabelled section', () => {
    const sections = indexSections(FLAT, undefined);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.label).toBeUndefined();
    expect(sections[0]?.entries.map((entry) => entry.position)).toEqual([0, 1, 2, 3]);
  });
});

describe('visibleOptions', () => {
  it('keeps the entries whose label contains the query, as the indexed objects', () => {
    const sections = indexSections(FLAT, undefined);
    const visible = visibleOptions(sections, 'ALPH');
    expect(visible.entries.map((entry) => entry.option.value)).toEqual(['a', 'd']);
    expect(visible.entries[0]).toBe(sections[0]?.entries[0]);
  });

  it('drops a group the query empties and returns everything for a blank query', () => {
    const sections = indexSections(undefined, [
      { label: 'One', options: [{ value: 'a', label: 'Alpha' }] },
      { label: 'Two', options: [{ value: 'b', label: 'Beta' }] },
    ]);
    expect(visibleOptions(sections, 'bet').sections.map((section) => section.label)).toEqual([
      'Two',
    ]);
    expect(visibleOptions(sections, '  ').sections).toEqual(sections);
  });
});

function valueOf(entry: SearchEntry | undefined): string | undefined {
  return entry?.option.value;
}

describe('stepEntry', () => {
  const entries = visibleOptions(indexSections(FLAT, undefined), '').entries;
  const [alpha, , gamma, alphabet] = entries;

  it('skips a disabled entry and stops at either end', () => {
    expect(valueOf(stepEntry(entries, alpha, 1))).toBe('c');
    expect(valueOf(stepEntry(entries, gamma, -1))).toBe('a');
    expect(valueOf(stepEntry(entries, alphabet, 1))).toBe('d');
    expect(valueOf(stepEntry(entries, alpha, -1))).toBe('a');
  });

  it('lands on the first or last enabled entry from no highlight', () => {
    expect(valueOf(stepEntry(entries, undefined, 1))).toBe('a');
    expect(valueOf(stepEntry(entries, undefined, -1))).toBe('d');
    expect(stepEntry([], undefined, 1)).toBeUndefined();
  });
});

describe('shownEntry', () => {
  const entries = visibleOptions(indexSections(FLAT, undefined), '').entries;

  it('keeps a visible enabled highlight by value and otherwise falls to the first enabled entry', () => {
    expect(valueOf(shownEntry(entries, 'c'))).toBe('c');
    expect(valueOf(shownEntry(entries, 'b'))).toBe('a');
    expect(valueOf(shownEntry(entries, 'gone'))).toBe('a');
    expect(valueOf(shownEntry(entries, undefined))).toBe('a');
    expect(shownEntry([], 'a')).toBeUndefined();
  });

  it('follows its value to a new position when the list changes around it', () => {
    const grown = visibleOptions(
      indexSections([{ value: 'z', label: 'Zeta' }, ...FLAT], undefined),
      '',
    ).entries;
    expect(shownEntry(grown, 'c')?.position).toBe(3);
  });
});
