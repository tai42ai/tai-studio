import { useEffect, useState } from 'react';

/**
 * Track a value that only settles `delayMs` after it last changed. The first
 * value settles immediately, so a read keyed on it fires on mount before any edit.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return settled;
}
