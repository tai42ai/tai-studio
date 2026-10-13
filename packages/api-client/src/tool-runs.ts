/**
 * Background tool-runs transport — the `/api/tool-runs*` surface.
 *
 * This is a SELF-CONTAINED api-client module (its own zod, not the shared
 * `schemas.ts`), so the tools feature owns these wire types end to end. The
 * `createApiClient` object wires three thin methods onto it (`submitToolRun`,
 * `getToolRun`, `listToolRuns`) since only it holds the `ApiConfig` (base URL +
 * auth token).
 *
 * The background surface detaches a run from its HTTP request: submit returns a
 * `run_id` immediately (202), then the caller POLLS the single-run GET until the
 * status is terminal (`succeeded | failed | lost | parked`). The list GET returns
 * the recent runs for one tool — id/status/timestamps only, never `result`/`error`.
 */
import { z } from 'zod';

import { apiRoutes, buildPath } from './generated/api-routes';
import {
  runAsksAnswer,
  runParkedAnswer,
  toolRunListItem as generatedToolRunListItem,
  toolRunView,
} from './generated/openapi-schemas';
import type { ApiConfig } from './http';
import { apiRequest } from './http';
import type { StateSubject } from './schemas/states';

/** A run's lifecycle state. `lost` = the server restarted mid-run; the result is
 * unrecoverable. `parked` = the run's tool async-parked; its `result` is the park
 * answer (see {@link toolRunParkAnswer}). `running` is the only non-terminal state. */
export const toolRunStatus = z.enum(['running', 'succeeded', 'failed', 'lost', 'parked']);

/** `POST /api/tool-runs` → the handle for the detached run. */
export const toolRunSubmitResult = z.object({
  run_id: z.string(),
});

/**
 * The `result` a `parked` record carries: the run answer the synchronous run-tool door
 * returns, restricted to its two park kinds — `asks` (the tool asked its CALLER and parked)
 * or `parked` (only USER asks remain).
 */
export const toolRunParkAnswer = z.discriminatedUnion('kind', [runAsksAnswer, runParkedAnswer]);

/**
 * `GET /api/tool-runs/{run_id}` → the full record, the published `ToolRunView` narrowed by
 * `status` into one variant per lifecycle state. `result` is the tool's own value on
 * `succeeded` and, on `parked`, the park answer ({@link toolRunParkAnswer}) parsed here so a
 * reader switches on its `kind`; a parked record whose stored answer is not one of the two park
 * kinds is refused on the read. `error` carries a `failed` run's message; `outcome` is set only
 * on a `failed` record whose run reached a failed terminal: the run's outcome, whole, as the
 * sync door delivers it (`error` is then the plain `tool run failed`). `resumed_interactions` is
 * the parked interaction ids the run resumed or took while it executed (`[]` when it resumed
 * none).
 */
export const toolRunRecord = z.discriminatedUnion('status', [
  toolRunView.extend({ status: z.literal('running') }),
  toolRunView.extend({ status: z.literal('succeeded') }),
  toolRunView.extend({ status: z.literal('failed') }),
  toolRunView.extend({ status: z.literal('lost') }),
  toolRunView.extend({ status: z.literal('parked'), result: toolRunParkAnswer }),
]);

/** One entry of `GET /api/tool-runs?tool_name=...` — the published list row (id, status,
 * timestamps; never `result`/`error`, the list is not secret-bearing), its `status` narrowed to
 * the lifecycle states. */
export const toolRunListItem = generatedToolRunListItem.extend({ status: toolRunStatus });

export const toolRunList = z.array(toolRunListItem);

export type ToolRunStatus = z.infer<typeof toolRunStatus>;
export type ToolRunParkAnswer = z.infer<typeof toolRunParkAnswer>;
export type ToolRunSubmitResult = z.infer<typeof toolRunSubmitResult>;
export type ToolRunRecord = z.infer<typeof toolRunRecord>;
export type ToolRunListItem = z.infer<typeof toolRunListItem>;

/** Body for `POST /api/tool-runs`. */
export interface SubmitToolRunArgs {
  readonly tool_name: string;
  readonly arguments?: Record<string, unknown>;
  /** The addressed subject an async park of the detached run indexes under. Omitted
   * from the request body when unset. */
  readonly subject?: StateSubject;
}

/** Submit a tool for detached background execution; resolves with its `run_id`. */
export function submitToolRun(
  config: ApiConfig,
  args: SubmitToolRunArgs,
  signal?: AbortSignal,
): Promise<ToolRunSubmitResult> {
  return apiRequest(config, apiRoutes.post_api_tool_runs.path, toolRunSubmitResult, {
    method: 'POST',
    body: {
      tool_name: args.tool_name,
      arguments: args.arguments ?? {},
      ...(args.subject !== undefined ? { subject: args.subject } : {}),
    },
    signal,
  });
}

/** Read one background run's current record (the poll target). */
export function getToolRun(
  config: ApiConfig,
  runId: string,
  signal?: AbortSignal,
): Promise<ToolRunRecord> {
  return apiRequest(
    config,
    buildPath(apiRoutes.get_api_tool_runs_run_id.path, { run_id: runId }),
    toolRunRecord,
    {
      signal,
    },
  );
}

/** List the recent background runs for one tool (newest first). */
export function listToolRuns(
  config: ApiConfig,
  toolName: string,
  signal?: AbortSignal,
): Promise<ToolRunListItem[]> {
  return apiRequest(config, apiRoutes.get_api_tool_runs.path, toolRunList, {
    query: { tool_name: toolName },
    signal,
  });
}

/** Whether a run has reached a terminal state (polling stops here). */
export function isTerminalRunStatus(status: ToolRunStatus): boolean {
  return status !== 'running';
}
