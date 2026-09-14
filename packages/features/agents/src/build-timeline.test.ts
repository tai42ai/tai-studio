import { describe, expect, it } from 'vitest';

import { buildTimeline } from './build-timeline';
import {
  ERROR_TRANSCRIPT,
  FULL_TRANSCRIPT,
  INTERLEAVED_DELTA_TRANSCRIPT,
  UNKNOWN_TRANSCRIPT,
  UNMATCHED_RESULT_TRANSCRIPT,
  parse,
} from './fixtures';

describe('buildTimeline', () => {
  it('accumulates message deltas into one bubble that the final settles', () => {
    const { items } = buildTimeline(parse(FULL_TRANSCRIPT));
    const messages = items.filter((item) => item.kind === 'message');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ text: 'Here you go', settled: true });
  });

  it('pairs a tool result onto its call by call_id', () => {
    const { items } = buildTimeline(parse(FULL_TRANSCRIPT));
    const tool = items.find((item) => item.kind === 'tool');
    expect(tool).toMatchObject({ callId: 'c1', hasResult: true, result: { hits: 2 } });
    // Exactly one tool item — the result folded into the call, not a second row.
    expect(items.filter((item) => item.kind === 'tool')).toHaveLength(1);
  });

  it('keeps an unmatched tool result as a standalone item, never dropped', () => {
    const { items } = buildTimeline(parse(UNMATCHED_RESULT_TRANSCRIPT));
    const tool = items.find((item) => item.kind === 'tool');
    expect(tool).toMatchObject({ callId: 'zz', hasResult: true, result: 'lonely' });
  });

  it('settles finished on stream.end and errored on stream.error', () => {
    expect(buildTimeline(parse(FULL_TRANSCRIPT))).toMatchObject({ finished: true, errored: false });
    expect(buildTimeline(parse(ERROR_TRANSCRIPT))).toMatchObject({ finished: true, errored: true });
  });

  it('keeps an unknown event type as a labeled raw item', () => {
    const { items } = buildTimeline(parse(UNKNOWN_TRANSCRIPT));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'unknown', type: 'future_thing' });
  });

  it('settles the open bubble when an event interleaves between deltas of a turn', () => {
    const { items } = buildTimeline(parse(INTERLEAVED_DELTA_TRANSCRIPT));
    const relevant = items.filter((item) => item.kind === 'message' || item.kind === 'tool');
    expect(relevant.map((item) => item.kind)).toEqual(['message', 'tool', 'message']);
    // The first delta is flushed in order (settled) before the tool; the second
    // delta starts a fresh bubble rather than merging into 'First'.
    expect(relevant[0]).toMatchObject({ kind: 'message', text: 'First', settled: true });
    expect(relevant[2]).toMatchObject({ kind: 'message', text: 'Second' });
  });
});
