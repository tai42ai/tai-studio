/**
 * Transport-level tests for the templates client methods: `listTemplates`,
 * `getTemplate`, `uploadTemplate`, `deleteTemplate`, `deleteTemplateDir`,
 * `renderTemplate`, `clearTemplatesCache` — URL, HTTP method, request-body shaping,
 * the `{ data }`
 * envelope unwrap, and a LOUD error on a 4xx `{error}` plus an `ApiSchemaError` on a
 * drifting response. A fake `fetch` records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, ApiSchemaError, type ApiConfig } from './index';

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

describe('templates client transport', () => {
  it('listTemplates() GETs /api/templates and unwraps the name list', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: ['welcome', 'notice'] }));
    const out = await client.listTemplates();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/templates');
    expect(out).toEqual(['welcome', 'notice']);
  });

  it('getTemplate POSTs { template_id } to /api/template and parses the detail', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { template: 'Hello {{ name }}', schema: { type: 'object' } } }),
    );
    const out = await client.getTemplate('welcome');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/template');
    expect(captured[0]?.body).toEqual({ template_id: 'welcome' });
    expect(out.template).toBe('Hello {{ name }}');
    expect(out.schema).toEqual({ type: 'object' });
  });

  it('uploadTemplate POSTs { path, content } and parses the receipt', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { path: 'welcome.md', uploaded: true } }),
    );
    const out = await client.uploadTemplate('welcome.md', 'Hi {{ name }}');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/upload-template');
    expect(captured[0]?.body).toEqual({ path: 'welcome.md', content: 'Hi {{ name }}' });
    expect(out.uploaded).toBe(true);
  });

  it('deleteTemplate POSTs { path } and parses the receipt', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { path: 'welcome.md', deleted: true } }),
    );
    const out = await client.deleteTemplate('welcome.md');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/delete-template');
    expect(captured[0]?.body).toEqual({ path: 'welcome.md' });
    expect(out.deleted).toBe(true);
  });

  it('deleteTemplateDir POSTs { path } to /api/delete-template-dir and parses the receipt', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { path: 'prompts', deleted: true } }),
    );
    const out = await client.deleteTemplateDir('prompts');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/delete-template-dir');
    expect(captured[0]?.body).toEqual({ path: 'prompts' });
    expect(out.deleted).toBe(true);
  });

  it('surfaces a 404 { error } from a missing directory as a LOUD ApiError', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: "template directory 'ghost' not found" }, 404),
    );
    await expect(client.deleteTemplateDir('ghost')).rejects.toBeInstanceOf(ApiError);
  });

  it('renderTemplate POSTs the render body and parses the rendered output', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { rendered: 'Hi Ada' } }));
    const out = await client.renderTemplate({ template_id: 'welcome', kwargs: { name: 'Ada' } });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/render-template');
    expect(captured[0]?.body).toEqual({ template_id: 'welcome', kwargs: { name: 'Ada' } });
    expect(out.rendered).toBe('Hi Ada');
  });

  it('clearTemplatesCache POSTs to the cache route and parses the confirmation', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { cleared: true } }));
    const out = await client.clearTemplatesCache();
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/clear-templates-cache');
    expect(out.cleared).toBe(true);
  });

  it('surfaces a 4xx { error } from a render failure as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: "template 'ghost' not found" }, 404));
    await expect(client.renderTemplate({ template_id: 'ghost' })).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting upload receipt (uploaded not true)', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { path: 'welcome.md', uploaded: false } }),
    );
    await expect(client.uploadTemplate('welcome.md', 'x')).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
