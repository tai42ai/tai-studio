/**
 * Schema-level tests for the two additive fields the webhook-security feature
 * introduces: the interactions add-frame `server_verified` flag and the
 * `/api/hooks` response `topic_verifiers` map. Both are tolerant of an
 * older/absent value, and both accept a populated one.
 */
import { describe, expect, it } from 'vitest';

import * as schemas from './schemas';

describe('interaction add-frame schema — server_verified', () => {
  const base = {
    interaction_id: 'q1',
    group_id: 'g1',
    answer_format: 'external',
    question: 'Approve the deploy',
    created_at: '2026-07-04T00:00:00Z',
    timeout_at: '2026-07-04T00:05:00Z',
  };

  it('accepts a frame carrying server_verified: true', () => {
    const parsed = schemas.interaction.parse({ ...base, server_verified: true });
    expect(parsed.server_verified).toBe(true);
  });

  it('leaves server_verified undefined when the frame omits it', () => {
    const parsed = schemas.interaction.parse(base);
    expect(parsed.server_verified).toBeUndefined();
  });

  it('rejects a non-boolean server_verified', () => {
    expect(() => schemas.interaction.parse({ ...base, server_verified: 'yes' })).toThrow();
  });
});

describe('interaction add-frame schema — channel', () => {
  const base = {
    interaction_id: 'q1',
    group_id: 'g1',
    answer_format: 'text',
    question: 'Reply on your phone',
    created_at: '2026-07-11T00:00:00Z',
    timeout_at: '2026-07-11T00:05:00Z',
  };

  it('surfaces the channel name when the frame carries one', () => {
    const parsed = schemas.interaction.parse({ ...base, channel: 'telegram' });
    expect(parsed.channel).toBe('telegram');
  });

  it('leaves channel undefined when the frame omits it', () => {
    const parsed = schemas.interaction.parse(base);
    expect(parsed.channel).toBeUndefined();
  });

  it('rejects a non-string channel', () => {
    expect(() => schemas.interaction.parse({ ...base, channel: 7 })).toThrow();
  });
});

describe('interaction add-frame schema — media (loose wire field)', () => {
  const base = {
    interaction_id: 'q1',
    group_id: 'g1',
    answer_format: 'select',
    question: 'Which product?',
    created_at: '2026-07-17T00:00:00Z',
    timeout_at: '2026-07-17T00:05:00Z',
  };

  it('leaves media undefined when the frame omits it', () => {
    expect(schemas.interaction.parse(base).media).toBeUndefined();
  });

  it('carries the media array through unparsed at the item level (items stay unknown)', () => {
    // The wire field is loose (`z.array(z.unknown())`): a hostile/partial item does
    // NOT fail the whole frame parse — per-item validation happens in the renderer.
    const parsed = schemas.interaction.parse({
      ...base,
      media: [{ kind: 'image', url: 'https://x/y.png' }, { junk: true }],
    });
    expect(parsed.media).toHaveLength(2);
  });

  it('rejects a present non-array media (a gross frame malformation)', () => {
    expect(() => schemas.interaction.parse({ ...base, media: 'not-an-array' })).toThrow();
  });
});

describe('interactionMediaItem schema — applied per item by the renderer', () => {
  it('accepts an image item with an omitted caption', () => {
    const parsed = schemas.interactionMediaItem.parse({ kind: 'image', url: 'https://x/y.png' });
    expect(parsed.kind).toBe('image');
    expect(parsed.caption).toBeUndefined();
  });

  it('accepts a link item with an explicit null caption (nullish, not optional)', () => {
    const parsed = schemas.interactionMediaItem.parse({
      kind: 'link',
      url: 'https://x',
      caption: null,
    });
    expect(parsed.caption).toBeNull();
  });

  it('accepts a caption string', () => {
    const parsed = schemas.interactionMediaItem.parse({
      kind: 'image',
      url: 'data:image/png;base64,AAAA',
      caption: 'A widget',
    });
    expect(parsed.caption).toBe('A widget');
  });

  it('rejects an unknown kind, a missing url, and a non-string url', () => {
    expect(() => schemas.interactionMediaItem.parse({ kind: 'video', url: 'https://x' })).toThrow();
    expect(() => schemas.interactionMediaItem.parse({ kind: 'image' })).toThrow();
    expect(() => schemas.interactionMediaItem.parse({ kind: 'image', url: 42 })).toThrow();
  });
});

describe('channels schema', () => {
  it('accepts an empty and a populated catalog', () => {
    expect(schemas.channels.parse({ channels: [] }).channels).toEqual([]);
    expect(schemas.channels.parse({ channels: ['telegram'] }).channels).toEqual(['telegram']);
  });

  it('rejects a non-array / non-string member', () => {
    expect(() => schemas.channels.parse({ channels: 'telegram' })).toThrow();
    expect(() => schemas.channels.parse({ channels: [1] })).toThrow();
  });
});

describe('notifications schema', () => {
  const record = {
    id: 'n1',
    message: 'Backup completed',
    recipient: 'ops',
    created_at: '2026-07-11T00:00:00Z',
  };

  it('accepts a record with a string or null recipient', () => {
    expect(schemas.notifications.parse({ notifications: [record] }).notifications[0]?.id).toBe(
      'n1',
    );
    expect(
      schemas.notifications.parse({ notifications: [{ ...record, recipient: null }] })
        .notifications[0]?.recipient,
    ).toBeNull();
  });

  it('accepts an empty feed', () => {
    expect(schemas.notifications.parse({ notifications: [] }).notifications).toEqual([]);
  });

  it('rejects a record missing a required field', () => {
    const { message: _dropped, ...broken } = record;
    expect(() => schemas.notifications.parse({ notifications: [broken] })).toThrow();
  });
});

describe('hookList schema — topic_verifiers', () => {
  it('accepts a response with a populated topic_verifiers map', () => {
    const parsed = schemas.hookList.parse({
      items: [],
      total: 0,
      topic_verifiers: {
        'orders.created': { verifier: 'hmac-sha256', config: { secret_env: 'ORDERS_SECRET' } },
      },
    });
    expect(parsed.topic_verifiers['orders.created']?.verifier).toBe('hmac-sha256');
    expect(parsed.topic_verifiers['orders.created']?.config).toEqual({
      secret_env: 'ORDERS_SECRET',
    });
  });

  it('defaults topic_verifiers to {} when the response omits it', () => {
    const parsed = schemas.hookList.parse({ items: [], total: 0 });
    expect(parsed.topic_verifiers).toEqual({});
  });
});

describe('toolMediaResult schema — direct-run media wire object', () => {
  const image = {
    type: 'image',
    data: 'iVBORw0KGgo=',
    mimeType: 'image/png',
  };

  it('accepts an image content object with an image/* mime', () => {
    const parsed = schemas.toolMediaResult.parse(image);
    expect(parsed.type).toBe('image');
    expect(parsed.mimeType).toBe('image/png');
  });

  it('accepts an audio content object with an audio/* mime', () => {
    const parsed = schemas.toolMediaResult.parse({
      type: 'audio',
      data: 'SUQzBA==',
      mimeType: 'audio/mpeg',
    });
    expect(parsed.type).toBe('audio');
  });

  it('rejects (loudly) an image block carrying a non-image mime — the security gate', () => {
    expect(() => schemas.toolMediaResult.parse({ ...image, mimeType: 'text/html' })).toThrow();
  });

  it('rejects (loudly) a media block missing its data field — drift is loud', () => {
    expect(() => schemas.toolMediaResult.parse({ type: 'image', mimeType: 'image/png' })).toThrow();
  });

  it('rejects an unknown media type', () => {
    expect(() =>
      schemas.toolMediaResult.parse({ type: 'video', data: 'x', mimeType: 'video/mp4' }),
    ).toThrow();
  });
});

describe('route catalog + public-pin schemas', () => {
  it('parses a route catalog row with a scope id, the public marker, or null', () => {
    const parsed = schemas.authRoutes.parse([
      { path: '/a', methods: ['GET', 'POST'], mapped: 's1' },
      { path: '/b', methods: ['GET'], mapped: 'public' },
      { path: '/c', methods: [], mapped: null },
    ]);
    expect(parsed[0]?.mapped).toBe('s1');
    expect(parsed[1]?.mapped).toBe('public');
    expect(parsed[2]?.mapped).toBeNull();
    expect(parsed[0]?.methods).toEqual(['GET', 'POST']);
  });

  it('rejects (loudly) a route row whose mapped is a non-string, non-null value', () => {
    expect(() => schemas.authRoutes.parse([{ path: '/a', methods: ['GET'], mapped: 5 }])).toThrow();
  });

  it('parses the public-routes list and the pin/unpin results', () => {
    expect(schemas.publicRoutes.parse(['/x', '/y'])).toEqual(['/x', '/y']);
    expect(schemas.pinPublicResult.parse({ url: '/x' })).toEqual({ url: '/x' });
    expect(schemas.unpinPublicResult.parse({ url: '/x' })).toEqual({ url: '/x' });
  });
});

describe('configMode schema — read_only default', () => {
  it('parses the REAL skeleton response (config_mode only) and defaults read_only to false', () => {
    // This is EXACTLY what `GET /api/config/mode` (routers/config.py:read_mode)
    // returns: `{ config_mode }` with no read_only. Requiring read_only would make
    // every real getConfigMode() throw ApiSchemaError — this pins that it does not.
    const parsed = schemas.configMode.parse({ config_mode: 'file' });
    expect(parsed.config_mode).toBe('file');
    expect(parsed.read_only).toBe(false);
  });

  it('honors an explicit read_only: true when a deployment opts in', () => {
    const parsed = schemas.configMode.parse({ config_mode: 'k8s', read_only: true });
    expect(parsed.read_only).toBe(true);
  });

  it('rejects (loudly) a non-boolean read_only', () => {
    expect(() => schemas.configMode.parse({ config_mode: 'file', read_only: 'yes' })).toThrow();
  });

  it('rejects (loudly) a response missing config_mode', () => {
    // config_mode is the one required field; only read_only is tolerated-absent. A
    // payload without config_mode is a real backend drift and must throw, not default.
    expect(() => schemas.configMode.parse({ read_only: false })).toThrow();
  });
});

describe('presetRenamed schema', () => {
  it('accepts the re-keyed record identity', () => {
    const parsed = schemas.presetRenamed.parse({
      name: 'london_weather',
      renamed_from: 'paris_weather',
      active_version: 3,
    });
    expect(parsed).toEqual({
      name: 'london_weather',
      renamed_from: 'paris_weather',
      active_version: 3,
    });
  });

  it('rejects a payload missing a required field or with a wrong type (no silent coerce)', () => {
    expect(() => schemas.presetRenamed.parse({ name: 'x', renamed_from: 'y' })).toThrow();
    expect(() =>
      schemas.presetRenamed.parse({ name: 'x', renamed_from: 'y', active_version: '3' }),
    ).toThrow();
  });
});
