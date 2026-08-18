/**
 * Schema + transport tests for the tool_meta overlay client: the folder tree and
 * per-tool overlay rows, and the merge-patch upsert that sends ONLY the fields it
 * touches. Every response is zod-validated, so a drift throws a LOUD `ApiSchemaError`
 * rather than coercing.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiSchemaError, type ApiConfig } from './index';
import * as schemas from './schemas';

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
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: urlString(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return responder();
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

describe('tool_meta schemas', () => {
  it('parses the overlay (folder tree + per-tool rows)', () => {
    const parsed = schemas.toolMetaOverlay.parse({
      folders: [
        { id: 'f1', name: 'Weather', parent_id: null },
        { id: 'f2', name: 'EU', parent_id: 'f1' },
      ],
      meta: [
        {
          tool_name: 'paris_weather',
          display_name: 'Paris',
          folder_id: 'f2',
          tags: ['geo'],
          badges: ['network'],
          hidden: null,
        },
      ],
    });
    expect(parsed.folders[1]?.parent_id).toBe('f1');
    expect(parsed.meta[0]?.hidden).toBeNull();
    expect(parsed.meta[0]?.badges).toEqual(['network']);
  });

  it('accepts the tri-state hidden (null / true / false)', () => {
    for (const hidden of [null, true, false]) {
      const parsed = schemas.toolMetaRecord.parse({
        tool_name: 't',
        display_name: null,
        folder_id: null,
        tags: [],
        badges: [],
        hidden,
      });
      expect(parsed.hidden).toBe(hidden);
    }
  });

  it('throws loudly when a required overlay field is absent (no silent default)', () => {
    expect(() =>
      schemas.toolMetaRecord.parse({ tool_name: 't', display_name: null, folder_id: null }),
    ).toThrow();
  });

  it('throws loudly when the overlay badges are absent (no silent default)', () => {
    expect(() =>
      schemas.toolMetaRecord.parse({
        tool_name: 't',
        display_name: null,
        folder_id: null,
        tags: [],
        hidden: null,
      }),
    ).toThrow();
  });

  it('throws loudly when a folder parent_id is a non-string, non-null value', () => {
    expect(() => schemas.folderRecord.parse({ id: 'f', name: 'F', parent_id: 3 })).toThrow();
  });
});

describe('tool_meta client transport', () => {
  const row = {
    tool_name: 'paris_weather',
    display_name: 'Paris',
    folder_id: null,
    tags: ['geo'],
    badges: ['network'],
    hidden: null,
  };

  it('listToolMeta GETs /api/tool-meta and parses the overlay', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { folders: [], meta: [row] } }),
    );
    const out = await client.listToolMeta();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/tool-meta');
    expect(out.meta[0]?.tool_name).toBe('paris_weather');
  });

  it('upsertToolMeta PATCHes ONLY the fields it is given (merge-patch)', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: row }));
    await client.upsertToolMeta('paris_weather', { display_name: 'Paris', tags: ['geo'] });
    expect(captured[0]?.method).toBe('PATCH');
    expect(captured[0]?.url).toBe('/api/tool-meta/tools/paris_weather');
    // No `folder_id` / `hidden` keys — absent means untouched by the merge-patch API.
    expect(captured[0]?.body).toEqual({ display_name: 'Paris', tags: ['geo'] });
  });

  it('upsertToolMeta writes the overlay badges when they are given', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: row }));
    await client.upsertToolMeta('paris_weather', { badges: ['network', 'filesystem'] });
    expect(captured[0]?.body).toEqual({ badges: ['network', 'filesystem'] });
  });

  it('upsertToolMeta carries a present-null through the body (an explicit clear)', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: row }));
    await client.upsertToolMeta('paris_weather', { hidden: null });
    expect(captured[0]?.body).toEqual({ hidden: null });
  });

  it('deleteToolMeta DELETEs the row route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { tool_name: 'paris_weather', deleted: true } }),
    );
    const out = await client.deleteToolMeta('paris_weather');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/tool-meta/tools/paris_weather');
    expect(out.deleted).toBe(true);
  });

  it('createFolder POSTs {name, parent_id} and parses the new folder', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'f1', name: 'Weather', parent_id: null } }),
    );
    const out = await client.createFolder('Weather');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/tool-meta/folders');
    expect(captured[0]?.body).toEqual({ name: 'Weather', parent_id: null });
    expect(out.id).toBe('f1');
  });

  it('createFolder nests under an explicit parent', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'f2', name: 'EU', parent_id: 'f1' } }),
    );
    await client.createFolder('EU', 'f1');
    expect(captured[0]?.body).toEqual({ name: 'EU', parent_id: 'f1' });
  });

  it('renameFolder POSTs {name} to the rename route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'f1', name: 'Climate', parent_id: null } }),
    );
    await client.renameFolder('f1', 'Climate');
    expect(captured[0]?.url).toBe('/api/tool-meta/folders/f1/rename');
    expect(captured[0]?.body).toEqual({ name: 'Climate' });
  });

  it('moveFolder POSTs {parent_id} (null re-parents to the root)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { id: 'f2', name: 'EU', parent_id: null } }),
    );
    await client.moveFolder('f2', null);
    expect(captured[0]?.url).toBe('/api/tool-meta/folders/f2/move');
    expect(captured[0]?.body).toEqual({ parent_id: null });
  });

  it('deleteFolder DELETEs the folder route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { folder_id: 'f1', deleted: true } }),
    );
    const out = await client.deleteFolder('f1');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/tool-meta/folders/f1');
    expect(out.deleted).toBe(true);
  });

  it('throws ApiSchemaError LOUDLY on a drifting overlay row (no silent coerce)', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { folders: [], meta: [{ tool_name: 'x' }] } }),
    );
    await expect(client.listToolMeta()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
