/**
 * Unit tests for the shared fleet-report handler — the single interpreter every
 * mutation surface routes its broadcast through. These pin the honest states: a
 * converged broadcast is silent, a reachable-but-unconfirmed worker is `degraded`
 * with the stranded siblings named, and an unreachable bus is `unreachable`. A
 * `null` fan-out (no manifest change) yields nothing to report.
 */
import { describe, expect, it } from 'vitest';

import {
  failedMcpsFromReport,
  isFleetReportFailure,
  summarizeFleetFanout,
  summarizeFleetResult,
} from './fleet-report';
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
  it('is converged when the bus was reached and every worker applied', () => {
    const summary = summarizeFleetResult(
      result({
        results: [
          { name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
          { name: 'serve-b', outcome: 'applied', payload: null, error: null, detail: null },
        ],
      }),
    );
    expect(summary.status).toBe('converged');
    expect(summary.failures).toEqual([]);
    expect(isFleetReportFailure(summary)).toBe(false);
  });

  it('is degraded and names every non-applied worker with its message', () => {
    const summary = summarizeFleetResult(
      result({
        results: [
          { name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
          {
            name: 'serve-b',
            outcome: 'failed',
            payload: null,
            error: 'reload raised',
            detail: null,
          },
          {
            name: 'backend-c',
            outcome: 'timed_out',
            payload: null,
            error: null,
            detail: 'no ack in window',
          },
          { name: 'serve-d', outcome: 'departed', payload: null, error: null, detail: null },
        ],
      }),
    );
    expect(summary.status).toBe('degraded');
    expect(summary.failures.map((failure) => failure.name)).toEqual([
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

  it('names the per-worker gap outcomes (resyncing / recycling / stale) as degraded', () => {
    const summary = summarizeFleetResult(
      result({
        results: [
          { name: 'serve-1', outcome: 'applied', payload: null, error: null, detail: null },
          {
            name: 'serve-2',
            outcome: 'resyncing',
            payload: null,
            error: null,
            detail: 'mid-resync',
          },
          { name: 'backend-1', outcome: 'recycling', payload: null, error: null, detail: null },
          { name: 'serve-3', outcome: 'stale', payload: null, error: null, detail: null },
        ],
      }),
    );
    expect(summary.status).toBe('degraded');
    expect(summary.failures.map((failure) => failure.outcome)).toEqual([
      'resyncing',
      'recycling',
      'stale',
    ]);
    expect(summary.failures[0]?.message).toBe('mid-resync');
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

  it('defers a fleet fan-out to the per-worker report (degraded surfaces)', () => {
    const summary = summarizeFleetFanout({
      mode: 'fleet',
      op: 'reload_config',
      reachable: true,
      local_only: false,
      results: [
        { name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
        {
          name: 'serve-b',
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

describe('failedMcpsFromReport', () => {
  it('unions each worker payload roster by title and name-sorts the result', () => {
    const out = failedMcpsFromReport(
      result({
        op: 'list_failed_mcps',
        results: [
          {
            name: 'serve-a',
            outcome: 'applied',
            payload: [
              { title: 'weather', status: 'unavailable' },
              { title: 'db', status: 'unavailable' },
            ],
            error: null,
            detail: null,
          },
          {
            // A sibling that saw a DIFFERENT server fail contributes it too — a server
            // failed on ANY worker must reach the operator; the first-seen status wins.
            name: 'serve-b',
            outcome: 'applied',
            payload: [
              { title: 'db', status: 'error' },
              { title: 'files', status: 'unavailable' },
            ],
            error: null,
            detail: null,
          },
        ],
      }),
    );
    expect(out.map((entry) => entry.title)).toEqual(['db', 'files', 'weather']);
    expect(out.find((entry) => entry.title === 'db')?.status).toBe('unavailable');
  });

  it('tolerates an absent or malformed worker payload without throwing', () => {
    const out = failedMcpsFromReport(
      result({
        op: 'list_failed_mcps',
        results: [
          { name: 'serve-a', outcome: 'timed_out', payload: null, error: null, detail: 'no reply' },
          {
            name: 'serve-b',
            outcome: 'applied',
            // A non-string title and a bare string are both skipped, never coerced.
            payload: [{ title: 42 }, 'garbage', { title: 'ok', status: 'unavailable' }],
            error: null,
            detail: null,
          },
        ],
      }),
    );
    expect(out).toEqual([{ title: 'ok', status: 'unavailable' }]);
  });

  it('defaults a missing status to "unavailable" rather than dropping the row', () => {
    const out = failedMcpsFromReport(
      result({
        op: 'list_failed_mcps',
        results: [
          {
            name: 'serve-a',
            outcome: 'applied',
            payload: [{ title: 'weather' }],
            error: null,
            detail: null,
          },
        ],
      }),
    );
    expect(out).toEqual([{ title: 'weather', status: 'unavailable' }]);
  });
});
