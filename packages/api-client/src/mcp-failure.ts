/**
 * What the platform says about an MCP server whose start is still in progress. The failed-MCP
 * list (`GET /api/mcp-status` `failed`, and each worker's roster from
 * `GET /api/mcp-status/failed`) holds every server whose tools are not bound, each with a
 * coarse `category`. Every category but `starting` is a failure; `starting` is a start still
 * in progress: the record goes away when the start binds its tools, or turns into a failure
 * category when the start fails. A call that must list such a server's tools (the
 * advertised-tools read, and the check of a write that changes a tool selection) is refused
 * with a retriable `503` whose envelope carries the code `mcp-server-starting`.
 */
import { ApiError } from './errors';

/** The category of a record whose server start is still in progress. */
const STARTING_CATEGORY = 'starting';

/** The envelope `code` of a call refused because a server start is still in progress. */
const STARTING_CODE = 'mcp-server-starting';

/** Whether a failed-MCP record is a server start still in progress rather than a failure. */
export function isMcpStarting(record: { readonly category?: string | undefined }): boolean {
  return record.category === STARTING_CATEGORY;
}

/**
 * Whether `error` is a call refused because the server it had to list is still starting:
 * an `ApiError` whose envelope carries the code `mcp-server-starting`. Any other error,
 * an `ApiError` with another code included, answers `false`.
 */
export const isMcpStartingError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === STARTING_CODE;
