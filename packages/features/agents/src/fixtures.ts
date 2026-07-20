/**
 * Hand-authored SSE run transcripts (the exact wire the run route emits), parsed
 * through the real api-client parser so tests exercise the true frame-splitting +
 * event-validation path. Each frame is `data: <json>` terminated by a blank line;
 * a keep-alive comment is included to prove it is dropped.
 */
import { parseAgentTranscript, type ParsedAgentEvent } from '@tai42/api-client';

export const FULL_TRANSCRIPT =
  'data: {"type":"reasoning_step","text":"let me think"}\n\n' +
  'data: {"type":"tool_call_step","tool":"search","args":{"q":"cats"},"call_id":"c1"}\n\n' +
  ': keepalive\n\n' +
  'data: {"type":"tool_result_step","tool":"search","call_id":"c1","result":{"hits":2}}\n\n' +
  'data: {"type":"message_delta","text":"Here "}\n\n' +
  'data: {"type":"message_delta","text":"you go"}\n\n' +
  'data: {"type":"run_usage","input_tokens":10,"output_tokens":4,"total_tokens":14,"model":"m"}\n\n' +
  'data: {"type":"message_final","text":"Here you go"}\n\n' +
  'data: {"type":"structured_final","data":{"ok":true}}\n\n' +
  'data: {"type":"stream.end"}\n\n';

export const INTERRUPT_TRANSCRIPT =
  'data: {"type":"interrupt_final","interrupt_id":"i1","reason":"needs input","payload":{"q":"?"}}\n\n' +
  'data: {"type":"stream.end"}\n\n';

export const ERROR_TRANSCRIPT =
  'data: {"type":"reasoning_step","text":"oops"}\n\n' +
  'data: {"type":"stream.error","message":"boom"}\n\n';

export const UNKNOWN_TRANSCRIPT = 'data: {"type":"future_thing","note":"hi"}\n\n';

export const UNMATCHED_RESULT_TRANSCRIPT =
  'data: {"type":"tool_result_step","tool":"orphan","call_id":"zz","result":"lonely"}\n\n';

/**
 * A `structured_final` with no `data` and a `tool_result_step` with no `result`
 * — both fields are `z.unknown()` with no default, so an omitted key parses to
 * `undefined`. Pins that the timeline renders `undefined` as printable text
 * rather than passing a non-string into `CodeBlock`.
 */
export const NO_DATA_TRANSCRIPT =
  'data: {"type":"structured_final"}\n\n' +
  'data: {"type":"tool_result_step","tool":"orphan","call_id":"nd"}\n\n' +
  'data: {"type":"stream.end"}\n\n';

export const XSS_TRANSCRIPT =
  'data: {"type":"message_final","text":"<script>alert(1)</script>"}\n\n';

/**
 * A `tool_call_step` interleaved between two `message_delta`s of the same turn
 * with no `message_final` between them. Pins that the first partial bubble is
 * settled in order before the tool, so the second delta starts a fresh bubble
 * instead of folding back into the first — rendering [msg, tool, msg], not merged.
 */
export const INTERLEAVED_DELTA_TRANSCRIPT =
  'data: {"type":"message_delta","text":"First"}\n\n' +
  'data: {"type":"tool_call_step","tool":"search","args":{"q":"cats"},"call_id":"c9"}\n\n' +
  'data: {"type":"message_delta","text":"Second"}\n\n' +
  'data: {"type":"stream.end"}\n\n';

/** No terminal frame — used to keep a run "running" so a Stop/abort can fire. */
export const OPEN_TRANSCRIPT = 'data: {"type":"reasoning_step","text":"working"}\n\n';

export function parse(transcript: string): ParsedAgentEvent[] {
  return parseAgentTranscript(transcript);
}
