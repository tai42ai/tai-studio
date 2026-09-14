/** Tool catalog, run, live-registry admin and tag sub-client. */
import * as s from '../schemas';
import { encodeSegment } from '../http';
import { getToolRun, listToolRuns, submitToolRun, type SubmitToolRunArgs } from '../tool-runs';
import type { Transport } from './transport';

export interface RunToolArgs {
  readonly tool: string;
  readonly kwargs?: Record<string, unknown>;
}

/**
 * Identify one app tool for a live-registry op (`POST /api/tools/reload`,
 * `POST /api/tools/remove`): its `kind` (the reloader kind a plugin registered,
 * e.g. `example_tool`) and `name`. `targets` optionally restricts the fleet
 * fan-out to specific workers; omit it to reach every worker.
 */
export interface ToolAdminArgs {
  readonly kind: string;
  readonly name: string;
  readonly targets?: string[];
}

export function toolsClient(t: Transport) {
  const { config, req } = t;
  return {
    listTools: (signal?: AbortSignal) => req('/api/tools', s.toolNames, { signal }),
    getToolSchema: (name: string, signal?: AbortSignal) =>
      req(`/api/tools/${encodeSegment(name)}/schema`, s.toolSchema, { signal }),
    getAllToolSchemas: (signal?: AbortSignal) =>
      req('/api/tools-schema', s.allToolSchemas, { signal }),
    runTool: (args: RunToolArgs, signal?: AbortSignal) =>
      req('/api/run-tool', s.runToolResult, {
        method: 'POST',
        // The backend's `/api/run-tool` door reads `{tool_name, arguments}` (the
        // shape `read_tool_call` enforces and the background `/api/tool-runs`
        // submit already sends). The SPA keeps `tool`/`kwargs` as its ergonomic
        // arg names; map them onto the wire fields here.
        body: { tool_name: args.tool, arguments: args.kwargs ?? {} },
        signal,
      }),

    // Re-register or remove one app tool by kind+name, applied on this worker and
    // broadcast to the fleet (all workers, or only `targets`); both return the bare
    // per-worker `fleetResult` the shared fleet-report handler renders. Both are
    // fenced + destructive server-side, so a refusal surfaces as a loud error.
    reloadTool: (args: ToolAdminArgs) =>
      req('/api/tools/reload', s.fleetResult, {
        method: 'POST',
        body: { kind: args.kind, name: args.name, targets: args.targets ?? null },
      }),
    removeTool: (args: ToolAdminArgs) =>
      req('/api/tools/remove', s.fleetResult, {
        method: 'POST',
        body: { kind: args.kind, name: args.name, targets: args.targets ?? null },
      }),

    submitToolRun: (args: SubmitToolRunArgs, signal?: AbortSignal) =>
      submitToolRun(config, args, signal),
    getToolRun: (runId: string, signal?: AbortSignal) => getToolRun(config, runId, signal),
    listToolRuns: (toolName: string, signal?: AbortSignal) =>
      listToolRuns(config, toolName, signal),

    listToolTags: (signal?: AbortSignal) => req('/api/tools/tags', s.toolTags, { signal }),
  };
}
