/**
 * The inbound-turn key annotations the four door jqs present must mirror the
 * contract's start_expr key catalogue: the same keys, in the same order, so the
 * route editor annotates every field a route jq can read. This guards the hand-kept
 * list against drifting behind the catalogue.
 */
import { describe, expect, it } from 'vitest';

import {
  CANCEL_EXPR_ANNOTATION,
  EXTRAS_EXPR_ANNOTATION,
  RESUME_EXPR_ANNOTATION,
  START_EXPR_ANNOTATION,
} from './route-jq-annotations';

// The contract start_expr key catalogue, in order (tai42_contract conversations routes).
const CATALOGUE_KEYS = [
  'message',
  'sender',
  'our_identity',
  'channel',
  'route',
  'thread_id',
  'person_id',
  'person_addresses',
  'params',
  'form',
  'form_tag',
  'attachments',
  'location',
  'messages',
  'superseded',
  'turn',
  'event',
] as const;

describe('inbound-turn key annotations', () => {
  it('present the full contract key catalogue in order', () => {
    const names = (START_EXPR_ANNOTATION.keys as readonly { name: string }[]).map((k) => k.name);
    expect(names).toEqual([...CATALOGUE_KEYS]);
  });

  it('give every key a non-empty gloss', () => {
    for (const key of START_EXPR_ANNOTATION.keys as readonly { name: string; gloss: string }[]) {
      expect(key.gloss.trim().length).toBeGreaterThan(0);
    }
  });

  it('share one key set across all four door jqs', () => {
    for (const annotation of [
      CANCEL_EXPR_ANNOTATION,
      RESUME_EXPR_ANNOTATION,
      EXTRAS_EXPR_ANNOTATION,
    ]) {
      expect(annotation.keys).toBe(START_EXPR_ANNOTATION.keys);
    }
  });
});
