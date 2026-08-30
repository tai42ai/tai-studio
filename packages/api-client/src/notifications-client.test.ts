/**
 * Transport-level tests for the notifications sink method: URL/method building,
 * the `{ data }` envelope unwrap, and a LOUD `ApiSchemaError` on a drifting
 * response (never a silent coerce). A fake `fetch` records each request and
 * returns a canned body.
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

const record = {
  id: 'n1',
  message: 'Backup completed',
  recipient: 'ops',
  created_at: '2026-07-11T00:00:00Z',
};

describe('notifications client transport', () => {
  it('listNotifications() GETs /api/notifications and unwraps the feed', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { notifications: [record] } }));
    const out = await client.listNotifications();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/notifications');
    expect(out.notifications[0]?.id).toBe('n1');
    expect(out.notifications[0]?.message).toBe('Backup completed');
  });

  it('listNotifications() accepts a null recipient and an empty feed', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { notifications: [{ ...record, recipient: null }] } }),
    );
    const out = await client.listNotifications();
    expect(out.notifications[0]?.recipient).toBeNull();

    const { client: emptyClient } = harness(() => jsonResponse({ data: { notifications: [] } }));
    expect((await emptyClient.listNotifications()).notifications).toEqual([]);
  });

  it('parses the rich sink record shape: audience, media, template and options', async () => {
    const rich = {
      ...record,
      recipient: null,
      audience: 'u-42',
      media: [{ kind: 'image', url: 'https://cdn.example.com/x.png', caption: 'x' }],
      template: { name: 'order_update', language: 'en', parameters: ['#1'] },
      options: ['Acknowledge', 'Snooze'],
    };
    const { client } = harness(() => jsonResponse({ data: { notifications: [rich] } }));
    const out = await client.listNotifications();
    const parsed = out.notifications[0];
    expect(parsed?.audience).toBe('u-42');
    expect(parsed?.media).toHaveLength(1);
    expect(parsed?.template?.name).toBe('order_update');
    expect(parsed?.options).toEqual(['Acknowledge', 'Snooze']);
  });

  it('parses an older plain record that predates the rich fields (keys omitted)', async () => {
    // A record written before the parity wave carries no audience/media/template/
    // options keys; each is `.nullish()`, so an absent key parses to a plain record.
    const { client } = harness(() => jsonResponse({ data: { notifications: [record] } }));
    const parsed = (await client.listNotifications()).notifications[0];
    expect(parsed?.audience).toBeUndefined();
    expect(parsed?.media).toBeUndefined();
    expect(parsed?.template).toBeUndefined();
    expect(parsed?.options).toBeUndefined();
  });

  it('throws ApiSchemaError LOUDLY on a drifting record (missing message)', async () => {
    const { message: _dropped, ...broken } = record;
    const { client } = harness(() => jsonResponse({ data: { notifications: [broken] } }));
    await expect(client.listNotifications()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
