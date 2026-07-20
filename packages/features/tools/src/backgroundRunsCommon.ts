/**
 * Shared helpers for the BACKGROUND tool-runs surface.
 *
 * Background runs detach a tool call from its HTTP request: the panel submits to
 * `POST /api/tool-runs`, then POLLS the single-run GET on a fixed interval until
 * the status is terminal. These are the TanStack Query keys, the poll cadence,
 * and the status → Badge-variant / label mapping the run list and detail share.
 */
import type { ToolRunStatus } from '@tai42/api-client';

/** Poll cadence for an in-flight run's single-run GET (stops on a terminal state). */
export const POLL_INTERVAL_MS = 2000;

/** Query key for a tool's recent-runs list. */
export function toolRunsListKey(toolName: string): readonly ['tool-runs', string] {
  return ['tool-runs', toolName];
}

/** Query key for one run's record (the poll target). */
export function toolRunKey(runId: string): readonly ['tool-run', string] {
  return ['tool-run', runId];
}

/** The `Badge` variant that colours each status chip. */
export const STATUS_VARIANT: Record<ToolRunStatus, string> = {
  running: 'primary',
  succeeded: 'success',
  failed: 'danger',
  lost: 'warning',
};

/** The human label for each status chip. */
export const STATUS_LABEL: Record<ToolRunStatus, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  lost: 'Lost',
};
