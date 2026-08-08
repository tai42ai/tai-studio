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
}

function urlString(url: RequestInfo | URL): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

function harness(responder: () => Response) {
  const captured: Captured[] = [];
  const fetchImpl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: urlString(url), method: init?.method ?? 'GET' });
    return Promise.resolve(responder());
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

const route = {
  route_name: 'support',
  door: 'channel',
  target_kind: 'agent',
  target_name: 'concierge',
  payload_expr: null,
  reply_expr: null,
  execution_key: 'svc-support',
  channel: 'whatsapp',
  our_identity: '+15550000000',
  callback_url: null,
  execution_key_fingerprint: 'fp-1',
};

const thread = {
  thread_id: 'svc-support/+15551234567',
  client_address: '+15551234567',
  last_activity_at: 1_800_000_000.5,
  message_count: 3,
  last_delivery_status: 'delivered',
};

/** The CALLER-scoped projection: the allow-listed fields and nothing more. */
const callerRecord = {
  message_id: 'm1',
  route_name: 'support',
  door: 'channel',
  thread_id: 'svc-support/+15551234567',
  client_address: '+15551234567',
  caller_principal: null,
  inbound_text: 'where is my order',
  answer_status: 'answered',
  answer: 'It ships tomorrow.',
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
    expect(out.items[0]?.route_name).toBe('support');
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
        data: { items: [thread], total: 1, page: 1, page_size: 25, next_page: null },
      }),
    );
    const out = await client.listConversationThreads('support', 1, 25);
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/conversations/support/threads?page=1&pageSize=25');
    expect(out.items[0]?.thread_id).toBe('svc-support/+15551234567');
    expect(out.next_page).toBeNull();
  });

  it('encodes a route name that is not URL-safe', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { items: [], total: 0, page: 1, page_size: 25, next_page: null } }),
    );
    await client.listConversationThreads('a b/c', 1, 25);
    expect(captured[0]?.url).toBe('/api/conversations/a%20b%2Fc/threads?page=1&pageSize=25');
  });

  it('carries next_page through for a long route', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { items: [thread], total: 90, page: 1, page_size: 25, next_page: 2 } }),
    );
    expect((await client.listConversationThreads('support', 1, 25)).next_page).toBe(2);
  });

  it('throws ApiSchemaError LOUDLY on a drifting thread row (missing message_count)', async () => {
    const { message_count: _dropped, ...broken } = thread;
    const { client } = harness(() =>
      jsonResponse({
        data: { items: [broken], total: 1, page: 1, page_size: 25, next_page: null },
      }),
    );
    await expect(client.listConversationThreads('support', 1, 25)).rejects.toBeInstanceOf(
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
    data: { items, total: items.length, page: 1, page_size: 50, next_page: nextPage, order },
  };
}

/** The default read the tests below make: page 1 of the live-tail direction. */
const transcriptQuery = {
  routeName: 'support',
  threadId: 'svc-support/+15551234567',
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
      '/api/conversations/support/transcript?thread_id=svc-support%2F%2B15551234567&page=1&pageSize=50&order=desc',
    );
  });

  it('encodes the thread id ONCE, leaving an already-encoded principal intact', async () => {
    const { client, captured } = harness(() => jsonResponse(transcriptPage([callerRecord])));
    await client.readConversationTranscript({
      ...transcriptQuery,
      // The api door's address: the principal is already percent-encoded inside
      // the id, so its `%40` must reach the server as `%2540` and no further.
      threadId: 'bridge:support:user%40example.com/u1',
      order: 'asc',
    });
    expect(captured[0]?.url).toBe(
      '/api/conversations/support/transcript?thread_id=bridge%3Asupport%3Auser%2540example.com%2Fu1&page=1&pageSize=50&order=asc',
    );
  });

  it('encodes a route name that is not URL-safe', async () => {
    const { client, captured } = harness(() => jsonResponse(transcriptPage([])));
    await client.readConversationTranscript({ ...transcriptQuery, routeName: 'a b/c' });
    expect(captured[0]?.url).toContain('/api/conversations/a%20b%2Fc/transcript?');
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
    expect(out.items[0]?.inbound_text).toBe('where is my order');
  });

  it('accepts the CALLER projection, whose admin-only fields are absent', async () => {
    const { client } = harness(() => jsonResponse(transcriptPage([callerRecord], 'desc')));
    const out = await client.readConversationTranscript(transcriptQuery);
    expect(out.items[0]?.attempts).toBeUndefined();
    expect(out.items[0]?.error).toBeUndefined();
    expect(out.items[0]?.answer).toBe('It ships tomorrow.');
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
          order: 'sideways',
        },
      }),
    );
    await expect(client.readConversationTranscript(transcriptQuery)).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });
});
