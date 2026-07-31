import { describe, expect, it, vi } from 'vitest';

import { ApiError, ApiUnauthorizedError } from './errors';
import {
  agentList,
  agentSummary,
  parseAgentFrame,
  parseAgentTranscript,
  streamAgentRun,
  streamAuthoredAgentRun,
  type ParsedAgentEvent,
} from './agents';

// A hand-authored SSE transcript: one data-only frame per agent event, a
// keep-alive comment, and the terminal stream.end — the exact shape the run
// route emits.
const TRANSCRIPT =
  'data: {"type":"reasoning_step","text":"thinking"}\n\n' +
  'data: {"type":"tool_call_step","tool":"search","args":{"q":"x"},"call_id":"c1"}\n\n' +
  'data: {"type":"tool_result_step","tool":"search","call_id":"c1","result":"non-json:blob"}\n\n' +
  ': keepalive\n\n' +
  'data: {"type":"message_delta","text":"hel"}\n\n' +
  'data: {"type":"message_delta","text":"lo"}\n\n' +
  'data: {"type":"run_usage","input_tokens":3,"output_tokens":1,"total_tokens":4,"model":"m"}\n\n' +
  'data: {"type":"message_final","text":"hello"}\n\n' +
  'data: {"type":"stream.end"}\n\n';

function knownTypes(events: ParsedAgentEvent[]): string[] {
  return events.map((parsed) =>
    parsed.known ? parsed.event.type : `unknown:${parsed.unknown.type}`,
  );
}

describe('agentList schema', () => {
  it('parses the list payload and defaults optional fields', () => {
    const parsed = agentList.parse({
      items: [{ name: 'a', tool_name: 'a', input_schema: { type: 'object' } }],
      total: 1,
    });
    expect(parsed.items[0]?.description).toBe('');
    expect(parsed.items[0]?.input_schema).toEqual({ type: 'object' });
    // Absent `spec_runnable` defaults to false — an agent is not authorable unless
    // it explicitly declares the capability.
    expect(parsed.items[0]?.spec_runnable).toBe(false);
  });

  it('carries the authorability marker verbatim (never inferred)', () => {
    const authorable = agentSummary.parse({
      name: 'authorable_agent',
      description: 'A fake authorable agent.',
      tool_name: 'authorable_agent',
      input_schema: { type: 'object' },
      spec_runnable: true,
    });
    expect(authorable.spec_runnable).toBe(true);
    const role = agentSummary.parse({
      name: 'role_agent',
      tool_name: 'role_agent',
      spec_runnable: false,
    });
    expect(role.spec_runnable).toBe(false);
  });

  it('throws loudly on a drifted (non-boolean) spec_runnable', () => {
    expect(() => agentSummary.parse({ name: 'x', tool_name: 'x', spec_runnable: 'yes' })).toThrow();
  });
});

describe('parseAgentTranscript', () => {
  it('parses the full event sequence in order, keep-alive dropped', () => {
    const events = parseAgentTranscript(TRANSCRIPT);
    expect(knownTypes(events)).toEqual([
      'reasoning_step',
      'tool_call_step',
      'tool_result_step',
      'message_delta',
      'message_delta',
      'run_usage',
      'message_final',
      'stream.end',
    ]);
  });

  it('passes a tool result through untouched (the fallback=str server payload)', () => {
    const events = parseAgentTranscript(TRANSCRIPT);
    const result = events[2];
    expect(result?.known).toBe(true);
    if (result?.known && result.event.type === 'tool_result_step') {
      expect(result.event.result).toBe('non-json:blob');
    }
  });
});

describe('parseAgentFrame', () => {
  it('surfaces an unknown event type as a visible fallback, never dropped', () => {
    const parsed = parseAgentFrame({ event: 'message', data: '{"type":"future_event","x":1}' });
    expect(parsed.known).toBe(false);
    if (!parsed.known) {
      expect(parsed.unknown.type).toBe('future_event');
      expect(parsed.unknown.raw).toEqual({ type: 'future_event', x: 1 });
    }
  });

  it('surfaces unparseable JSON as a fallback rather than throwing', () => {
    const parsed = parseAgentFrame({ event: 'message', data: 'not json' });
    expect(parsed.known).toBe(false);
    if (!parsed.known) expect(parsed.unknown.type).toBe('(unparseable)');
  });

  it('parses a stream.error frame as a known terminal', () => {
    const parsed = parseAgentFrame({
      event: 'message',
      data: '{"type":"stream.error","message":"boom"}',
    });
    expect(parsed.known).toBe(true);
    if (parsed.known && parsed.event.type === 'stream.error') {
      expect(parsed.event.message).toBe('boom');
    }
  });
});

describe('streamAgentRun', () => {
  const config = { getToken: () => 'key', baseUrl: '' };

  it('POSTs the input with the auth header and yields parsed events', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(TRANSCRIPT, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      );
    const gen = await streamAgentRun({ ...config, fetch: fetchMock }, 'faker', { prompt: 'hi' });
    const events: ParsedAgentEvent[] = [];
    for await (const event of gen) events.push(event);

    expect(knownTypes(events).at(-1)).toBe('stream.end');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^\/api\/agents\/faker\/runs\?_=/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('key');
    expect(init.body).toBe(JSON.stringify({ prompt: 'hi' }));
  });

  it('gives every open a DISTINCT url so concurrent runs are never coalesced', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(TRANSCRIPT, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    // Two concurrent views of the same agent run must not share a URL: engines
    // coalesce identical concurrent fetches onto one endless SSE connection.
    await Promise.all([
      streamAgentRun({ ...config, fetch: fetchMock as unknown as typeof fetch }, 'faker', {}),
      streamAgentRun({ ...config, fetch: fetchMock as unknown as typeof fetch }, 'faker', {}),
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).not.toBe(urls[1]);
    for (const url of urls) expect(url).toMatch(/^\/api\/agents\/faker\/runs\?/);
  });

  it('throws ApiUnauthorizedError on a 401 open', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(
      streamAgentRun({ ...config, fetch: fetchMock }, 'faker', {}),
    ).rejects.toBeInstanceOf(ApiUnauthorizedError);
  });

  it('throws ApiError on a non-ok open instead of a silently-empty stream', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 404, statusText: 'Not Found' }));
    await expect(
      streamAgentRun({ ...config, fetch: fetchMock }, 'ghost', {}),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('surfaces the server {"error"} message verbatim on the shared opener', async () => {
    // The plain and authored doors share `openAgentStream`, which reads the error
    // body — so a 404 with a real message is not collapsed to statusText.
    const message = "agent 'ghost' is not registered";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: message }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(streamAgentRun({ ...config, fetch: fetchMock }, 'ghost', {})).rejects.toThrow(
      message,
    );
  });
});

describe('streamAuthoredAgentRun', () => {
  const config = { getToken: () => 'key', baseUrl: '' };

  it('POSTs the non-baked input to the authored-run path and yields parsed events', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(TRANSCRIPT, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      );
    const gen = await streamAuthoredAgentRun({ ...config, fetch: fetchMock }, 'support_bot', {
      user_message: 'my order is late',
    });
    const events: ParsedAgentEvent[] = [];
    for await (const event of gen) events.push(event);

    expect(knownTypes(events).at(-1)).toBe('stream.end');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^\/api\/agents\/authored\/support_bot\/runs\?_=/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('key');
    expect(init.body).toBe(JSON.stringify({ user_message: 'my order is late' }));
  });

  it('gives every open a DISTINCT url so concurrent runs are never coalesced', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(TRANSCRIPT, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    await Promise.all([
      streamAuthoredAgentRun(
        { ...config, fetch: fetchMock as unknown as typeof fetch },
        'support_bot',
        {},
      ),
      streamAuthoredAgentRun(
        { ...config, fetch: fetchMock as unknown as typeof fetch },
        'support_bot',
        {},
      ),
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).not.toBe(urls[1]);
    for (const url of urls) expect(url).toMatch(/^\/api\/agents\/authored\/support_bot\/runs\?/);
  });

  it('surfaces the baked-field override 400 message verbatim (not the bare status text)', async () => {
    // The load-bearing authoring 400 — it must reach the UI intact rather than
    // collapse to "Bad Request".
    const message =
      "cannot override the fixed field 'system_prompt' baked into this authored agent";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: message }), {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      streamAuthoredAgentRun({ ...config, fetch: fetchMock }, 'support_bot', {
        system_prompt: 'override',
      }),
    ).rejects.toThrow(message);
  });

  it('falls back to the status text when the error body is not a JSON envelope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 400, statusText: 'Bad Request' }));
    await expect(
      streamAuthoredAgentRun({ ...config, fetch: fetchMock }, 'support_bot', {}),
    ).rejects.toThrow('Bad Request');
  });
});

describe('agent stream cancellation (AbortSignal)', () => {
  const config = { getToken: () => 'key', baseUrl: '' };

  // One frame is buffered, then the body stays open (the pull never settles) so the
  // only way the iterator ends is the SSE loop's abort guard.
  function openStreamResponse(): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"message_delta","text":"hi"}\n\n'));
        },
        pull() {
          return new Promise<void>(() => {
            /* never settles; only the caller's abort ends the stream */
          });
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
  }

  it('terminates streamAgentRun with an AbortError when the signal aborts mid-stream', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(openStreamResponse());
    const gen = await streamAgentRun(
      { ...config, fetch: fetchMock },
      'faker',
      {},
      controller.signal,
    );
    const iter = gen[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.done).toBe(false);
    controller.abort();
    // A cancelled run must raise a typed AbortError, never end silently.
    await expect(iter.next()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('terminates streamAuthoredAgentRun with an AbortError when the signal aborts mid-stream', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(openStreamResponse());
    const gen = await streamAuthoredAgentRun(
      { ...config, fetch: fetchMock },
      'support_bot',
      {},
      controller.signal,
    );
    const iter = gen[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.done).toBe(false);
    controller.abort();
    await expect(iter.next()).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('agent run path-segment guard', () => {
  const config = { getToken: () => 'key', baseUrl: '' };

  // A `.`/`..`/absolute/empty agent name would be collapsed by the browser URL
  // parser and silently retarget the run POST at a different route, so the name is
  // rejected at the client boundary before the stream is ever opened (fetch is
  // never called).
  it('rejects an unsafe agent name before opening the stream', async () => {
    const fetchMock = vi.fn();
    const rule = /path segment must not be/;
    for (const name of ['..', '.', '']) {
      await expect(streamAgentRun({ ...config, fetch: fetchMock }, name, {})).rejects.toThrow(rule);
      await expect(
        streamAuthoredAgentRun({ ...config, fetch: fetchMock }, name, {}),
      ).rejects.toThrow(rule);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
