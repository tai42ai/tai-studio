/**
 * Null-safe display formatters. Every metric on the dashboard and runs table
 * flows through one of these, so the placeholder discipline (zero is a real
 * value; only null / undefined / NaN become the em-dash) is pinned exactly.
 */
import { describe, expect, it } from 'vitest';

import {
  EMPTY_PLACEHOLDER,
  formatCost,
  formatLatencyMs,
  formatMetricValue,
  formatTimestamp,
  formatTokenCount,
  previewTree,
  previewValue,
} from './format';

describe('formatLatencyMs', () => {
  it('renders sub-second values in whole milliseconds', () => {
    expect(formatLatencyMs(0)).toBe('0ms');
    expect(formatLatencyMs(500)).toBe('500ms');
    expect(formatLatencyMs(999.6)).toBe('1000ms');
  });

  it('renders values from one second up as one-decimal seconds', () => {
    expect(formatLatencyMs(1000)).toBe('1.0s');
    expect(formatLatencyMs(1234)).toBe('1.2s');
    expect(formatLatencyMs(1500)).toBe('1.5s');
  });

  it('shows the placeholder for missing values, never a misleading zero', () => {
    expect(formatLatencyMs(null)).toBe(EMPTY_PLACEHOLDER);
    expect(formatLatencyMs(undefined)).toBe(EMPTY_PLACEHOLDER);
    expect(formatLatencyMs(Number.NaN)).toBe(EMPTY_PLACEHOLDER);
  });
});

describe('formatCost', () => {
  it('treats an exact zero as a real "$0", not the placeholder', () => {
    expect(formatCost(0)).toBe('$0');
  });

  it('widens precision for cents-level costs', () => {
    expect(formatCost(0.0042)).toBe('$0.0042');
    expect(formatCost(0.009)).toBe('$0.0090');
    expect(formatCost(0.84)).toBe('$0.840');
    expect(formatCost(12.4)).toBe('$12.40');
  });

  it('shows the placeholder for missing values', () => {
    expect(formatCost(null)).toBe(EMPTY_PLACEHOLDER);
    expect(formatCost(undefined)).toBe(EMPTY_PLACEHOLDER);
    expect(formatCost(Number.NaN)).toBe(EMPTY_PLACEHOLDER);
  });
});

describe('formatTokenCount', () => {
  it('delegates to the locale group formatter for real numbers', () => {
    expect(formatTokenCount(0)).toBe((0).toLocaleString());
    expect(formatTokenCount(1234)).toBe((1234).toLocaleString());
  });

  it('shows the placeholder for missing values', () => {
    expect(formatTokenCount(null)).toBe(EMPTY_PLACEHOLDER);
    expect(formatTokenCount(undefined)).toBe(EMPTY_PLACEHOLDER);
    expect(formatTokenCount(Number.NaN)).toBe(EMPTY_PLACEHOLDER);
  });
});

describe('formatTimestamp', () => {
  it('shows the placeholder for null, undefined, and empty string', () => {
    expect(formatTimestamp(null)).toBe(EMPTY_PLACEHOLDER);
    expect(formatTimestamp(undefined)).toBe(EMPTY_PLACEHOLDER);
    expect(formatTimestamp('')).toBe(EMPTY_PLACEHOLDER);
  });

  it('returns an unparseable value verbatim rather than swallowing it', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });

  it('renders a parseable ISO value through the locale formatter', () => {
    const iso = '2026-01-02T03:04:05Z';
    expect(formatTimestamp(iso)).toBe(new Date(iso).toLocaleString());
  });
});

describe('formatMetricValue', () => {
  it('routes each metric to its matching formatter', () => {
    expect(formatMetricValue('cost', 0)).toBe('$0');
    expect(formatMetricValue('cost', 12.4)).toBe('$12.40');
    expect(formatMetricValue('avgLatencyMs', 1500)).toBe('1.5s');
    expect(formatMetricValue('totalTokens', 1234)).toBe((1234).toLocaleString());
    expect(formatMetricValue('runs', 5)).toBe((5).toLocaleString());
  });

  it('falls back to a token count for an unknown metric', () => {
    expect(formatMetricValue('unknown', 1234)).toBe((1234).toLocaleString());
  });
});

describe('previewValue', () => {
  it('shows the placeholder for null and undefined', () => {
    expect(previewValue(null)).toBe(EMPTY_PLACEHOLDER);
    expect(previewValue(undefined)).toBe(EMPTY_PLACEHOLDER);
  });

  it('renders a short string verbatim and JSON-encodes non-strings', () => {
    expect(previewValue('hello')).toBe('hello');
    expect(previewValue({ a: 1 })).toBe('{"a":1}');
    expect(previewValue(42)).toBe('42');
  });

  it('truncates a long value to 80 chars plus an ellipsis', () => {
    const long = 'x'.repeat(200);
    const out = previewValue(long);
    expect(out).toBe(`${'x'.repeat(80)}…`);
    expect(out).toHaveLength(81);
  });

  it('keeps a value exactly at the 80-char boundary intact', () => {
    const exact = 'y'.repeat(80);
    expect(previewValue(exact)).toBe(exact);
  });
});

describe('previewTree', () => {
  it('returns an object or array value as-is for exploring', () => {
    const obj = { a: 1, b: { c: 2 } };
    expect(previewTree(obj)).toBe(obj);
    const arr = [1, 2, 3];
    expect(previewTree(arr)).toBe(arr);
  });

  it('parses a string that is itself JSON so it too can be expanded', () => {
    expect(previewTree('{"a":1}')).toEqual({ a: 1 });
    expect(previewTree('[1,2]')).toEqual([1, 2]);
  });

  it('returns null for a plain scalar/string with no structure', () => {
    expect(previewTree('hello')).toBeNull();
    expect(previewTree('42')).toBeNull();
    expect(previewTree(42)).toBeNull();
    expect(previewTree(null)).toBeNull();
    expect(previewTree(undefined)).toBeNull();
  });
});
