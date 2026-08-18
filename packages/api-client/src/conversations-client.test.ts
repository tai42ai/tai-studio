/**
 * Transport-level tests for the conversation-monitor read methods: URL/method
 * building (including the `thread_id` carried as a QUERY value, encoded once),
 * the paging + order query string, the `{ data }` envelope unwrap, the
 * admin-vs-caller record projections, and a LOUD `ApiSchemaError` on a drifting
 * response. A fake `fetch` records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiSchemaError, type ApiConfig } from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface Captured {
  url: string;
  method: string;
  body: unknown;
}

function urlString(url: RequestInfo | URL): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

function harness(responder: () => Response) {
  const captured: Captured[] = [];
  const fetchImpl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;
    captured.push({
      url: urlString(url),
      method: init?.method ?? 'GET',
      body: rawBody === undefined ? undefined : JSON.parse(rawBody),
    });
    return Promise.resolve(responder());
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

const route = {
  route_name: 'chat',
  door: 'channel',
  target_kind: 'agent',
  target_name: 'assistant',
  payload_expr: null,
  reply_expr: null,
  execution_key: 'svc-chat',
  channel: 'whatsapp',
  our_identity: '+15550000000',
  callback_url: null,
  execution_key_fingerprint: 'fp-1',
};

const thread = {
  thread_id: 'svc-chat/+15551234567',
  client_address: '+15551234567',
  last_activity_at: 1_800_000_000.5,
  message_count: 3,
  last_delivery_status: 'delivered',
};

/** The CALLER-scoped projection: the allow-listed fields and nothing more. */
const callerRecord = {
  message_id: 'm1',
  route_name: 'chat',
  door: 'channel',
  thread_id: 'svc-chat/+15551234567',
  client_address: '+15551234567',
  caller_principal: null,
  inbound_text: 'where is my request',
  answer_status: 'answered',
  answer: 'It completes tomorrow.',
  origin: 'client',
  delivery_status: 'delivered',
  created_at: 1_800_000_000,
  updated_at: 1_800_000_001,
};

/** The ADMIN projection: the whole record, delivery bookkeeping included. */
const adminRecord = {
  ...callerRecord,
  channel: 'whatsapp',
  our_identity: '+15550000000',
  provider_message_id: 'wamid.1',
  callback_url: null,
  error: null,
  outbound_message_ids: ['wamid.2'],
  attempts: 1,
};

describe('conversation routes transport', () => {
  it('listConversationRoutes() GETs /api/conversations and unwraps the rows', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { items: [route], total: 1 } }),
    );
    const out = await client.listConversationRoutes();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/conversations');
    expect(out.total).toBe(1);
    expect(out.items[0]?.route_name).toBe('chat');
    expect(out.items[0]?.door).toBe('channel');
  });

  it('accepts an api-door row (callback_url set, no channel identity)', async () => {
    const apiRow = {
      ...route,
      door: 'api',
      channel: null,
      our_identity: null,
      callback_url: 'https://sink.example/answers',
    };
    const { client } = harness(() => jsonResponse({ data: { items: [apiRow], total: 1 } }));
    const out = await client.listConversationRoutes();
    expect(out.items[0]?.callback_url).toBe('https://sink.example/answers');
    expect(out.items[0]?.channel).toBeNull();
  });

  it('throws ApiSchemaError LOUDLY on an unknown door value', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { items: [{ ...route, door: 'carrier-pigeon' }], total: 1 } }),
    );
    await expect(client.listConversationRoutes()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});

describe('conversation threads transport', () => {
  it('GETs the route threads door with the paging window', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          items: [thread],
          total: 1,
          page: 1,
          page_size: 25,
          next_page: null,
          truncated: false,
        },
      }),
    );
    const out = await client.listConversationThreads('chat', 1, 25);
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/conversations/chat/threads?page=1&pageSize=25');
    expect(out.items[0]?.thread_id).toBe('svc-chat/+15551234567');
    expect(out.next_page).toBeNull();
    expect(out.truncated).toBe(false);
  });

  it('carries the status + address filters as query params', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          items: [thread],
          total: 1,
          page: 1,
          page_size: 25,
          next_page: null,
          truncated: false,
        },
      }),
    );
    await client.listConversationThreads('chat', 1, 25, { status: 'failed', address: '+1555' });
    expect(captured[0]?.url).toBe(
      '/api/conversations/chat/threads?page=1&pageSize=25&status=failed&address=%2B1555',
    );
  });

  it('omits an unset filter (no empty query param)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { items: [], total: 0, page: 1, page_size: 25, next_page: null, truncated: false },
      }),
    );
    await client.listConversationThreads('chat', 1, 25, { address: 'ana' });
    expect(captured[0]?.url).toBe('/api/conversations/chat/threads?page=1&pageSize=25&address=ana');
  });

  it('surfaces the truncated flag when the door capped the listing', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          items: [thread],
          total: 1,
          page: 1,
          page_size: 25,
          next_page: null,
          truncated: true,
        },
      }),
    );
    expect((await client.listConversationThreads('chat', 1, 25)).truncated).toBe(true);
  });

  it('encodes a route name that is not URL-safe', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { items: [], total: 0, page: 1, page_size: 25, next_page: null, truncated: false },
      }),
    );
    await client.listConversationThreads('a b/c', 1, 25);
    expect(captured[0]?.url).toBe('/api/conversations/a%20b%2Fc/threads?page=1&pageSize=25');
  });

  it('carries next_page through for a long route', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          items: [thread],
          total: 90,
          page: 1,
          page_size: 25,
          next_page: 2,
          truncated: false,
        },
      }),
    );
    expect((await client.listConversationThreads('chat', 1, 25)).next_page).toBe(2);
  });

  it('throws ApiSchemaError LOUDLY on a drifting thread row (missing message_count)', async () => {
    const { message_count: _dropped, ...broken } = thread;
    const { client } = harness(() =>
      jsonResponse({
        data: {
          items: [broken],
          total: 1,
          page: 1,
          page_size: 25,
          next_page: null,
          truncated: false,
        },
      }),
    );
    await expect(client.listConversationThreads('chat', 1, 25)).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });

  it('throws ApiSchemaError LOUDLY when the truncated flag is absent (no silent default)', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: { items: [thread], total: 1, page: 1, page_size: 25, next_page: null },
      }),
    );
    await expect(client.listConversationThreads('chat', 1, 25)).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });
});

/** A transcript page body, echoing the order the door was asked for. */
function transcriptPage(
  items: unknown[],
  order: 'asc' | 'desc' = 'asc',
  nextPage: number | null = null,
) {
  return {
    data: {
      items,
      total: items.length,
      page: 1,
      page_size: 50,
      next_page: nextPage,
      truncated: false,
      order,
    },
  };
}

/** The default read the tests below make: page 1 of the live-tail direction. */
const transcriptQuery = {
  routeName: 'chat',
  threadId: 'svc-chat/+15551234567',
  page: 1,
  pageSize: 50,
  order: 'desc',
} as const;

describe('thread transcript transport', () => {
  it('GETs the transcript door with the thread id as a QUERY value', async () => {
    const { client, captured } = harness(() => jsonResponse(transcriptPage([adminRecord], 'desc')));
    await client.readConversationTranscript(transcriptQuery);
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe(
      '/api/conversations/chat/transcript?thread_id=svc-chat%2F%2B15551234567&page=1&pageSize=50&order=desc',
    );
  });

  it('encodes the thread id ONCE, leaving an already-encoded principal intact', async () => {
    const { client, captured } = harness(() => jsonResponse(transcriptPage([callerRecord])));
    await client.readConversationTranscript({
      ...transcriptQuery,
      // The api door's address: the principal is already percent-encoded inside
      // the id, so its `%40` must reach the server as `%2540` and no further.
      threadId: 'bridge:chat:user%40example.com/u1',
      order: 'asc',
    });
    expect(captured[0]?.url).toBe(
      '/api/conversations/chat/transcript?thread_id=bridge%3Achat%3Auser%2540example.com%2Fu1&page=1&pageSize=50&order=asc',
    );
  });

  it('encodes a route name that is not URL-safe', async () => {
    const { client, captured } = harness(() => jsonResponse(transcriptPage([])));
    await client.readConversationTranscript({ ...transcriptQuery, routeName: 'a b/c' });
    expect(captured[0]?.url).toContain('/api/conversations/a%20b%2Fc/transcript?');
  });

  it('carries the text filter `q` when one is given, and omits it otherwise', async () => {
    const { client, captured } = harness(() => jsonResponse(transcriptPage([callerRecord])));
    await client.readConversationTranscript({ ...transcriptQuery, order: 'asc', q: 'widget' });
    expect(captured[0]?.url).toBe(
      '/api/conversations/chat/transcript?thread_id=svc-chat%2F%2B15551234567&page=1&pageSize=50&order=asc&q=widget',
    );
    await client.readConversationTranscript(transcriptQuery);
    expect(captured[1]?.url).not.toContain('q=');
  });

  it('surfaces the truncated flag when the door capped the page', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          items: [callerRecord],
          total: 1,
          page: 1,
          page_size: 50,
          next_page: null,
          truncated: true,
          order: 'desc',
        },
      }),
    );
    expect((await client.readConversationTranscript(transcriptQuery)).truncated).toBe(true);
  });

  it('carries the order and next_page back for a paged thread', async () => {
    const { client } = harness(() => jsonResponse(transcriptPage([adminRecord], 'desc', 2)));
    const out = await client.readConversationTranscript(transcriptQuery);
    expect(out.order).toBe('desc');
    expect(out.next_page).toBe(2);
  });

  it('unwraps the ADMIN projection with its delivery bookkeeping', async () => {
    const { client } = harness(() => jsonResponse(transcriptPage([adminRecord], 'desc')));
    const out = await client.readConversationTranscript(transcriptQuery);
    expect(out.items[0]?.attempts).toBe(1);
    expect(out.items[0]?.outbound_message_ids).toEqual(['wamid.2']);
    expect(out.items[0]?.inbound_text).toBe('where is my request');
  });

  it('accepts the CALLER projection, whose admin-only fields are absent', async () => {
    const { client } = harness(() => jsonResponse(transcriptPage([callerRecord], 'desc')));
    const out = await client.readConversationTranscript(transcriptQuery);
    expect(out.items[0]?.attempts).toBeUndefined();
    expect(out.items[0]?.error).toBeUndefined();
    expect(out.items[0]?.answer).toBe('It completes tomorrow.');
  });

  it('accepts an outcome-less record (accepted / shed carries no answer)', async () => {
    const pending = {
      ...callerRecord,
      answer_status: null,
      answer: null,
      delivery_status: 'accepted',
    };
    const { client } = harness(() => jsonResponse(transcriptPage([pending], 'desc')));
    const out = await client.readConversationTranscript(transcriptQuery);
    expect(out.items[0]?.answer_status).toBeNull();
    expect(out.items[0]?.delivery_status).toBe('accepted');
  });

  it('throws ApiSchemaError LOUDLY on a record carrying no inbound text', async () => {
    // Every record answers a message and both projections publish it, so a null
    // there is drift — never a state the monitor has to render.
    const { client } = harness(() =>
      jsonResponse(transcriptPage([{ ...callerRecord, inbound_text: null }], 'desc')),
    );
    await expect(client.readConversationTranscript(transcriptQuery)).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });

  it('throws ApiSchemaError LOUDLY on an unknown delivery status', async () => {
    const { client } = harness(() =>
      jsonResponse(transcriptPage([{ ...callerRecord, delivery_status: 'teleported' }], 'desc')),
    );
    await expect(client.readConversationTranscript(transcriptQuery)).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });

  it('throws ApiSchemaError LOUDLY when the echoed order is not one the door serves', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          items: [callerRecord],
          total: 1,
          page: 1,
          page_size: 50,
          next_page: null,
          truncated: false,
          order: 'sideways',
        },
      }),
    );
    await expect(client.readConversationTranscript(transcriptQuery)).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });

  it('carries client and operator origins through', async () => {
    const operatorRecord = {
      ...callerRecord,
      message_id: 'm2',
      origin: 'operator',
      inbound_text: '',
      answer: 'On it — checking now.',
    };
    const { client } = harness(() =>
      jsonResponse(transcriptPage([callerRecord, operatorRecord], 'desc')),
    );
    const out = await client.readConversationTranscript(transcriptQuery);
    expect(out.items[0]?.origin).toBe('client');
    expect(out.items[1]?.origin).toBe('operator');
  });
});

describe('route message search transport', () => {
  function searchPage(items: unknown[], nextPage: number | null = null, truncated = false) {
    return {
      data: { items, total: items.length, page: 1, page_size: 25, next_page: nextPage, truncated },
    };
  }

  it('GETs the search door with the needle + paging window', async () => {
    const { client, captured } = harness(() => jsonResponse(searchPage([adminRecord])));
    const out = await client.searchConversationMessages({
      routeName: 'chat',
      q: 'widget',
      page: 1,
      pageSize: 25,
    });
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe(
      '/api/conversations/chat/messages/search?q=widget&page=1&pageSize=25',
    );
    expect(out.items[0]?.message_id).toBe('m1');
  });

  it('encodes a route name that is not URL-safe', async () => {
    const { client, captured } = harness(() => jsonResponse(searchPage([])));
    await client.searchConversationMessages({ routeName: 'a b/c', q: 'x', page: 1, pageSize: 25 });
    expect(captured[0]?.url).toBe(
      '/api/conversations/a%20b%2Fc/messages/search?q=x&page=1&pageSize=25',
    );
  });

  it('carries next_page and the truncated flag back', async () => {
    const { client } = harness(() => jsonResponse(searchPage([adminRecord], 2, true)));
    const out = await client.searchConversationMessages({
      routeName: 'chat',
      q: 'widget',
      page: 1,
      pageSize: 25,
    });
    expect(out.next_page).toBe(2);
    expect(out.truncated).toBe(true);
  });

  it('throws ApiSchemaError LOUDLY when the truncated flag is absent', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: { items: [adminRecord], total: 1, page: 1, page_size: 25, next_page: null },
      }),
    );
    await expect(
      client.searchConversationMessages({ routeName: 'chat', q: 'x', page: 1, pageSize: 25 }),
    ).rejects.toBeInstanceOf(ApiSchemaError);
  });
});

describe('thread mode transport', () => {
  it('GETs the mode door with the thread id as a QUERY value', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { mode: 'agent', source: 'route' } }),
    );
    const out = await client.getConversationThreadMode('chat', 'svc-chat/+15551234567');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe(
      '/api/conversations/chat/thread/mode?thread_id=svc-chat%2F%2B15551234567',
    );
    expect(out).toEqual({ mode: 'agent', source: 'route' });
  });

  it('PUTs the mode with the thread id in the BODY and parses the confirmed state', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { mode: 'manual', source: 'thread' } }),
    );
    const out = await client.setConversationThreadMode('chat', 'svc-chat/+15551234567', 'manual');
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/conversations/chat/thread/mode');
    expect(captured[0]?.body).toEqual({ thread_id: 'svc-chat/+15551234567', mode: 'manual' });
    expect(out).toEqual({ mode: 'manual', source: 'thread' });
  });

  it('throws ApiSchemaError LOUDLY on an unknown mode value', async () => {
    const { client } = harness(() => jsonResponse({ data: { mode: 'both', source: 'route' } }));
    await expect(
      client.getConversationThreadMode('chat', 'svc-chat/+15551234567'),
    ).rejects.toBeInstanceOf(ApiSchemaError);
  });
});

describe('thread message send transport', () => {
  it('POSTs the messages door with the thread id + text in the BODY', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { message_id: 'm9', thread_id: 'svc-chat/+15551234567' } }),
    );
    const out = await client.sendConversationThreadMessage('chat', {
      thread_id: 'svc-chat/+15551234567',
      text: 'On it.',
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/conversations/chat/thread/messages');
    expect(captured[0]?.body).toEqual({ thread_id: 'svc-chat/+15551234567', text: 'On it.' });
    expect(out).toEqual({ message_id: 'm9', thread_id: 'svc-chat/+15551234567' });
  });

  it('carries an optional address override into the body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { message_id: 'm9', thread_id: 'svc-chat/+15551234567' } }),
    );
    await client.sendConversationThreadMessage('chat', {
      thread_id: 'svc-chat/+15551234567',
      text: 'On it.',
      address: '+15550000000',
    });
    expect(captured[0]?.body).toEqual({
      thread_id: 'svc-chat/+15551234567',
      text: 'On it.',
      address: '+15550000000',
    });
  });

  it('encodes a route name that is not URL-safe', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { message_id: 'm9', thread_id: 't' } }),
    );
    await client.sendConversationThreadMessage('a b/c', { thread_id: 't', text: 'hi' });
    expect(captured[0]?.url).toBe('/api/conversations/a%20b%2Fc/thread/messages');
  });

  it('throws ApiSchemaError LOUDLY on a receipt missing its message id', async () => {
    const { client } = harness(() => jsonResponse({ data: { thread_id: 't' } }));
    await expect(
      client.sendConversationThreadMessage('chat', { thread_id: 't', text: 'hi' }),
    ).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
