/**
 * Unit tests for the run-answer reader: a synchronous run's served answer maps to the
 * panel's views by its `kind`, and a refused answer (an `ApiSchemaError`) yields its first
 * issue for the unreadable panel's details.
 */
import { ApiSchemaError } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import { readRunResult, unreadableIssue } from './run-asks';

const suspended = { interaction_id: 'u1', interaction_ids: ['u1'], caller_interaction_ids: [] };

describe('readRunResult', () => {
  it('reads a result answer as the tool value', () => {
    expect(readRunResult({ kind: 'result', result: { greeting: 'hi' } })).toEqual({
      kind: 'result',
      result: { greeting: 'hi' },
    });
  });

  it('reads a tool value shaped like a park as the tool value, never as asks', () => {
    const value = { kind: 'asks', asks: [{ id: 'i1' }] };
    expect(readRunResult({ kind: 'result', result: value })).toEqual({
      kind: 'result',
      result: value,
    });
  });

  it('reads an asks answer as the asks view', () => {
    const view = readRunResult({
      kind: 'asks',
      asks: [{ id: 'i1', status: 'asking', question: 'Approve?', asked_by: ['run-a'] }],
      suspended,
    } as Parameters<typeof readRunResult>[0]);
    expect(view.kind).toBe('asks');
    if (view.kind !== 'asks') throw new Error('expected asks view');
    expect(view.asks[0]?.question).toBe('Approve?');
  });

  it('reads a parked answer as the parked view', () => {
    expect(
      readRunResult({ kind: 'parked', suspended } as Parameters<typeof readRunResult>[0]),
    ).toEqual({ kind: 'parked' });
  });

  it('reads a none answer as an empty result', () => {
    expect(readRunResult({ kind: 'none' })).toEqual({ kind: 'result', result: null });
  });
});

describe('unreadableIssue', () => {
  it('names the first issue as path: message', () => {
    const error = new ApiSchemaError('/api/run-tool', [
      { code: 'invalid_type', path: ['result', 'asks', 0], message: 'Required' },
      { code: 'custom', path: ['other'], message: 'second' },
    ]);
    expect(unreadableIssue(error)).toBe('result.asks.0: Required');
  });

  it('names a root issue by its message alone', () => {
    const error = new ApiSchemaError('/api/run-tool', [
      { code: 'invalid_union', path: [], message: 'No matching discriminator' },
    ]);
    expect(unreadableIssue(error)).toBe('No matching discriminator');
  });

  it('carries a transport refusal text whole', () => {
    expect(
      unreadableIssue(new ApiSchemaError('/api/run-tool', 'response was not valid JSON')),
    ).toBe('response was not valid JSON');
  });
});
