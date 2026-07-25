/**
 * Unit tests for the shared fleet-report handler — the single interpreter every
 * mutation surface routes its broadcast through. These pin the honest states: a
 * converged broadcast is silent, a reachable-but-unconfirmed origin is `degraded`
 * with the stranded siblings named, and an unreachable bus is `unreachable`. A
 * `null` fan-out (no manifest change) yields nothing to report.
 */
import { describe, expect, it } from 'vitest';

import { isFleetReportFailure, summarizeFleetFanout, summarizeFleetResult } from './fleet-report';
import type { FleetResult } from './schemas';

function result(overrides: Partial<FleetResult>): FleetResult {
  return {
    op: 'reload_config',
    reachable: true,
    local_only: false,
    results: [],
    error: null,
    ...overrides,
  };
}

describe('summarizeFleetResult', () => {
  it('is converged when the bus was reached and every origin applied', () => {
    const summary = summarizeFleetResult(
      result({
        results: [
          { origin: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
          { origin: 'serve-b', outcome: 'applied', payload: null, error: null, detail: null },
        ],
      }),
    );
    expect(summary.status).toBe('converged');
    expect(summary.failures).toEqual([]);
    expect(isFleetReportFailure(summary)).toBe(false);
  });

  it('is degraded and names every non-applied origin with its message', () => {
    const summary = summarizeFleetResult(
      result({
        results: [
          { origin: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
          {
            origin: 'serve-b',
            outcome: 'failed',
            payload: null,
            error: 'reload raised',
            detail: null,
          },
          {
            origin: 'backend-c',
            outcome: 'timed_out',
            payload: null,
            error: null,
            detail: 'no ack in window',
          },
          { origin: 'serve-d', outcome: 'departed', payload: null, error: null, detail: null },
        ],
      }),
    );
    expect(summary.status).toBe('degraded');
    expect(summary.failures.map((failure) => failure.origin)).toEqual([
      'serve-b',
      'backend-c',
      'serve-d',
    ]);
    // `error` wins over `detail`; `detail` fills in when there is no error; neither ⇒ null.
    expect(summary.failures[0]?.message).toBe('reload raised');
    expect(summary.failures[1]?.message).toBe('no ack in window');
    expect(summary.failures[2]?.message).toBeNull();
    expect(isFleetReportFailure(summary)).toBe(true);
  });

  it('is unreachable when the bus itself could not be reached, carrying the error', () => {
    const summary = summarizeFleetResult(
      result({ reachable: false, results: [], error: 'RedisConnectionError: refused' }),
    );
    expect(summary.status).toBe('unreachable');
    expect(summary.error).toBe('RedisConnectionError: refused');
    expect(summary.failures).toEqual([]);
    expect(isFleetReportFailure(summary)).toBe(true);
  });
});

describe('summarizeFleetFanout', () => {
  it('returns null for an absent fan-out (no manifest change)', () => {
    expect(summarizeFleetFanout(null)).toBeNull();
    expect(summarizeFleetFanout(undefined)).toBeNull();
    expect(isFleetReportFailure(null)).toBe(false);
  });

  it('treats a local-only fan-out as converged, carrying its note', () => {
    const summary = summarizeFleetFanout({ mode: 'local-only', note: 'only this worker reloaded' });
    expect(summary?.status).toBe('converged');
    expect(summary?.note).toBe('only this worker reloaded');
  });

  it('defers a fleet fan-out to the per-origin report (degraded surfaces)', () => {
    const summary = summarizeFleetFanout({
      mode: 'fleet',
      op: 'reload_config',
      reachable: true,
      local_only: false,
      results: [
        { origin: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
        {
          origin: 'serve-b',
          outcome: 'missing',
          payload: null,
          error: null,
          detail: 'never joined',
        },
      ],
      error: null,
    });
    expect(summary?.status).toBe('degraded');
    expect(summary?.failures[0]?.outcome).toBe('missing');
  });

  it('defers an unreachable fan-out to the bus-unreachable state', () => {
    const summary = summarizeFleetFanout({
      mode: 'unreachable',
      op: 'reload_config',
      reachable: false,
      local_only: false,
      results: [],
      error: 'bus down',
    });
    expect(summary?.status).toBe('unreachable');
    expect(summary?.error).toBe('bus down');
  });
});
