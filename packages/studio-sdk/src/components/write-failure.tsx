/**
 * `WriteFailure` — the failure of a write, read through the client that raised it. A
 * refusal because the answering worker holds no listing for an MCP server the write must
 * check (its start still in progress, or the server not loaded there) shows as
 * `McpListingRefusal`; any other failure shows its message in the loud `ErrorState`.
 */
import type { ReactNode } from 'react';

import { errorMessage } from '../errors';
import { useApi } from '../hooks/useApi';
import { McpListingRefusal, mcpListingRefusalOf } from './mcp-listing-refusal';
import { ErrorState } from './primitives';

export interface WriteFailureProps {
  /** The rejected value of the write. */
  readonly error: unknown;
}

export function WriteFailure({ error }: WriteFailureProps): ReactNode {
  const api = useApi();
  const message = errorMessage(error);
  const refusal = mcpListingRefusalOf(api, error);
  if (refusal !== null) return <McpListingRefusal reason={refusal} message={message} />;
  return <ErrorState message={message} />;
}
