/**
 * The recycle roll a failed reply carries, read from the body the transport keeps: the
 * operator-facing body has the fleet report, the masked one does not, and a roll that does not
 * match its schema fails as a schema failure.
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApiClient } from './client';
import { ApiConflictError, ApiError, ApiSchemaError } from './errors';
import { failedReplyRoll } from './failed-reply-roll';
import { type ApiConfig, apiRequest } from './http';

function config(status: number, body: unknown): ApiConfig {
  const reply = new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  return { getToken: () => 'k', fetch: vi.fn(async () => reply) };
}

async function rejectionOf(status: number, body: unknown): Promise<unknown> {
  return apiRequest(config(status, body), '/api/mcp/config', z.unknown()).then(
    () => {
      throw new Error('the request did not reject');
    },
    (error: unknown) => error,
  );
}

const rollFields = {
  recycle: {
    recycle: [
      {
        name: 'serve-b',
        kind: 'serve',
        status: 'withheld',
        generation_before: 2,
        keys: ['TAI_KEY'],
        detail: null,
      },
    ],
    skipped: [],
    fresh: [],
    recycle_stopped: null,
  },
  awaiting_respawn: [
    { name: 'serve-a', keys: ['TAI_KEY'] },
    { name: 'serve-b', keys: ['TAI_KEY'] },
    { name: 'serve-c', keys: ['TAI_OTHER'] },
  ],
  roll_deferred: false,
  roll_deferred_to: null,
};

const report = {
  ok: false,
  op: 'reload_config',
  reachable: true,
  error: null,
  results: [
    {
      name: 'serve-a',
      outcome: 'failed',
      error: 'build refused',
      payload: { status: 'discarded' },
    },
    { name: 'serve-b', outcome: 'applied' },
  ],
};

describe('failedReplyRoll', () => {
  it('reads the operator-facing body: its report states the discarded build', async () => {
    const error = await rejectionOf(500, {
      error: 'build refused',
      report,
      ...rollFields,
    });
    expect(error).toBeInstanceOf(ApiError);

    const roll = failedReplyRoll(error);

    expect(roll?.recycle?.recycle.map((line) => line.name)).toEqual(['serve-b']);
    expect(roll?.summary?.status).toBe('degraded');
    expect(roll?.summary?.failures).toEqual([
      { name: 'serve-a', outcome: 'failed', message: 'build refused', withheld: true },
    ]);
    expect(roll?.summary?.awaiting).toEqual([
      { name: 'serve-a', keys: ['TAI_KEY'], reading: 'withheld' },
      { name: 'serve-b', keys: ['TAI_KEY'], reading: 'withheld' },
      { name: 'serve-c', keys: ['TAI_OTHER'], reading: 'unstated' },
    ]);
  });

  it('does not list a worker the roll recycled after its reload timed out', async () => {
    const error = await rejectionOf(500, {
      error: 'build refused',
      report: {
        ...report,
        results: [{ name: 'serve-b', outcome: 'timed_out', detail: 'no reply in time' }],
      },
      recycle: {
        recycle: [
          {
            name: 'serve-b',
            kind: 'serve',
            status: 'recycled',
            generation_before: 2,
            keys: ['TAI_KEY'],
            detail: null,
          },
        ],
        skipped: [],
        fresh: [{ name: 'serve-b', kind: 'serve', generation: 3 }],
        recycle_stopped: null,
      },
      awaiting_respawn: [],
      roll_deferred: false,
      roll_deferred_to: null,
    });

    expect(failedReplyRoll(error)?.summary?.failures).toEqual([]);
  });

  it('reads an unreachable bus from the report the operator-facing body carries', async () => {
    const error = await rejectionOf(500, {
      error: 'build refused',
      report: { ...report, reachable: false, results: [], error: 'bus down' },
      ...rollFields,
    });

    const summary = failedReplyRoll(error)?.summary;

    expect(summary?.status).toBe('unreachable');
    expect(summary?.error).toBe('bus down');
  });

  it('reads the masked body: no report and no line for the worker, so it is unstated', async () => {
    const error = await rejectionOf(500, {
      error: 'Internal Server Error',
      error_id: 'err-1',
      recycle: null,
      awaiting_respawn: [{ name: 'serve-a', keys: ['TAI_KEY'] }],
      roll_deferred: false,
      roll_deferred_to: null,
    });

    expect(failedReplyRoll(error)).toEqual({
      recycle: null,
      summary: {
        status: 'converged',
        note: null,
        failures: [],
        error: null,
        awaiting: [{ name: 'serve-a', keys: ['TAI_KEY'], reading: 'unstated' }],
        restartsPending: [],
        reloadsUnconfirmed: [],
        spanReleaseError: null,
      },
    });
  });

  it('reads a marketplace failure that answers 409 from its conflict error', async () => {
    const error = await rejectionOf(409, { error: 'the plugin changed', ...rollFields });
    expect(error).toBeInstanceOf(ApiConflictError);

    expect(failedReplyRoll(error)?.recycle?.recycle.map((line) => line.name)).toEqual(['serve-b']);
  });

  it('answers no roll for a failed reply with no roll fields', async () => {
    expect(failedReplyRoll(await rejectionOf(500, { error: 'boom', error_id: 'e' }))).toBeNull();
    expect(failedReplyRoll(await rejectionOf(500, { error: 'boom', report }))).toBeNull();
    expect(failedReplyRoll(await rejectionOf(409, { error: 'held', holders: [] }))).toBeNull();
  });

  it('answers no roll for an error that holds no reply body', () => {
    expect(failedReplyRoll(new ApiError('boom', 500))).toBeNull();
    expect(failedReplyRoll(new Error('boom'))).toBeNull();
    expect(failedReplyRoll('boom')).toBeNull();
  });

  it('is the reader the client exposes', async () => {
    const client = createApiClient({ getToken: () => null });
    const error = await rejectionOf(500, { error: 'boom', ...rollFields });

    expect(client.failedReplyRoll(error)).toEqual(failedReplyRoll(error));
  });
});

describe('a failed reply whose roll does not match its schema', () => {
  it.each([
    ['a 500', 500],
    ['a 409', 409],
  ])('rejects %s as a schema failure, naming the endpoint', async (_label, status) => {
    const error = await rejectionOf(status, { error: 'boom', ...rollFields, recycle: 'none' });

    expect(error).toBeInstanceOf(ApiSchemaError);
    expect((error as ApiSchemaError).message).toBe(
      'response from /api/mcp/config did not match its expected schema',
    );
  });

  it('rejects a roll whose report does not match its schema', async () => {
    const error = await rejectionOf(500, {
      error: 'boom',
      ...rollFields,
      report: { reachable: 'yes' },
    });

    expect(error).toBeInstanceOf(ApiSchemaError);
  });

  it('throws when read from a body the transport did not check', () => {
    const error = new ApiError('boom', 500, undefined, undefined, { recycle: 'none' });

    expect(() => failedReplyRoll(error)).toThrow();
  });
});
