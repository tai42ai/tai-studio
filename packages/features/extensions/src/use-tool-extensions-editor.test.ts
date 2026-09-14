/**
 * Unit tests for the pure combo updaters behind the tool-extensions editor: replace,
 * remove, and the boundary-safe reorders.
 */
import { describe, expect, it } from 'vitest';
import type { PresetExtensionElement } from '@tai42/api-client';

import {
  applyComboChange,
  moveComboDown,
  moveComboUp,
  removeCombo,
} from './use-tool-extensions-editor';

const combos = (): PresetExtensionElement[][] => [['a'], ['b'], ['c']];

describe('applyComboChange', () => {
  it('replaces only the combo at the index', () => {
    expect(applyComboChange(combos(), 1, ['x'])).toEqual([['a'], ['x'], ['c']]);
  });
});

describe('removeCombo', () => {
  it('drops only the combo at the index', () => {
    expect(removeCombo(combos(), 0)).toEqual([['b'], ['c']]);
  });
});

describe('moveComboUp', () => {
  it('swaps with the previous combo', () => {
    expect(moveComboUp(combos(), 2)).toEqual([['a'], ['c'], ['b']]);
  });

  it('is a no-op at the top', () => {
    const input = combos();
    expect(moveComboUp(input, 0)).toBe(input);
  });
});

describe('moveComboDown', () => {
  it('swaps with the next combo', () => {
    expect(moveComboDown(combos(), 0)).toEqual([['b'], ['a'], ['c']]);
  });

  it('is a no-op at the bottom', () => {
    const input = combos();
    expect(moveComboDown(input, input.length - 1)).toBe(input);
  });
});
