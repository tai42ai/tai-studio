/** The failed-MCP roster read from a broadcast report's per-worker payloads. */
import { describe, expect, it } from 'vitest';

import { failedMcpsFromReport } from './failed-mcp-roster';
import type { FleetResult } from './schemas';

function result(overrides: Partial<FleetResult>): Omit<FleetResult, 'ok'> {
  return {
    op: 'reload_config',
    reachable: true,
    local_only: false,
    results: [],
    error: null,
    ...overrides,
  };
}

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

  it.each([
    ['the starting record first', ['serve-a', 'serve-b']],
    ['the failure record first', ['serve-b', 'serve-a']],
  ])(
    "lets one worker's failure win over another worker's start in progress (%s)",
    (_order, names) => {
      const payloads: Record<string, unknown[]> = {
        'serve-a': [
          {
            title: 'relay',
            status: 'unavailable',
            category: 'starting',
            message: 'still starting',
          },
        ],
        'serve-b': [
          {
            title: 'relay',
            status: 'unavailable',
            category: 'unreachable',
            message: 'connection refused',
            http_status: null,
          },
        ],
      };
      const out = failedMcpsFromReport(
        result({
          op: 'list_failed_mcps',
          results: names.map((name) => ({
            name,
            outcome: 'applied' as const,
            payload: payloads[name],
            error: null,
            detail: null,
          })),
        }),
      );
      expect(out).toEqual([
        {
          title: 'relay',
          status: 'unavailable',
          category: 'unreachable',
          message: 'connection refused',
          http_status: null,
        },
      ]);
    },
  );

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

  it('carries the credential-free failure detail through to the row when present', () => {
    const out = failedMcpsFromReport(
      result({
        op: 'list_failed_mcps',
        results: [
          {
            name: 'serve-a',
            outcome: 'applied',
            payload: [
              {
                title: 'weather',
                status: 'unavailable',
                category: 'auth',
                message: 'invalid token',
                http_status: 401,
              },
              // A pure transport failure carries a null http_status.
              {
                title: 'db',
                status: 'unavailable',
                category: 'unreachable',
                message: 'connection refused',
                http_status: null,
              },
            ],
            error: null,
            detail: null,
          },
        ],
      }),
    );
    const weather = out.find((entry) => entry.title === 'weather');
    expect(weather?.category).toBe('auth');
    expect(weather?.message).toBe('invalid token');
    expect(weather?.http_status).toBe(401);
    expect(out.find((entry) => entry.title === 'db')?.http_status).toBeNull();
  });

  it('omits the detail fields (never coerces them) when a payload entry lacks them', () => {
    const out = failedMcpsFromReport(
      result({
        op: 'list_failed_mcps',
        results: [
          {
            name: 'serve-a',
            outcome: 'applied',
            // A non-string category and a non-numeric http_status are dropped, not coerced.
            payload: [{ title: 'weather', status: 'unavailable', category: 9, http_status: 'x' }],
            error: null,
            detail: null,
          },
        ],
      }),
    );
    expect(out).toEqual([{ title: 'weather', status: 'unavailable' }]);
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
