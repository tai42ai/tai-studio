import { describe, expect, it } from 'vitest';

import { SseFrameParser } from './sse';

describe('SseFrameParser', () => {
  it('parses a single complete frame', () => {
    const p = new SseFrameParser();
    const frames = p.push('event: interaction.add\ndata: {"interaction_id":"1"}\n\n');
    expect(frames).toEqual([{ event: 'interaction.add', data: '{"interaction_id":"1"}' }]);
  });

  it('assembles a frame split across chunks', () => {
    const p = new SseFrameParser();
    expect(p.push('event: interaction.add\nda')).toEqual([]);
    expect(p.push('ta: {"interaction_id":"1"}\n\n')).toEqual([
      { event: 'interaction.add', data: '{"interaction_id":"1"}' },
    ]);
  });

  it('joins multi-line data fields', () => {
    const p = new SseFrameParser();
    const frames = p.push('data: line1\ndata: line2\n\n');
    expect(frames[0]?.data).toBe('line1\nline2');
  });

  it('handles CRLF frame separators', () => {
    const p = new SseFrameParser();
    const frames = p.push('event: x\r\ndata: y\r\n\r\n');
    expect(frames).toEqual([{ event: 'x', data: 'y' }]);
  });

  it('emits multiple frames from one chunk and strips the leading data space', () => {
    const p = new SseFrameParser();
    const frames = p.push('data: a\n\ndata: b\n\n');
    expect(frames.map((f) => f.data)).toEqual(['a', 'b']);
  });

  it('ignores comment lines', () => {
    const p = new SseFrameParser();
    const frames = p.push(': keep-alive\ndata: real\n\n');
    expect(frames).toEqual([{ event: 'message', data: 'real' }]);
  });
});
