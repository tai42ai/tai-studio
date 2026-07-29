/**
 * The tool RUN contract (decided v1): run-tool is a SYNCHRONOUS POST
 * that holds one HTTP request open until the run completes. The client sets a
 * configurable timeout, driven by an `AbortController`, so a run that never
 * returns cannot pin the panel open forever.
 *
 * Honest limit: v1 has NO run-result retrieval endpoint. If the client timeout
 * fires the request is aborted, but the run may STILL be executing server-side
 * with live side effects — that outcome is a DISTINCT, loud state (see
 * `RunTimeoutError`), never conflated with a generic failure. The distinction
 * lets the operator tell "do not retry — side effects may be live" from
 * "failed — safe to retry".
 */
import type { ApiClient } from '@tai42/studio-sdk';

/** The configurable client-side run timeout. Deployments proxying the skeleton
 * must raise their read timeout above this for interactive tools. */
export const RUN_TIMEOUT_MS = 120_000;

/**
 * Thrown when the client-side timeout aborts a run. Its identity — not its
 * message — is what the panel branches on to show the distinct "still executing
 * server-side" state rather than the generic error surface.
 */
export class RunTimeoutError extends Error {
  constructor() {
    super('The tool run exceeded the client timeout and was disconnected.');
    this.name = 'RunTimeoutError';
  }
}

/**
 * Run a tool with the client timeout applied. Resolves with the completed run's
 * result, or throws: a `RunTimeoutError` when the timeout fired, otherwise the
 * underlying transport error (both surface loudly — never swallowed).
 */
export async function runToolWithTimeout(
  api: ApiClient,
  tool: string,
  kwargs: Record<string, unknown>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    controller.abort();
  }, RUN_TIMEOUT_MS);

  try {
    return await api.runTool({ tool, kwargs }, controller.signal);
  } catch (error) {
    // We own this controller — it is aborted ONLY by the timeout above, so an
    // aborted signal is the unambiguous signal of a client-timeout expiry.
    if (controller.signal.aborted) throw new RunTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
