/**
 * The generated served-document schemas: they parse a served payload, they reject a
 * body that drifted back to a bare string (the marker guarantee), and the generator
 * detects a drifted bundle (the freshness gate reds on real drift).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The generator is the freshness gate's engine; `generate` is pure (no I/O). Its
// types come from scripts/gen-schemas.d.mts.
import { generate } from '../scripts/gen-schemas.mjs';
import * as schemas from './schemas';
import { templatedText } from './templated-text';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '../contract-schema/contract-schema.json');
const generatedPath = resolve(here, 'generated/served-schemas.ts');
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as {
  contract_version: string;
  documents: Record<string, unknown>;
};

describe('generated served-document schemas parse served payloads', () => {
  it('parses a HookSubject whose key_expr is a templated text', () => {
    const parsed = schemas.hookSubject.parse({
      target_kind: 'tool',
      target_name: 'notes',
      kind: 'thread',
      key_expr: { content: '.thread_id' },
    });
    expect(parsed.key_expr).toEqual({ content: '.thread_id' });
  });

  it('parses a tool ConversationRoute whose payload_expr is a templated text', () => {
    const parsed = schemas.conversationRoute.parse({
      route_name: 'r',
      door: 'api',
      target_kind: 'tool',
      target_name: 't',
      execution_key: 'k',
      execution_key_fingerprint: 'fp',
      payload_expr: { content: '{ message }' },
    });
    expect(parsed.payload_expr).toEqual({ content: '{ message }' });
    // A nullable templated-text field the platform defaults to null is present, not undefined.
    expect(parsed.reply_expr).toBeNull();
  });

  it('defaults a ConversationRoute overlap the payload omits, and keeps a supplied one', () => {
    const base = {
      route_name: 'r',
      door: 'channel',
      target_kind: 'agent',
      target_name: 't',
      execution_key: 'k',
      execution_key_fingerprint: 'fp',
    } as const;
    expect(schemas.conversationRoute.parse(base).overlap).toEqual({
      running: 'continue',
      deliver: 'one',
      settle_seconds: 0,
    });
    expect(
      schemas.conversationRoute.parse({
        ...base,
        overlap: { running: 'cancel', deliver: 'all', settle_seconds: 5 },
      }).overlap,
    ).toEqual({ running: 'cancel', deliver: 'all', settle_seconds: 5 });
  });

  it('makes overlap optional on a ConversationRouteCreate body, defaulting the policy', () => {
    const created = schemas.conversationRouteCreate.parse({
      route_name: 'r',
      door: 'channel',
      target_kind: 'agent',
      target_name: 't',
      execution_key: 'k',
    });
    expect(created.overlap).toEqual({ running: 'continue', deliver: 'one', settle_seconds: 0 });
  });
});

describe('a served body is a templated text, never a bare string (the marker guarantee)', () => {
  it('the shared templatedText is the schema behind a marked field', () => {
    // The exact object the generator maps `x-tai42-templated-text` to.
    expect(
      schemas.hookSubject.parse({
        target_kind: 'tool',
        target_name: 'n',
        kind: 'k',
        key_expr: { id: 'stored-jq' },
      }).key_expr,
    ).toEqual(templatedText.parse({ id: 'stored-jq' }));
  });

  it('rejects a HookSubject whose key_expr regressed to a bare string', () => {
    expect(() =>
      schemas.hookSubject.parse({
        target_kind: 'tool',
        target_name: 'n',
        kind: 'k',
        key_expr: '.thread_id',
      }),
    ).toThrow();
  });

  it('rejects a ConversationRoute whose payload_expr regressed to a bare string', () => {
    expect(() =>
      schemas.conversationRoute.parse({
        route_name: 'r',
        door: 'api',
        target_kind: 'tool',
        target_name: 't',
        execution_key: 'k',
        execution_key_fingerprint: 'fp',
        payload_expr: '{ message }',
      }),
    ).toThrow();
  });
});

describe('the freshness gate reds on a drifted bundle', () => {
  it('the committed generated file matches a fresh generation from the vendored bundle', () => {
    const { source } = generate(bundle);
    expect(readFileSync(generatedPath, 'utf8')).toBe(source);
  });

  it('a bundle whose served shape drifts generates a different file', () => {
    const baseline = generate(bundle).source;
    // Inject drift: a served document field the platform did not publish.
    const drifted = structuredClone(bundle);
    const doc = drifted.documents.ConversationRoute as { properties: Record<string, unknown> };
    doc.properties.injected_field = { type: 'string' };
    expect(generate(drifted).source).not.toBe(baseline);
  });

  it('a body demoted to a bare string generates a different file (the anti-string drift)', () => {
    const baseline = generate(bundle).source;
    const drifted = structuredClone(bundle);
    const doc = drifted.documents.ConversationRoute as { properties: Record<string, unknown> };
    // The platform marker gone: payload_expr as a plain string instead of a $ref to
    // TemplatedText — the exact regression the marker override prevents.
    doc.properties.payload_expr = { type: 'string' };
    const drifted_source = generate(drifted).source;
    expect(drifted_source).not.toBe(baseline);
    expect(drifted_source).toContain('"payload_expr": z.string()');
  });
});
