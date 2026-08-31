/**
 * The agents transport: the `GET /api/agents` list schema and the
 * `POST /api/agents/{name}/runs` streaming run, plus the zod discriminated union
 * over the agent `StreamEvent` taxonomy.
 *
 * This is a SELF-CONTAINED api-client module (its own zod, not the shared
 * `schemas.ts`), so the agents feature owns its wire types end to end. The
 * `createApiClient` object wires two thin methods onto it (`listAgents`,
 * `streamAgentRun`) since only it holds the `ApiConfig` (base URL + auth token).
 *
 * Frame discriminator: every event carries a stable `type`, which is also the
 * client's switch. A frame whose `type` is unknown (a newer server event) is
 * NEVER dropped — it is surfaced as an `unknown` parsed event so the UI can show
 * it verbatim; a malformed frame is surfaced the same way rather than crashing
 * the stream.
 */
import { z } from 'zod';

import { ApiError, ApiUnauthorizedError } from './errors';
import { encodeSegment, extractError, type ApiConfig } from './http';
import { SseFrameParser, readSseFrames, sseOpenToken, type SseFrame } from './sse';

// -- list schema -------------------------------------------------------------

/** One registered agent as `GET /api/agents` returns it. */
export const agentSummary = z.object({
  name: z.string(),
  description: z.string().default(''),
  tool_name: z.string(),
  // The agent's `ToolInput` JSON schema (the same schema its run tool exposes).
  input_schema: z.record(z.string(), z.unknown()).default({}),
  // The agent's own authorability marker (read, never inferred): `true` means its
  // `ToolInput` accepts the composable spec fields and it can be authored into a
  // versioned agent. A code role-agent reports `false`. The same item shape is
  // returned by `GET /api/agents/spec-runnable`, filtered to the `true` rows.
  spec_runnable: z.boolean().default(false),
});

export const agentList = z.object({
  items: z.array(agentSummary),
  total: z.number(),
});

export type AgentSummary = z.infer<typeof agentSummary>;

// -- event union (mirrors the contract StreamEvent taxonomy) -----------------

const reasoningStep = z.object({
  type: z.literal('reasoning_step'),
  final: z.boolean().default(false),
  text: z.string(),
});
const toolCallStep = z.object({
  type: z.literal('tool_call_step'),
  final: z.boolean().default(false),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
  call_id: z.string(),
});
const toolResultStep = z.object({
  type: z.literal('tool_result_step'),
  final: z.boolean().default(false),
  tool: z.string(),
  call_id: z.string(),
  result: z.unknown(),
  is_error: z.boolean().default(false),
});
const messageDelta = z.object({
  type: z.literal('message_delta'),
  final: z.boolean().default(false),
  text: z.string(),
});
const messageFinal = z.object({
  type: z.literal('message_final'),
  final: z.boolean().default(true),
  text: z.string(),
});
const runUsage = z.object({
  type: z.literal('run_usage'),
  final: z.boolean().default(false),
  input_tokens: z.number().nullable().default(null),
  output_tokens: z.number().nullable().default(null),
  total_tokens: z.number().nullable().default(null),
  model: z.string().nullable().default(null),
});
const structuredFinal = z.object({
  type: z.literal('structured_final'),
  final: z.boolean().default(true),
  data: z.unknown(),
});
const interruptFinal = z.object({
  type: z.literal('interrupt_final'),
  final: z.boolean().default(true),
  interrupt_id: z.string(),
  payload: z.unknown(),
  reason: z.string().nullable().default(null),
});
// The two SSE-layer terminal frames the run route emits (not contract events).
const streamEnd = z.object({ type: z.literal('stream.end') });
const streamError = z.object({ type: z.literal('stream.error'), message: z.string() });

/** The discriminated union of every KNOWN agent frame. */
export const agentEventSchema = z.discriminatedUnion('type', [
  reasoningStep,
  toolCallStep,
  toolResultStep,
  messageDelta,
  messageFinal,
  runUsage,
  structuredFinal,
  interruptFinal,
  streamEnd,
  streamError,
]);

/** A known, validated agent frame. */
export type AgentEvent = z.infer<typeof agentEventSchema>;

/**
 * A frame the client could not validate against a known event — an unrecognized
 * `type` (forward-compat) or a malformed payload. It is kept, never dropped, so
 * the UI renders it visibly as a labeled raw row.
 */
export interface UnknownAgentEvent {
  readonly type: string;
  readonly raw: unknown;
}

/** The result of parsing one SSE frame: a known event or an `unknown` fallback. */
export type ParsedAgentEvent =
  | { readonly known: true; readonly event: AgentEvent }
  | { readonly known: false; readonly unknown: UnknownAgentEvent };

/**
 * Parse one SSE frame's `data` into a typed event. Unparseable JSON, a
 * non-object payload, an unknown `type`, or a payload that fails its schema all
 * resolve to an `unknown` fallback (visible, never silently skipped) rather than
 * throwing and tearing down the stream.
 */
export function parseAgentFrame(frame: SseFrame): ParsedAgentEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    return { known: false, unknown: { type: '(unparseable)', raw: frame.data } };
  }
  const result = agentEventSchema.safeParse(payload);
  if (result.success) return { known: true, event: result.data };
  const rawType =
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { type?: unknown }).type === 'string'
      ? (payload as { type: string }).type
      : '(unknown)';
  return { known: false, unknown: { type: rawType, raw: payload } };
}

// -- streaming run -----------------------------------------------------------

async function* parseFrames(frames: AsyncGenerator<SseFrame>): AsyncGenerator<ParsedAgentEvent> {
  for await (const frame of frames) {
    yield parseAgentFrame(frame);
  }
}

/**
 * Open an authed agent-run SSE stream over `fetch` + `ReadableStream` (never
 * `EventSource`, which cannot send the auth header). The POST body is the run
 * input; a non-2xx open throws loudly (a body that parsed to zero frames would
 * otherwise look like a silently-empty run). Aborting `signal` closes the stream,
 * which the server treats as a disconnect and cancels the run. The path is the
 * ONLY difference between a plain-agent run and an authored-agent run, so both
 * faces share this opener.
 */
async function openAgentStream(
  config: ApiConfig,
  path: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<AsyncGenerator<ParsedAgentEvent>> {
  const doFetch = config.fetch ?? globalThis.fetch;
  const token = config.getToken();
  const headers: Record<string, string> = {
    accept: 'text/event-stream',
    'content-type': 'application/json',
  };
  if (token) headers['x-api-key'] = token;
  // Distinct-URL per open — see the canonical constraint on `sseOpenToken`.
  const url = `${config.baseUrl ?? ''}${path}?_=${sseOpenToken()}`;
  const response = await doFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
    signal,
  });
  if (response.status === 401) throw new ApiUnauthorizedError();
  if (!response.ok) {
    // Read the `{ "error" }` envelope so a load-bearing server message (e.g. an
    // authored-run "cannot override the fixed field ..." 400) surfaces verbatim
    // instead of collapsing to the bare status text. Both run doors share this
    // opener, so both surface the server's message.
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(response.statusText || 'agent run failed', response.status);
    }
    const { message, code } = extractError(payload);
    throw new ApiError(
      message ?? (response.statusText || 'agent run failed'),
      response.status,
      code,
    );
  }
  return parseFrames(readSseFrames(response, signal));
}

/** Stream a plain registered agent's run (`POST /api/agents/{name}/runs`). */
export async function streamAgentRun(
  config: ApiConfig,
  name: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<AsyncGenerator<ParsedAgentEvent>> {
  return openAgentStream(config, `/api/agents/${encodeSegment(name)}/runs`, input, signal);
}

/**
 * Stream an AUTHORED agent's run (`POST /api/agents/authored/{name}/runs`). Same
 * SSE framing as `streamAgentRun`; the baked spec is resolved server-side, so the
 * POST body carries ONLY the non-baked `ToolInput` fields (the actual query/user
 * input). Naming a baked field is a loud server 400, surfaced by the caller.
 */
export async function streamAuthoredAgentRun(
  config: ApiConfig,
  name: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<AsyncGenerator<ParsedAgentEvent>> {
  return openAgentStream(config, `/api/agents/authored/${encodeSegment(name)}/runs`, input, signal);
}

/**
 * Parse a whole hand-authored SSE transcript into its ordered parsed events.
 * Reuses the wire `SseFrameParser`, so a test fixture exercises the real
 * frame-splitting + event-parsing path end to end.
 */
export function parseAgentTranscript(transcript: string): ParsedAgentEvent[] {
  return new SseFrameParser().push(transcript).map(parseAgentFrame);
}
