import { describe, expect, it } from 'vitest';

import { comboElementNames, extensionElementName } from './extension-combos';

describe('extensionElementName', () => {
  it('returns a bare-name element as-is and a { name, config } element by its name', () => {
    expect(extensionElementName('a')).toBe('a');
    expect(extensionElementName({ name: 'b', config: { k: 1 } })).toBe('b');
  });
});

describe('comboElementNames', () => {
  it('projects bare-name and { name, config } elements to their names', () => {
    expect(comboElementNames(['a', { name: 'b', config: { k: 1 } }])).toEqual(['a', 'b']);
  });
});
