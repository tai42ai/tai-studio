import { describe, expect, it } from 'vitest';

import { formatReadbackValue, slotValueText } from './value-text';

describe('formatReadbackValue', () => {
  it('reads an unfilled value or an empty list as a dash', () => {
    expect(formatReadbackValue(undefined, undefined)).toBe('—');
    expect(formatReadbackValue(null, undefined)).toBe('—');
    expect(formatReadbackValue('', undefined)).toBe('—');
    expect(formatReadbackValue([], undefined)).toBe('—');
  });

  it("joins a list's entries and draws an object as JSON", () => {
    expect(formatReadbackValue(['a', 2, { k: 1 }], undefined)).toBe('a, 2, {"k":1}');
    expect(formatReadbackValue({ k: 1 }, undefined)).toBe('{"k":1}');
    expect(formatReadbackValue(3, undefined)).toBe('3');
  });

  it("reads a yes/no value in the field's words, else Yes / No", () => {
    expect(formatReadbackValue(true, undefined)).toBe('Yes');
    expect(formatReadbackValue(false, { trueLabel: 'Agreed', falseLabel: null })).toBe('No');
    expect(formatReadbackValue(true, { trueLabel: 'Agreed' })).toBe('Agreed');
    expect(formatReadbackValue(false, { falseLabel: 'Declined' })).toBe('Declined');
  });
});

describe('slotValueText', () => {
  it('draws a filled slot as text and an unfilled one as undefined', () => {
    expect(slotValueText('Total')).toBe('Total');
    expect(slotValueText(12.5)).toBe('12.5');
    expect(slotValueText(false)).toBe('false');
    expect(slotValueText(null)).toBeUndefined();
    expect(slotValueText(undefined)).toBeUndefined();
  });
});
