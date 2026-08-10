/**
 * The wire carries float epoch seconds, so both timestamp formatters are exercised
 * across every unit boundary and on the non-finite value neither can render — which
 * is shown verbatim rather than swallowed into a placeholder. `countOf` is here
 * too: its output is SPOKEN, where a noun that does not agree is heard.
 */
import { describe, expect, it } from 'vitest';

import { countOf, formatAbsoluteEpoch, formatInstant, formatRelativeEpoch } from './format';

const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;

describe('formatRelativeEpoch', () => {
  it.each([
    [NOW_S - 5, 'now'],
    [NOW_S - 120, '2 minutes ago'],
    [NOW_S - 7200, '2 hours ago'],
    [NOW_S - 2 * 86_400, '2 days ago'],
    [NOW_S - 2 * 604_800, '2 weeks ago'],
    [NOW_S - 2 * 2_592_000, '2 months ago'],
    [NOW_S - 2 * 31_536_000, '2 years ago'],
  ])('renders %s as %s', (seconds, expected) => {
    expect(formatRelativeEpoch(seconds, NOW_MS)).toBe(expected);
  });

  it('renders a future instant in the forward direction', () => {
    expect(formatRelativeEpoch(NOW_S + 7200, NOW_MS)).toBe('in 2 hours');
  });

  it('defaults to the current clock when no instant is supplied', () => {
    expect(formatRelativeEpoch(Date.now() / 1000)).toBe('now');
  });

  it('shows a non-finite value verbatim rather than a placeholder', () => {
    expect(formatRelativeEpoch(Number.POSITIVE_INFINITY, NOW_MS)).toBe('Infinity');
  });
});

describe('formatAbsoluteEpoch', () => {
  it('renders the local instant of an epoch-seconds value', () => {
    expect(formatAbsoluteEpoch(NOW_S)).toBe(new Date(NOW_MS).toLocaleString());
  });

  it('shows a non-finite value verbatim', () => {
    expect(formatAbsoluteEpoch(Number.NaN)).toBe('NaN');
  });
});

describe('formatInstant', () => {
  it('renders an ISO-8601 instant in the local rendering', () => {
    const iso = '2026-08-01T09:00:00Z';
    expect(formatInstant(iso)).toBe(new Date(iso).toLocaleString());
  });

  it('shows an unparseable value verbatim rather than swallowing it', () => {
    expect(formatInstant('not-a-date')).toBe('not-a-date');
  });
});

describe('countOf', () => {
  it('agrees the noun with the count', () => {
    expect(countOf(1, 'thread', 'threads')).toBe('1 thread');
    expect(countOf(2, 'thread', 'threads')).toBe('2 threads');
  });

  it('reads zero as a plural, as English does', () => {
    expect(countOf(0, 'exchange', 'exchanges')).toBe('0 exchanges');
  });
});
