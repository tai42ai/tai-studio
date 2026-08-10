/**
 * Transport-level tests for the settings-profiles client methods plus the
 * combined-op / preserved-manifest methods: URL, HTTP method, request-body shaping,
 * the `{ data }` envelope unwrap, and the zod parse of representative responses —
 * the apply report (incl. a `self-deferred` recycle line and a populated `refused`
 * list), the secret-bearing body/diff, version metadata, and a LOUD `ApiSchemaError`
 * on a drifting response.
 *
 * Profile bodies/diffs carry REAL secret values on the wire (secret/fenced routes);
 * masking is a CLIENT concern, so these mocks assert the values arrive intact — the
 * transport never masks. These tests mock the transport only.
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

describe('settings-profiles client transport', () => {
  it('listSettingsProfiles GETs /api/config/profiles and parses names + descriptions', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          { name: 'prod', description: 'Production band' },
          { name: 'staging', description: 'Staging band' },
        ],
      }),
    );
    const out = await client.listSettingsProfiles();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/config/profiles');
    expect(out).toEqual([
      { name: 'prod', description: 'Production band' },
      { name: 'staging', description: 'Staging band' },
    ]);
  });

  it('getSettingsProfile GETs the encoded name and parses the body with REAL env values + secret_keys', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          description: 'Production band',
          env: { APP_TITLE: 'Studio', API_TOKEN: 'super-secret-value' },
          secret_keys: ['API_TOKEN'],
        },
      }),
    );
    const out = await client.getSettingsProfile('prod');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/config/profiles/prod');
    // The transport does not mask: the secret value arrives verbatim for the UI to mask.
    expect(out.env.API_TOKEN).toBe('super-secret-value');
    expect(out.secret_keys).toEqual(['API_TOKEN']);
  });

  it('putSettingsProfile PUTs the body verbatim and parses the save ack', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { ok: true, version: 4 } }));
    const body = {
      description: 'Production band',
      env: { APP_TITLE: 'Studio', API_TOKEN: 'x' },
      secret_keys: ['API_TOKEN'],
    };
    const out = await client.putSettingsProfile('prod', body);
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/config/profiles/prod');
    expect(captured[0]?.body).toEqual(body);
    expect(out).toEqual({ ok: true, version: 4 });
  });

  it('putSettingsProfile parses a save ack with version omitted (a no-op save)', async () => {
    const { client } = harness(() => jsonResponse({ data: { ok: true } }));
    const out = await client.putSettingsProfile('prod', {
      description: '',
      env: {},
      secret_keys: [],
    });
    expect(out.ok).toBe(true);
    expect(out.version).toBeUndefined();
  });

  it('deleteSettingsProfile DELETEs the encoded name and parses the removal ack', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { ok: true } }));
    const out = await client.deleteSettingsProfile('old profile');
    expect(captured[0]?.method).toBe('DELETE');
    // encodeSegment percent-encodes the space in the single path segment.
    expect(captured[0]?.url).toBe('/api/config/profiles/old%20profile');
    expect(out).toEqual({ ok: true });
  });

  it('diffSettingsProfile POSTs (no body) and parses added/removed/changed + recycle/refused keys', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          added: ['NEW_KEY'],
          removed: ['STALE_KEY'],
          changed: [{ key: 'API_TOKEN', old: 'old-secret', new: 'new-secret' }],
          recycle_keys: ['TAI_DEFAULT_REDIS_URL'],
          refused_keys: ['TAI_APP_PROVIDERS'],
        },
      }),
    );
    const out = await client.diffSettingsProfile('prod');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/config/profiles/prod/diff');
    // Diff is the SAVED profile vs stored env — no request body.
    expect(captured[0]?.body).toBeUndefined();
    // `changed` carries REAL old/new values for the UI to mask via JsonDiff.
    expect(out.changed).toEqual([{ key: 'API_TOKEN', old: 'old-secret', new: 'new-secret' }]);
    expect(out.recycle_keys).toEqual(['TAI_DEFAULT_REDIS_URL']);
    expect(out.refused_keys).toEqual(['TAI_APP_PROVIDERS']);
  });

  it('applySettingsProfile POSTs and parses the report — recycle lives, fresh lives, empty refused, fanout', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          hot: ['APP_TITLE'],
          recycle: [
            { name: 'serve-1', kind: 'serve', status: 'recycled', generation_before: 4 },
            { name: 'serve-2', kind: 'serve', status: 'self-deferred', generation_before: 2 },
          ],
          fresh: [{ name: 'serve-1', kind: 'serve', generation: 5 }],
          refused: [],
          fanout: {
            mode: 'local-only',
            note: 'no worker bus configured; only this worker reloaded',
          },
        },
      }),
    );
    const out = await client.applySettingsProfile('prod');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/config/profiles/prod/apply');
    expect(captured[0]?.body).toBeUndefined();
    expect(out.hot).toEqual(['APP_TITLE']);
    // A recycled target carries its pre-apply life; the applier's own entry carries the
    // pinned `self-deferred` literal plus its own generation.
    expect(out.recycle[0]).toEqual({
      name: 'serve-1',
      kind: 'serve',
      status: 'recycled',
      generation_before: 4,
    });
    expect(out.recycle[1]?.status).toBe('self-deferred');
    // `fresh` is the per-kind new ready lives observed since the pre-apply snapshot.
    expect(out.fresh).toEqual([{ name: 'serve-1', kind: 'serve', generation: 5 }]);
    expect(out.refused).toEqual([]);
    expect(out.fanout.mode).toBe('local-only');
  });

  it('applySettingsProfile parses a REFUSAL report — populated refused {key, reason} and a fleet fanout', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          hot: [],
          recycle: [],
          fresh: [],
          refused: [
            { key: 'TAI_APP_PROVIDERS', reason: 'boundary-refused: no recycle path' },
            { key: 'TAI_DEFAULT_REDIS_URL', reason: 'recycle_supported=false for this shape' },
          ],
          fanout: {
            mode: 'fleet',
            op: 'reload-config',
            reachable: true,
            local_only: false,
            results: [
              { name: 'serve-1', outcome: 'applied', payload: null, error: null, detail: null },
            ],
            error: null,
          },
        },
      }),
    );
    const out = await client.applySettingsProfile('prod');
    expect(out.refused).toEqual([
      { key: 'TAI_APP_PROVIDERS', reason: 'boundary-refused: no recycle path' },
      { key: 'TAI_DEFAULT_REDIS_URL', reason: 'recycle_supported=false for this shape' },
    ]);
    expect(out.fanout.mode).toBe('fleet');
  });

  it('listSettingsProfileVersions GETs /versions and parses metadata rows (no bodies)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          { version: 2, tags: [], created_at: '2026-08-07T00:00:00Z', is_current: true },
          { version: 1, tags: ['seed'], created_at: '2026-08-06T00:00:00Z', is_current: false },
        ],
      }),
    );
    const out = await client.listSettingsProfileVersions('prod');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/config/profiles/prod/versions');
    expect(out[0]).toEqual({
      version: 2,
      tags: [],
      created_at: '2026-08-07T00:00:00Z',
      is_current: true,
    });
    // Metadata only — no `body` field rides the list rows.
    expect(out[0]).not.toHaveProperty('body');
  });

  it('getSettingsProfileVersion GETs the encoded name+version and parses the version WITH its body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          version: 1,
          tags: [],
          created_at: '2026-08-06T00:00:00Z',
          is_current: false,
          body: {
            description: 'seed',
            env: { API_TOKEN: 'historic-secret' },
            secret_keys: ['API_TOKEN'],
          },
        },
      }),
    );
    const out = await client.getSettingsProfileVersion('prod', 1);
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/config/profiles/prod/versions/1');
    expect(out.body.env.API_TOKEN).toBe('historic-secret');
    expect(out.body.secret_keys).toEqual(['API_TOKEN']);
  });

  it('rollbackSettingsProfile POSTs { version } and parses the restore ack', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { ok: true, version: 3 } }));
    const out = await client.rollbackSettingsProfile('prod', 1);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/config/profiles/prod/rollback');
    expect(captured[0]?.body).toEqual({ version: 1 });
    expect(out).toEqual({ ok: true, version: 3 });
  });

  it('surfaces a 4xx { error } from a rejected apply as a LOUD ApiError', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: 'apply refused: dangling !ENV reference' }, 400),
    );
    await expect(client.applySettingsProfile('prod')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting profile body (secret_keys missing)', async () => {
    const { client } = harness(() => jsonResponse({ data: { description: 'x', env: { A: '1' } } }));
    await expect(client.getSettingsProfile('prod')).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY when the apply report drops the fanout field', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { hot: [], recycle: [], fresh: [], refused: [] } }),
    );
    await expect(client.applySettingsProfile('prod')).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY when the apply report drops the fresh field', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: {
          hot: [],
          recycle: [],
          refused: [],
          fanout: { mode: 'local-only', note: 'only this worker reloaded' },
        },
      }),
    );
    await expect(client.applySettingsProfile('prod')).rejects.toBeInstanceOf(ApiSchemaError);
  });
});

describe('combined env+manifest op + preserved manifest transport', () => {
  it('setMcpSecretEnv POSTs { value, key_hint, manifest_pointer } and parses the apply result', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          status: 'ok',
          env_keys: 3,
          fanout: {
            mode: 'local-only',
            note: 'no worker bus configured; only this worker reloaded',
          },
        },
      }),
    );
    const out = await client.setMcpSecretEnv({
      value: 'a-pasted-secret',
      key_hint: 'GITHUB_TOKEN',
      manifest_pointer: 'mcp/0/headers/Authorization',
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/mcp-config/secret-env');
    expect(captured[0]?.body).toEqual({
      value: 'a-pasted-secret',
      key_hint: 'GITHUB_TOKEN',
      manifest_pointer: 'mcp/0/headers/Authorization',
    });
    expect(out.status).toBe('ok');
    expect(out.fanout.mode).toBe('local-only');
  });

  it('getManifestPreserved GETs /api/manifest/preserved and parses the manifest view (markers intact)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          mcp: [{ title: 'gh', headers: { Authorization: '!ENV ${GITHUB_TOKEN}' }, managed: null }],
          user_tools: ['search'],
        },
      }),
    );
    const out = await client.getManifestPreserved();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/manifest/preserved');
    // The preserved read keeps `!ENV` markers intact (passthrough entry preserves them).
    const entry = out.mcp[0] as { headers: Record<string, string> };
    expect(entry.headers).toEqual({ Authorization: '!ENV ${GITHUB_TOKEN}' });
    expect(out.user_tools).toEqual(['search']);
  });
});
