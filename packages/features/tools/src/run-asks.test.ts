/**
 * Unit tests for the run-result normaliser: how a synchronous run's result, a user-only
 * park receipt, and a `resume_parked` / `cancel_parked` visit outcome map to the panel's
 * three views.
 */
import { describe, expect, it } from 'vitest';

import { readRunResult } from './run-asks';

describe('readRunResult', () => {
  it('reads a caller-ask envelope as the asks view', () => {
    const view = readRunResult({
      asks: [{ id: 'i1', status: 'asking', question: 'Approve?', asked_by: ['run-a'] }],
    });
    expect(view.kind).toBe('asks');
    if (view.kind !== 'asks') throw new Error('expected asks view');
    expect(view.asks).toHaveLength(1);
    expect(view.asks[0]?.question).toBe('Approve?');
  });

  it('reads an empty caller-ask envelope as an empty asks view', () => {
    expect(readRunResult({ asks: [] })).toEqual({ kind: 'asks', asks: [] });
  });

  it('reads a user-only suspension receipt as the parked view', () => {
    const view = readRunResult({
      interaction_id: 'u1',
      interaction_ids: ['u1'],
      caller_interaction_ids: [],
    });
    expect(view).toEqual({ kind: 'parked' });
  });

  it("reads a visit outcome's new caller asks by its kind", () => {
    const view = readRunResult({
      action: 'resumed',
      cancelled: [],
      kind: 'asks',
      asks: [{ id: 'i2', status: 'asking', question: 'And now?' }],
    });
    expect(view.kind).toBe('asks');
    if (view.kind !== 'asks') throw new Error('expected asks view');
    expect(view.asks[0]?.id).toBe('i2');
  });

  it('reads a visit outcome final result', () => {
    expect(
      readRunResult({ action: 'resumed', cancelled: [], kind: 'result', result: { ok: 1 } }),
    ).toEqual({ kind: 'result', result: { ok: 1 } });
  });

  it('reads a visit outcome re-park as the parked view', () => {
    expect(readRunResult({ action: 'resumed', cancelled: [], kind: 'parked' })).toEqual({
      kind: 'parked',
    });
  });

  it('reads a nothing-ran visit outcome as an empty result', () => {
    expect(readRunResult({ action: 'none', cancelled: ['x'], kind: 'none' })).toEqual({
      kind: 'result',
      result: null,
    });
  });

  it('reads any other value as the tool result', () => {
    expect(readRunResult({ greeting: 'hi' })).toEqual({
      kind: 'result',
      result: { greeting: 'hi' },
    });
    expect(readRunResult('plain')).toEqual({ kind: 'result', result: 'plain' });
    expect(readRunResult(42)).toEqual({ kind: 'result', result: 42 });
  });
});
