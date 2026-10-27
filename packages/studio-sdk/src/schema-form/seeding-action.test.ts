import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSeedingAction } from './seeding-action';

describe('useSeedingAction', () => {
  it('lets an error other than NoFiniteValueError propagate from the seed untouched', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const seedBug = new TypeError('seed walk failed');
      const subject = {};
      const { result } = renderHook(() => useSeedingAction(subject));
      let thrown: unknown;
      act(() => {
        try {
          result.current.seed(() => {
            throw seedBug;
          });
        } catch (error) {
          thrown = error;
        }
      });
      expect(thrown).toBe(seedBug);
      expect(result.current.failure).toBeUndefined();
      expect(logged).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});
