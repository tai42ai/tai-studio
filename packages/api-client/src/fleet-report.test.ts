/**
 * Unit tests for the shared fleet-report handler — the single interpreter every
 * mutation surface routes its broadcast through. These pin the honest states: a
 * converged broadcast is silent, a reachable-but-unconfirmed worker is `degraded`
 * with the stranded siblings named, and an unreachable bus is `unreachable`. A
 * `null` fan-out (no manifest change) yields nothing to report.
 */
import { describe, expect, it } from 'vitest';

import {
  isFleetReportFailure,
  summarizeFleetFanout,
  summarizeFleetReload,
  summarizeFleetResult,
} from './fleet-report';
import type { FleetReloadResult, FleetResult, RecycleRoll } from './schemas';

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
    expect(summarizeFleetFanout({ fanout: null, span_release_error: null })).toBeNull();
    expect(summarizeFleetFanout({ fanout: undefined, span_release_error: null })).toBeNull();
    expect(isFleetReportFailure(null)).toBe(false);
  });

  it('treats an unreleased write span as a failure on a converged fan-out', () => {
    const summary = summarizeFleetFanout({
      fanout: { mode: 'local-only', note: 'only this worker reloaded' },
      span_release_error: 'OSError: releasing the span failed',
    });
    expect(summary?.status).toBe('converged');
    expect(summary?.spanReleaseError).toBe('OSError: releasing the span failed');
    expect(isFleetReportFailure(summary)).toBe(true);
  });

  it('reports an unreleased write span when the response mutated no manifest', () => {
    const summary = summarizeFleetFanout({
      fanout: null,
      span_release_error: 'OSError: releasing the span failed',
    });
    expect(summary).toEqual({
      status: 'converged',
      note: null,
      failures: [],
      error: null,
      awaiting: [],
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: 'OSError: releasing the span failed',
    });
    expect(isFleetReportFailure(summary)).toBe(true);
  });

  it('carries an unreleased write span beside a fleet fan-out', () => {
    const summary = summarizeFleetFanout({
      fanout: {
        mode: 'fleet',
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [
          { name: 'serve-1', outcome: 'applied', payload: null, error: null, detail: null },
        ],
        error: null,
      },
      span_release_error: 'a; b',
    });
    expect(summary?.spanReleaseError).toBe('a; b');
    expect(isFleetReportFailure(summary)).toBe(true);
  });

  it('a converged fan-out with a released span is not a failure', () => {
    const summary = summarizeFleetFanout({
      fanout: { mode: 'local-only', note: 'n' },
      span_release_error: null,
    });
    expect(summary?.spanReleaseError).toBeNull();
    expect(isFleetReportFailure(summary)).toBe(false);
  });

  it('treats a local-only fan-out as converged, carrying its note', () => {
    const summary = summarizeFleetFanout({
      fanout: { mode: 'local-only', note: 'only this worker reloaded' },
      span_release_error: null,
    });
    expect(summary?.status).toBe('converged');
    expect(summary?.note).toBe('only this worker reloaded');
  });

  it('defers a fleet fan-out to the per-worker report (degraded surfaces)', () => {
    const summary = summarizeFleetFanout({
      fanout: {
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
      },
      span_release_error: null,
    });
    expect(summary?.status).toBe('degraded');
    expect(summary?.failures[0]?.outcome).toBe('missing');
  });

  it('defers an unreachable fan-out to the bus-unreachable state', () => {
    const summary = summarizeFleetFanout({
      fanout: {
        mode: 'unreachable',
        op: 'reload_config',
        reachable: false,
        local_only: false,
        results: [],
        error: 'bus down',
      },
      span_release_error: null,
    });
    expect(summary?.status).toBe('unreachable');
    expect(summary?.error).toBe('bus down');
  });
});

describe('the workers awaiting a respawn', () => {
  const movedPayload = { status: 'ok', env_keys: 3, awaiting_respawn: ['BACKEND_MANIFEST_KEY'] };

  function reloadReply(
    awaiting: FleetReloadResult['awaiting_respawn'],
  ): Omit<FleetReloadResult, 'ok'> {
    return {
      ...result({
        results: [
          { name: 'serve-a', outcome: 'applied', payload: movedPayload, error: null, detail: null },
          {
            name: 'backend-a',
            outcome: 'applied',
            payload: movedPayload,
            error: null,
            detail: null,
          },
        ],
      }),
      awaiting_respawn: awaiting,
      recycle: {
        recycle: [
          {
            name: 'backend-a',
            kind: 'backend',
            status: 'recycled',
            generation_before: 1,
            keys: ['BACKEND_MANIFEST_KEY'],
            detail: null,
          },
        ],
        skipped: [],
        fresh: [{ name: 'backend-a', kind: 'backend', generation: 2 }],
        recycle_stopped: null,
      },
      roll_deferred: false,
      roll_deferred_to: null,
    };
  }

  it('lists the fleet reload operation verdict, never the workers its roll restarted', () => {
    const summary = summarizeFleetReload(
      reloadReply([{ name: 'serve-a', keys: ['BACKEND_MANIFEST_KEY'] }]),
    );
    expect(summary.status).toBe('converged');
    expect(summary.awaiting).toEqual([
      { name: 'serve-a', keys: ['BACKEND_MANIFEST_KEY'], reading: 'restartable' },
    ]);
  });

  it('lists nobody when the fleet reload roll restarted every worker that needed it', () => {
    expect(summarizeFleetReload(reloadReply([])).awaiting).toEqual([]);
  });

  it('names nobody for a bare fleet report, which states no verdict', () => {
    const summary = summarizeFleetResult(
      result({
        results: [
          { name: 'serve-a', outcome: 'applied', payload: movedPayload, error: null, detail: null },
        ],
      }),
    );
    expect(summary.awaiting).toEqual([]);
  });

  it('names nothing for a lone-worker or an unreachable broadcast', () => {
    expect(
      summarizeFleetFanout({
        fanout: { mode: 'local-only', note: 'only this worker reloaded' },
        span_release_error: null,
      })?.awaiting,
    ).toEqual([]);
    expect(summarizeFleetResult(result({ reachable: false, error: 'down' })).awaiting).toEqual([]);
  });
});

describe('the workers whose restart the operation withholds', () => {
  const discardedRow = {
    name: 'serve-b',
    outcome: 'failed' as const,
    payload: { status: 'discarded', awaiting_respawn: ['BACKEND_MANIFEST_KEY'] },
    error: 'the stored config did not build',
    detail: null,
  };
  const failedRow = {
    name: 'serve-c',
    outcome: 'failed' as const,
    payload: null,
    error: 'reload raised',
    detail: null,
  };
  const withheldLine = {
    name: 'backend-b',
    kind: 'backend',
    status: 'withheld',
    generation_before: 3,
    keys: ['BACKEND_MANIFEST_KEY'],
    detail: 'its reload reported failed; asked once ready: refused build',
  };
  const verdict = [
    { name: 'serve-b', keys: ['BACKEND_MANIFEST_KEY'] },
    { name: 'serve-c', keys: ['BACKEND_MANIFEST_KEY'] },
    { name: 'backend-b', keys: ['BACKEND_MANIFEST_KEY'] },
  ];

  it('marks a worker whose broadcast row states a discarded build, or whose roll line is withheld', () => {
    const summary = summarizeFleetFanout({
      fanout: {
        mode: 'fleet',
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [discardedRow, failedRow],
        error: null,
      },
      awaiting_respawn: verdict,
      recycle: { recycle: [withheldLine], skipped: [] },
      span_release_error: null,
    });
    expect(summary?.awaiting).toEqual([
      { name: 'serve-b', keys: ['BACKEND_MANIFEST_KEY'], reading: 'withheld' },
      { name: 'serve-c', keys: ['BACKEND_MANIFEST_KEY'], reading: 'restartable' },
      { name: 'backend-b', keys: ['BACKEND_MANIFEST_KEY'], reading: 'withheld' },
    ]);
  });

  it('marks a withheld roll line on a lone-worker save, which carries no rows', () => {
    const summary = summarizeFleetFanout({
      fanout: { mode: 'local-only', note: 'lone worker' },
      awaiting_respawn: [{ name: 'backend-b', keys: ['BACKEND_MANIFEST_KEY'] }],
      recycle: { recycle: [withheldLine], skipped: [] },
      span_release_error: null,
    });
    expect(summary?.awaiting).toEqual([
      { name: 'backend-b', keys: ['BACKEND_MANIFEST_KEY'], reading: 'withheld' },
    ]);
  });

  it('marks the fleet reload verdict from its own rows and roll', () => {
    const summary = summarizeFleetReload({
      ...result({ results: [discardedRow, failedRow] }),
      awaiting_respawn: verdict,
      recycle: { recycle: [withheldLine], skipped: [], fresh: [], recycle_stopped: null },
      roll_deferred: false,
      roll_deferred_to: null,
    });
    expect(summary.awaiting.map((worker) => [worker.name, worker.reading])).toEqual([
      ['serve-b', 'withheld'],
      ['serve-c', 'restartable'],
      ['backend-b', 'withheld'],
    ]);
  });

  it('reads a worker a roll line names without refusing as restartable', () => {
    const summary = summarizeFleetFanout({
      awaiting_respawn: [{ name: 'serve-2', keys: ['K'] }],
      recycle: {
        recycle: [
          {
            name: 'serve-2',
            kind: 'serve',
            status: 'timed-out',
            generation_before: 1,
            keys: ['K'],
            detail: 'old life still present',
          },
        ],
        skipped: [],
      },
      span_release_error: null,
    });
    expect(summary?.awaiting).toEqual([{ name: 'serve-2', keys: ['K'], reading: 'restartable' }]);
  });

  it('reads a worker as unstated when the reply carries neither its row nor its line', () => {
    const upgradeAll = {
      results: [],
      recycle: null,
      awaiting_respawn: [{ name: 'backend-1', keys: ['K'] }],
      span_release_error: null,
    };
    expect(summarizeFleetFanout(upgradeAll)?.awaiting).toEqual([
      { name: 'backend-1', keys: ['K'], reading: 'unstated' },
    ]);
  });

  it('places each worker of one reply by its own statement', () => {
    const summary = summarizeFleetFanout({
      awaiting_respawn: [
        { name: 'backend-a', keys: ['K'] },
        { name: 'backend-b', keys: ['K'] },
      ],
      recycle: { recycle: [withheldLine], skipped: [] },
      span_release_error: null,
    });
    expect(summary?.awaiting.map((worker) => [worker.name, worker.reading])).toEqual([
      ['backend-a', 'unstated'],
      ['backend-b', 'withheld'],
    ]);
  });
});

describe('a mutation summary carries the operation verdict', () => {
  const rowsListing = {
    mode: 'fleet' as const,
    op: 'reload_config',
    reachable: true,
    local_only: false,
    results: [
      {
        name: 'backend-1',
        outcome: 'applied' as const,
        payload: { status: 'ok', env_keys: 3, awaiting_respawn: ['BACKEND_MANIFEST_KEY'] },
        error: null,
        detail: null,
      },
    ],
    error: null,
  };

  it('takes awaiting from the response verdict, never from the rows', () => {
    expect(
      summarizeFleetFanout({ fanout: rowsListing, span_release_error: null })?.awaiting,
    ).toEqual([]);
    expect(
      summarizeFleetFanout({
        fanout: rowsListing,
        awaiting_respawn: [{ name: 'serve-2', keys: ['BACKEND_MANIFEST_KEY'] }],
        span_release_error: null,
      })?.awaiting,
    ).toEqual([{ name: 'serve-2', keys: ['BACKEND_MANIFEST_KEY'], reading: 'unstated' }]);
  });

  it('carries the verdict on a lone-worker save too', () => {
    expect(
      summarizeFleetFanout({
        fanout: { mode: 'local-only', note: 'lone worker' },
        awaiting_respawn: [{ name: 'serve-1', keys: ['K'] }],
        span_release_error: null,
      })?.awaiting,
    ).toEqual([{ name: 'serve-1', keys: ['K'], reading: 'unstated' }]);
  });
});

describe("summarizeFleetFanout reads the reply's own slice", () => {
  it('reports the workers a reply with no fan-out names as awaiting a respawn', () => {
    const summary = summarizeFleetFanout({
      awaiting_respawn: [{ name: 'serve-2', keys: ['K'] }],
      span_release_error: null,
    });
    expect(summary?.status).toBe('converged');
    expect(summary?.awaiting).toEqual([{ name: 'serve-2', keys: ['K'], reading: 'unstated' }]);
  });

  it('marks a failure withheld only for a worker refused at its epoch build', () => {
    const summary = summarizeFleetFanout({
      fanout: {
        mode: 'fleet',
        op: 'reload_config',
        reachable: true,
        local_only: false,
        error: null,
        results: [
          {
            name: 'backend-a',
            outcome: 'failed',
            payload: { status: 'discarded', awaiting_respawn: ['K'] },
            error: 'epoch build refused',
            detail: null,
          },
          { name: 'serve-1', outcome: 'timed_out', payload: null, error: null, detail: null },
        ],
      },
      span_release_error: null,
    });
    expect(summary?.failures.map(({ name, withheld: held }) => [name, held])).toEqual([
      ['backend-a', true],
      ['serve-1', false],
    ]);
  });
});

describe('a worker the recycle roll settled', () => {
  const row = (
    name: string,
    outcome: FleetResult['results'][number]['outcome'],
    payload: unknown = null,
  ): FleetResult['results'][number] => ({
    name,
    outcome,
    payload,
    error: null,
    detail: 'no reply in time',
  });
  const line = (name: string, status: string): RecycleRoll['recycle'][number] => ({
    name,
    kind: 'backend',
    status,
    generation_before: 3,
    keys: ['K'],
    detail: null,
  });
  const roll = (lines: RecycleRoll['recycle'], skipped: string[] = []): RecycleRoll => ({
    recycle: lines,
    skipped,
    fresh: [],
    recycle_stopped: null,
  });
  const withRoll = (recycle: RecycleRoll, results: FleetResult['results']) => ({
    fanout: { ...result({ results }), mode: 'fleet' as const },
    awaiting_respawn: [],
    recycle,
    span_release_error: null,
  });
  const reload = (recycle: RecycleRoll, results: FleetResult['results']) => ({
    ...result({ results }),
    awaiting_respawn: [],
    recycle,
    roll_deferred: false,
    roll_deferred_to: null,
  });

  it.each<[string, RecycleRoll, readonly string[], readonly string[]]>([
    ['recycled to a new life', roll([line('backend-1', 'recycled')]), [], []],
    [
      'whose restart is deferred',
      roll([line('backend-1', 'self-deferred')]),
      ['backend-1'],
      ['backend-1'],
    ],
    ['the roll confirmed clean', roll([], ['backend-1']), [], ['backend-1']],
  ])('does not list a worker %s as a failure', (_case, recycle, restarts, reloads) => {
    const rows = [row('backend-1', 'timed_out')];
    for (const summary of [
      summarizeFleetFanout(withRoll(recycle, rows)),
      summarizeFleetReload(reload(recycle, rows)),
    ]) {
      expect(summary?.failures).toEqual([]);
      expect(summary?.status).toBe('converged');
      expect(summary?.restartsPending).toEqual(restarts);
      expect(summary?.reloadsUnconfirmed).toEqual(reloads);
    }
  });

  it.each<[string, RecycleRoll]>([
    ['withheld', roll([line('backend-1', 'withheld')])],
    ['timed out', roll([line('backend-1', 'timed-out')])],
    ['failed', roll([line('backend-1', 'failed')])],
    ['without a line', roll([])],
    ['named by another worker only', roll([line('backend-2', 'recycled')], ['backend-3'])],
  ])('keeps a worker with a row and a roll line %s listed', (_case, recycle) => {
    const rows = [row('backend-1', 'timed_out')];
    for (const summary of [
      summarizeFleetFanout(withRoll(recycle, rows)),
      summarizeFleetReload(reload(recycle, rows)),
    ]) {
      expect(summary?.failures.map((failure) => failure.name)).toEqual(['backend-1']);
      expect(summary?.status).toBe('degraded');
      expect(summary?.restartsPending).toEqual([]);
      expect(summary?.reloadsUnconfirmed).toEqual([]);
    }
  });

  it('keeps a discarded build listed: the roll skips it on that same row, no later statement', () => {
    const summary = summarizeFleetReload(
      reload(roll([], ['backend-1']), [row('backend-1', 'failed', { status: 'discarded' })]),
    );
    expect(summary.status).toBe('degraded');
    expect(summary.failures).toEqual([
      { name: 'backend-1', outcome: 'failed', message: 'no reply in time', withheld: true },
    ]);
    expect(summary.reloadsUnconfirmed).toEqual([]);
  });

  it('lists only the worker the roll did not settle', () => {
    const summary = summarizeFleetReload(
      reload(roll([line('backend-1', 'recycled'), line('backend-2', 'timed-out')]), [
        row('backend-1', 'timed_out'),
        row('backend-2', 'timed_out'),
      ]),
    );
    expect(summary.failures.map((failure) => failure.name)).toEqual(['backend-2']);
  });

  it('names a deferred restart whose reload row applied, leaving its reload confirmed', () => {
    const summary = summarizeFleetReload(
      reload(roll([line('backend-1', 'self-deferred')]), [row('backend-1', 'applied')]),
    );
    expect(summary.restartsPending).toEqual(['backend-1']);
    expect(summary.reloadsUnconfirmed).toEqual([]);
  });

  it('leaves a lone-worker reply with no rows free of unconfirmed reloads', () => {
    const summary = summarizeFleetFanout({
      fanout: { mode: 'local-only', note: 'lone worker' },
      recycle: roll([line('backend-1', 'self-deferred')], ['backend-2']),
      span_release_error: null,
    });
    expect(summary?.restartsPending).toEqual(['backend-1']);
    expect(summary?.reloadsUnconfirmed).toEqual([]);
  });

  it('leaves a bare report, which carries no roll, with its failures', () => {
    const summary = summarizeFleetResult(result({ results: [row('backend-1', 'timed_out')] }));
    expect(summary.status).toBe('degraded');
    expect(summary.restartsPending).toEqual([]);
    expect(summary.reloadsUnconfirmed).toEqual([]);
  });
});
