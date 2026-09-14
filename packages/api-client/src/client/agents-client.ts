/** Agent listing and streaming-run sub-client. */
import { agentList, streamAgentRun, streamAuthoredAgentRun } from '../agents';
import type { Transport } from './transport';

export function agentsClient(t: Transport) {
  const { config, req } = t;
  return {
    listAgents: (signal?: AbortSignal) => req('/api/agents', agentList, { signal }),
    // The authorable subset (agents whose `spec_runnable` is true) — the compose
    // UI's base-agent picker. An empty `items` list ⇒ no authoring is possible.
    listSpecRunnableAgents: (signal?: AbortSignal) =>
      req('/api/agents/spec-runnable', agentList, { signal }),
    // The streaming run: opens POST /api/agents/{name}/runs and yields parsed
    // agent events. The auto-form's built value is the POST body.
    streamAgentRun: (name: string, input: unknown, signal?: AbortSignal) =>
      streamAgentRun(config, name, input, signal),
    // The streaming run of an AUTHORED agent (POST /api/agents/authored/{name}/runs).
    // The body carries only the non-baked ToolInput fields; the baked spec is
    // resolved server-side. Reuses the same SSE parser (never EventSource).
    streamAuthoredAgentRun: (name: string, input: unknown, signal?: AbortSignal) =>
      streamAuthoredAgentRun(config, name, input, signal),
  };
}
