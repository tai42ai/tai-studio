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

import type { ApiConfig } from './http';
import { apiRequest, encodeSegment } from './http';
import type { StateSubject } from './schemas/states';
import { callerAsksEnvelope, suspendedRunReceipt } from './schemas/tools';

/** A run's lifecycle state. `lost` = the server restarted mid-run; the result is
 * unrecoverable. `parked` = the run's tool async-parked; its `result` is the park
 * answer (see {@link toolRunParkAnswer}). `running` is the only non-terminal state. */
export const toolRunStatus = z.enum(['running', 'succeeded', 'failed', 'lost', 'parked']);

/** `POST /api/tool-runs` → the handle for the detached run. */
export const toolRunSubmitResult = z.object({
  run_id: z.string(),
});

/** `GET /api/tool-runs/{run_id}` → the full record. `result` is arbitrary JSON: the
 * tool's own value on `succeeded`, the park answer ({@link toolRunParkAnswer}) on
 * `parked`. `error` is present only on `failed`. `resumed_interactions` is the parked
 * interaction ids the run resumed or took while it executed (`[]` when it resumed none). */
export const toolRunRecord = z.object({
  run_id: z.string(),
  tool_name: z.string(),
  status: toolRunStatus,
  started_at: z.string(),
  finished_at: z.string().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  resumed_interactions: z.array(z.string()).optional(),
});

/** One entry of `GET /api/tool-runs?tool_name=...` — id/status/timestamps only,
 * deliberately carrying NO `result`/`error` (the list is not secret-bearing). */
export const toolRunListItem = z.object({
  run_id: z.string(),
  tool_name: z.string(),
  status: toolRunStatus,
  started_at: z.string(),
  finished_at: z.string().optional(),
});

export const toolRunList = z.array(toolRunListItem);

/**
 * The `result` a `parked` record carries — the SAME park answer the synchronous run-tool
 * door returns: either the caller-ask envelope `{asks: [...]}` (the tool asked its CALLER
 * and parked) or the suspension receipt (the run parked only USER asks, ids only). A poller
 * reads it to tell a caller-ask park from a user-only one, exactly as the sync door's caller does.
 */
export const toolRunParkAnswer = z.union([callerAsksEnvelope, suspendedRunReceipt]);

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
  return apiRequest(config, '/api/tool-runs', toolRunSubmitResult, {
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
  return apiRequest(config, `/api/tool-runs/${encodeSegment(runId)}`, toolRunRecord, {
    signal,
  });
}

/** List the recent background runs for one tool (newest first). */
export function listToolRuns(
  config: ApiConfig,
  toolName: string,
  signal?: AbortSignal,
): Promise<ToolRunListItem[]> {
  return apiRequest(config, '/api/tool-runs', toolRunList, {
    query: { tool_name: toolName },
    signal,
  });
}

/** Whether a run has reached a terminal state (polling stops here). */
export function isTerminalRunStatus(status: ToolRunStatus): boolean {
  return status !== 'running';
}
