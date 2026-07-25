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
 * status is terminal (`succeeded | failed | lost`). The list GET returns the
 * recent runs for one tool — id/status/timestamps only, never `result`/`error`.
 */
import { z } from 'zod';

import { apiRequest, encodeSegment } from './http';
import type { ApiConfig } from './http';

/** A run's lifecycle state. `lost` = the server restarted mid-run; the result is
 * unrecoverable. `running` is the only non-terminal state. */
export const toolRunStatus = z.enum(['running', 'succeeded', 'failed', 'lost']);

/** `POST /api/tool-runs` → the handle for the detached run. */
export const toolRunSubmitResult = z.object({
  run_id: z.string(),
});

/** `GET /api/tool-runs/{run_id}` → the full record. `result` is arbitrary JSON
 * (present only on `succeeded`); `error` is present only on `failed`. */
export const toolRunRecord = z.object({
  run_id: z.string(),
  tool_name: z.string(),
  status: toolRunStatus,
  started_at: z.string(),
  finished_at: z.string().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
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

export type ToolRunStatus = z.infer<typeof toolRunStatus>;
export type ToolRunSubmitResult = z.infer<typeof toolRunSubmitResult>;
export type ToolRunRecord = z.infer<typeof toolRunRecord>;
export type ToolRunListItem = z.infer<typeof toolRunListItem>;

/** Body for `POST /api/tool-runs`. */
export interface SubmitToolRunArgs {
  readonly tool_name: string;
  readonly arguments?: Record<string, unknown>;
}

/** Submit a tool for detached background execution; resolves with its `run_id`. */
export function submitToolRun(
  config: ApiConfig,
  args: SubmitToolRunArgs,
  signal?: AbortSignal,
): Promise<ToolRunSubmitResult> {
  return apiRequest(config, '/api/tool-runs', toolRunSubmitResult, {
    method: 'POST',
    body: { tool_name: args.tool_name, arguments: args.arguments ?? {} },
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
