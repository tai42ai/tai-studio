/** Tool catalog, run, live-registry admin and tag sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import * as s from '../schemas';
import type { StateSubject } from '../schemas/states';
import { getToolRun, listToolRuns, submitToolRun, type SubmitToolRunArgs } from '../tool-runs';
import type { Transport } from './transport';

export interface RunToolArgs {
  readonly tool: string;
  readonly kwargs?: Record<string, unknown>;
  /** The addressed subject an async park of this run indexes under. Omitted from
   * the request body when unset, so a plain run (no subject) parks un-indexed. */
  readonly subject?: StateSubject;
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
    listTools: (signal?: AbortSignal) => req(apiRoutes.get_api_tools.path, s.toolNames, { signal }),
    getToolSchema: (name: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_tools_tool_name_schema.path, { tool_name: name }),
        s.toolSchema,
        { signal },
      ),
    getAllToolSchemas: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_tools_schema.path, s.allToolSchemas, { signal }),
    runTool: (args: RunToolArgs, signal?: AbortSignal) =>
      req(apiRoutes.post_api_run_tool.path, s.runToolResult, {
        method: 'POST',
        // The backend's `/api/run-tool` door reads `{tool_name, arguments, subject}`
        // (the shape `read_tool_call` enforces and the background `/api/tool-runs`
        // submit already sends). The SPA keeps `tool`/`kwargs` as its ergonomic
        // arg names; map them onto the wire fields here. `subject` rides only when
        // set, so a plain run sends no subject.
        body: {
          tool_name: args.tool,
          arguments: args.kwargs ?? {},
          ...(args.subject !== undefined ? { subject: args.subject } : {}),
        },
        signal,
      }),

    // Re-register or remove one app tool by kind+name, applied on this worker and
    // broadcast to the fleet (all workers, or only `targets`); both return the bare
    // per-worker `fleetResult` the shared fleet-report handler renders. Both are
    // fenced + destructive server-side, so a refusal surfaces as a loud error.
    reloadTool: (args: ToolAdminArgs) =>
      req(apiRoutes.post_api_tools_reload.path, s.fleetResult, {
        method: 'POST',
        body: { kind: args.kind, name: args.name, targets: args.targets ?? null },
      }),
    removeTool: (args: ToolAdminArgs) =>
      req(apiRoutes.post_api_tools_remove.path, s.fleetResult, {
        method: 'POST',
        body: { kind: args.kind, name: args.name, targets: args.targets ?? null },
      }),

    submitToolRun: (args: SubmitToolRunArgs, signal?: AbortSignal) =>
      submitToolRun(config, args, signal),
    getToolRun: (runId: string, signal?: AbortSignal) => getToolRun(config, runId, signal),
    listToolRuns: (toolName: string, signal?: AbortSignal) =>
      listToolRuns(config, toolName, signal),

    listToolTags: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_tools_tags.path, s.toolTags, { signal }),
  };
}
