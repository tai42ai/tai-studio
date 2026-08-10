/**
 * Transport-level tests for the single-tier preset + tool-tags client methods:
 * URL/query/method building, the envelope unwrap, and a LOUD `ApiSchemaError` on a
 * drifting response (never a silent coerce). A fake `fetch` records each request
 * and returns a canned body.
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

const record = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: 'Paris weather',
  active_version: 1,
  extensions: [],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
};

describe('preset client transport', () => {
  it('listPresets() hits /api/presets with no query', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: [record] }));
    const out = await client.listPresets();
    expect(captured[0]?.url).toBe('/api/presets');
    expect(out[0]?.name).toBe('paris_weather');
  });

  it('createPreset POSTs the body and parses the new record row', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: record }));
    const out = await client.createPreset({
      name: 'paris_weather',
      base_tool: 'weather',
      description: 'Paris weather',
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/presets');
    expect(out.active_version).toBe(1);
    expect(out.conflicted).toBe(false);
  });

  it('createPreset carries output_schema and extension combos through the body', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: record }));
    await client.createPreset({
      name: 'paris_weather',
      base_tool: 'weather',
      description: 'Paris weather',
      extensions: [['chain']],
      output_schema: { type: 'object' },
    });
    expect(captured[0]?.body).toMatchObject({
      extensions: [['chain']],
      output_schema: { type: 'object' },
    });
  });

  it('savePresetVersion POSTs to the versions route', async () => {
    const version = {
      version: 3,
      body: {
        base_tool: 'weather',
        description: '',
        fixed_kwargs: {},
        extensions: [],
        output_schema: null,
      },
      tags: [],
      created_at: 'now',
      is_current: true,
    };
    const { client, captured } = harness(() => jsonResponse({ data: version }));
    await client.savePresetVersion('paris_weather', { description: 'refreshed' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/presets/paris_weather/versions');
    expect(captured[0]?.body).toEqual({ description: 'refreshed' });
  });

  it('rollbackPreset POSTs {version} to the rollback route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'paris_weather', active_version: 2 } }),
    );
    await client.rollbackPreset('paris_weather', 2);
    expect(captured[0]?.url).toBe('/api/presets/paris_weather/rollback');
    expect(captured[0]?.body).toEqual({ version: 2 });
  });

  it('deletePreset DELETEs the preset route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'paris_weather', deleted: true } }),
    );
    await client.deletePreset('paris_weather');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/presets/paris_weather');
  });

  it('renamePreset POSTs {new_name} to the rename route and parses the re-keyed record', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { name: 'london_weather', renamed_from: 'paris weather', active_version: 3 },
      }),
    );
    const out = await client.renamePreset('paris weather', 'london_weather');
    expect(captured[0]?.method).toBe('POST');
    // The CURRENT name is URL-encoded in the path; the target rides in the body.
    expect(captured[0]?.url).toBe('/api/presets/paris%20weather/rename');
    expect(captured[0]?.body).toEqual({ new_name: 'london_weather' });
    expect(out).toEqual({
      name: 'london_weather',
      renamed_from: 'paris weather',
      active_version: 3,
    });
  });

  it('getPreset GETs the detail route and parses fixed_kwargs', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ...record, fixed_kwargs: { city: 'Paris' } } }),
    );
    const out = await client.getPreset('paris_weather');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/presets/paris_weather');
    expect(out.fixed_kwargs).toEqual({ city: 'Paris' });
  });

  it('listPresetVersions GETs the versions route', async () => {
    const version = {
      version: 1,
      body: {
        base_tool: 'weather',
        description: '',
        fixed_kwargs: {},
        extensions: [],
        output_schema: null,
      },
      tags: [],
      created_at: 'now',
      is_current: true,
    };
    const { client, captured } = harness(() => jsonResponse({ data: [version] }));
    const out = await client.listPresetVersions('paris_weather');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/presets/paris_weather/versions');
    expect(out[0]?.version).toBe(1);
  });

  it('getPresetVersion GETs a single version route', async () => {
    const version = {
      version: 2,
      body: {
        base_tool: 'weather',
        description: '',
        fixed_kwargs: {},
        extensions: [],
        output_schema: null,
      },
      tags: [],
      created_at: 'now',
      is_current: false,
    };
    const { client, captured } = harness(() => jsonResponse({ data: version }));
    const out = await client.getPresetVersion('paris_weather', 2);
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/presets/paris_weather/versions/2');
    expect(out.version).toBe(2);
  });

  it('getPresetReferees GETs the referees route and parses the list', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'weather', referees: ['a', 'b'] } }),
    );
    const out = await client.getPresetReferees('weather');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/presets/weather/referees');
    expect(out.referees).toEqual(['a', 'b']);
  });

  it('validatePreset POSTs the draft to the validate route and parses the verdict', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { valid: false, error: 'base tool missing' } }),
    );
    const out = await client.validatePreset({ name: 'paris_weather', base_tool: 'weather' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/presets/validate');
    expect(captured[0]?.body).toEqual({ name: 'paris_weather', base_tool: 'weather' });
    expect(out).toEqual({ valid: false, error: 'base tool missing' });
  });

  it('setPresetVersionTags PUTs {tags} to the version-tags route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'paris_weather', version: 2, tags: ['stable'] } }),
    );
    const out = await client.setPresetVersionTags('paris_weather', 2, ['stable']);
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/presets/paris_weather/versions/2/tags');
    expect(captured[0]?.body).toEqual({ tags: ['stable'] });
    expect(out.tags).toEqual(['stable']);
  });

  it('listToolTags hits /api/tools/tags', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: [{ name: 'weather', tags: [], hidden: false }] }),
    );
    const out = await client.listToolTags();
    expect(captured[0]?.url).toBe('/api/tools/tags');
    expect(out[0]?.name).toBe('weather');
  });

  it('throws ApiSchemaError LOUDLY on a drifting preset row (no silent coerce)', async () => {
    const { conflicted: _dropped, ...broken } = record;
    const { client } = harness(() => jsonResponse({ data: [broken] }));
    await expect(client.listPresets()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  // A `.`/`..`/absolute/empty preset name would be collapsed by the browser URL
  // parser and silently retarget the request, so the id→path encoder rejects it at
  // the client boundary before any request leaves. (The numeric `version` segment
  // stringifies to digits and can never be unsafe.)
  it('rejects an unsafe preset name before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ...record, fixed_kwargs: {} } }),
    );
    expect(() => client.getPreset('..')).toThrow(rule);
    expect(() => client.getPreset('.')).toThrow(rule);
    expect(() => client.getPreset('')).toThrow(rule);
    expect(() => client.deletePreset('..')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.getPreset('paris weather');
    expect(captured[0]?.url).toBe('/api/presets/paris%20weather');
  });
});
