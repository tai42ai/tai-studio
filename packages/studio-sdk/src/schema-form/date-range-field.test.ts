import { describe, expect, it } from 'vitest';

import { dateRangePairs, fieldDrawingOrder } from './date-range-field';
import type { JsonSchema } from './types';

const DATE: JsonSchema = { type: 'string', format: 'date' };
const TIME: JsonSchema = { type: 'string', format: 'time' };
const TIMED: Readonly<Record<string, JsonSchema>> = {
  start: DATE,
  end: { ...DATE, rangeStart: 'start' },
  start_time: { ...TIME, timeOf: 'start' },
  end_time: { ...TIME, timeOf: 'end' },
};

describe('fieldDrawingOrder', () => {
  it('puts each time right after its date', () => {
    expect(fieldDrawingOrder(['start', 'end', 'start_time', 'end_time'], TIMED)).toEqual([
      'start',
      'start_time',
      'end',
      'end_time',
    ]);
  });

  it('moves a time declared before its date', () => {
    expect(fieldDrawingOrder(['end_time', 'start', 'end'], TIMED)).toEqual([
      'start',
      'end',
      'end_time',
    ]);
  });

  it('keeps a form without timeOf unchanged', () => {
    const properties = { b: DATE, a: { type: 'string' }, t: TIME } as const;
    expect(fieldDrawingOrder(['b', 'a', 't'], properties)).toEqual(['b', 'a', 't']);
  });

  it('keeps a time whose date is not listed in place', () => {
    const properties = { ...TIMED, note: { type: 'string' } } as const;
    expect(fieldDrawingOrder(['note', 'end_time', 'start'], properties)).toEqual([
      'note',
      'end_time',
      'start',
    ]);
  });

  it('is idempotent', () => {
    const once = fieldDrawingOrder(['end_time', 'end', 'start_time', 'start'], TIMED);
    expect(once).toEqual(['end', 'end_time', 'start', 'start_time']);
    expect(fieldDrawingOrder(once, TIMED)).toEqual(once);
  });

  const CHAIN: Readonly<Record<string, JsonSchema>> = {
    d: DATE,
    t1: { ...TIME, timeOf: 'd' },
    t2: { ...TIME, timeOf: 't1' },
  };
  const CYCLE: Readonly<Record<string, JsonSchema>> = {
    a: { ...TIME, timeOf: 'b' },
    b: { ...TIME, timeOf: 'a' },
    c: { type: 'string' },
  };

  it('keeps a time pointing at a moving name in place', () => {
    expect(fieldDrawingOrder(['d', 't1', 't2'], CHAIN)).toEqual(['d', 't1', 't2']);
    expect(fieldDrawingOrder(['t2', 't1', 'd'], CHAIN)).toEqual(['t2', 'd', 't1']);
  });

  it('keeps a timeOf cycle in place', () => {
    expect(fieldDrawingOrder(['a', 'b', 'c'], CYCLE)).toEqual(['a', 'b', 'c']);
    expect(fieldDrawingOrder(['c', 'b', 'a'], CYCLE)).toEqual(['c', 'b', 'a']);
  });

  it('is idempotent on a chain or a cycle', () => {
    for (const [names, properties] of [
      [['t2', 't1', 'd'], CHAIN],
      [['c', 'b', 'a'], CYCLE],
    ] as const) {
      const once = fieldDrawingOrder(names, properties);
      expect(fieldDrawingOrder(once, properties)).toEqual(once);
    }
  });
});

describe('dateRangePairs', () => {
  it("names each end's paired time", () => {
    const [pair] = dateRangePairs(Object.entries(TIMED));
    expect(pair?.startName).toBe('start');
    expect(pair?.endName).toBe('end');
    expect(pair?.startTimeName).toBe('start_time');
    expect(pair?.endTimeName).toBe('end_time');
  });

  it('names no time for an end without one', () => {
    const { end_time: _dropped, ...startTimeOnly } = TIMED;
    const [pair] = dateRangePairs(Object.entries(startTimeOnly));
    expect(pair?.startTimeName).toBe('start_time');
    expect(pair?.endTimeName).toBeUndefined();
  });
});
