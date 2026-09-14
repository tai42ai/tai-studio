/**
 * The pure fold from the flat parsed-event stream into ordered timeline items.
 *
 * `message_delta`s accumulate into one growing assistant bubble that `message_final`
 * settles; a `tool_result_step` pairs onto its `tool_call_step` by `call_id` (an
 * unmatched result renders standalone, never dropped); every other event maps to its
 * own item, and an UNKNOWN `type` is kept as a labeled raw-JSON row (forward-compat,
 * visible, never silently skipped). Pure — the same input always yields the same
 * items, so it is trivially testable against a fixture.
 */
import type { ParsedAgentEvent } from '@tai42/api-client';

import type { MutableItem, MutableMessage, MutableTool, TimelineFold } from './timeline-model';

/** The known agent event carried by a parsed frame. */
type AgentEvent = Extract<ParsedAgentEvent, { known: true }>['event'];

/** The one-to-one events that each map to a single pushed item. */
type SimpleEvent = Extract<
  AgentEvent,
  { type: 'reasoning_step' | 'run_usage' | 'structured_final' | 'interrupt_final' }
>;

// The mutable accumulator threaded through the fold steps. `message` is the open
// bubble (null when none); `interleavedSinceDelta` is set when a non-message event
// folds while a bubble is open, so the next `message_delta` settles that bubble and
// starts a fresh one rather than merging later deltas out of order.
interface FoldState {
  readonly items: MutableItem[];
  readonly toolByCall: Map<string, MutableTool>;
  message: MutableMessage | null;
  interleavedSinceDelta: boolean;
  finished: boolean;
  errored: boolean;
}

function settleOpenMessage(state: FoldState): void {
  if (state.message) {
    state.message.settled = true;
    state.message = null;
  }
  state.interleavedSinceDelta = false;
}

function foldToolCall(
  state: FoldState,
  event: Extract<AgentEvent, { type: 'tool_call_step' }>,
  id: string,
): void {
  const item: MutableTool = {
    kind: 'tool',
    id,
    tool: event.tool,
    args: event.args,
    callId: event.call_id,
    hasResult: false,
    result: undefined,
    isError: false,
  };
  state.items.push(item);
  state.toolByCall.set(event.call_id, item);
}

function foldToolResult(
  state: FoldState,
  event: Extract<AgentEvent, { type: 'tool_result_step' }>,
  id: string,
): void {
  const call = state.toolByCall.get(event.call_id);
  if (call) {
    call.hasResult = true;
    call.result = event.result;
    call.isError = event.is_error;
    state.toolByCall.delete(event.call_id);
    return;
  }
  // An unmatched result still renders — as a standalone tool item with no preceding
  // call — rather than being dropped.
  state.items.push({
    kind: 'tool',
    id,
    tool: event.tool,
    args: {},
    callId: event.call_id,
    hasResult: true,
    result: event.result,
    isError: event.is_error,
  });
}

function foldMessageDelta(
  state: FoldState,
  event: Extract<AgentEvent, { type: 'message_delta' }>,
  id: string,
): void {
  if (state.message && !state.interleavedSinceDelta) {
    state.message.text += event.text;
    return;
  }
  // No open bubble, or an event interleaved since the last delta: settle the prior
  // bubble (if any) in order and start a fresh one.
  settleOpenMessage(state);
  const message: MutableMessage = { kind: 'message', id, text: event.text, settled: false };
  state.message = message;
  state.items.push(message);
}

function foldMessageFinal(
  state: FoldState,
  event: Extract<AgentEvent, { type: 'message_final' }>,
  id: string,
): void {
  if (state.message) {
    state.message.text = event.text;
    state.message.settled = true;
  } else {
    state.items.push({ kind: 'message', id, text: event.text, settled: true });
  }
  state.message = null;
  state.interleavedSinceDelta = false;
}

/** The one-to-one events: each pushes exactly one item and patches nothing. */
function appendSimpleItem(state: FoldState, event: SimpleEvent, id: string): void {
  switch (event.type) {
    case 'reasoning_step':
      state.items.push({ kind: 'reasoning', id, text: event.text });
      break;
    case 'run_usage':
      state.items.push({
        kind: 'usage',
        id,
        inputTokens: event.input_tokens,
        outputTokens: event.output_tokens,
        totalTokens: event.total_tokens,
        model: event.model,
      });
      break;
    case 'structured_final':
      state.items.push({ kind: 'structured', id, data: event.data });
      break;
    case 'interrupt_final':
      state.items.push({
        kind: 'interrupt',
        id,
        interruptId: event.interrupt_id,
        reason: event.reason,
        payload: event.payload,
      });
      break;
  }
}

/** Dispatch one known event to its fold step. */
function foldKnown(state: FoldState, event: AgentEvent, id: string): void {
  switch (event.type) {
    case 'tool_call_step':
      foldToolCall(state, event, id);
      break;
    case 'tool_result_step':
      foldToolResult(state, event, id);
      break;
    case 'message_delta':
      foldMessageDelta(state, event, id);
      break;
    case 'message_final':
      foldMessageFinal(state, event, id);
      break;
    case 'stream.end':
      state.finished = true;
      break;
    case 'stream.error':
      state.items.push({ kind: 'error', id, message: event.message });
      state.errored = true;
      state.finished = true;
      break;
    default:
      appendSimpleItem(state, event, id);
  }
}

/** Fold one parsed frame (known or unknown) into the accumulator. */
function foldEvent(state: FoldState, parsed: ParsedAgentEvent, index: number): void {
  const id = `evt-${String(index)}`;
  if (!parsed.known) {
    if (state.message) state.interleavedSinceDelta = true;
    state.items.push({ kind: 'unknown', id, type: parsed.unknown.type, raw: parsed.unknown.raw });
    return;
  }
  const event = parsed.event;
  if (state.message && event.type !== 'message_delta' && event.type !== 'message_final') {
    state.interleavedSinceDelta = true;
  }
  foldKnown(state, event, id);
}

/** Fold the ordered parsed events into display items. */
export function buildTimeline(events: ParsedAgentEvent[]): TimelineFold {
  const state: FoldState = {
    items: [],
    toolByCall: new Map<string, MutableTool>(),
    message: null,
    interleavedSinceDelta: false,
    finished: false,
    errored: false,
  };
  events.forEach((parsed, index) => {
    foldEvent(state, parsed, index);
  });
  return { items: state.items, finished: state.finished, errored: state.errored };
}
