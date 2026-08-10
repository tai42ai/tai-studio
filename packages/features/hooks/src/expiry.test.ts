/**
 * The expiry picker mapping + custom-seconds validation. Pins the null-vs-0 trap
 * (`Permanent` → explicit `null`, never `0`), the preset → seconds mapping, and the
 * positive-integer rule for a custom value (0 / negative / non-numeric / fractional
 * all throw loudly; the physical upper bound is trusted to the server's 400).
 */
import { describe, expect, it } from 'vitest';

import { resolveTtlSeconds } from './expiry';

describe('resolveTtlSeconds — presets', () => {
  it('maps Permanent to an explicit null (not 0)', () => {
    const ttl = resolveTtlSeconds('permanent', '');
    expect(ttl).toBeNull();
  });

  it('maps 1 hour / 1 day / 7 days to their seconds', () => {
    expect(resolveTtlSeconds('3600', '')).toBe(3600);
    expect(resolveTtlSeconds('86400', '')).toBe(86400);
    expect(resolveTtlSeconds('604800', '')).toBe(604800);
  });
});

describe('resolveTtlSeconds — custom', () => {
  it('accepts a positive whole number of seconds', () => {
    expect(resolveTtlSeconds('custom', '1800')).toBe(1800);
    expect(resolveTtlSeconds('custom', '  42 ')).toBe(42);
  });

  it('throws loudly on 0', () => {
    expect(() => resolveTtlSeconds('custom', '0')).toThrow(/positive whole number/);
  });

  it('throws loudly on a negative value', () => {
    expect(() => resolveTtlSeconds('custom', '-5')).toThrow(/positive whole number/);
  });

  it('throws loudly on a non-numeric value', () => {
    expect(() => resolveTtlSeconds('custom', 'abc')).toThrow(/positive whole number/);
    expect(() => resolveTtlSeconds('custom', '')).toThrow(/positive whole number/);
  });

  it('throws loudly on a fractional value (the decimal edge)', () => {
    expect(() => resolveTtlSeconds('custom', '3600.5')).toThrow(/positive whole number/);
  });
});
