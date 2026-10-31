/**
 * `WriteFailure` — the failure of a write, read through the client that raised it. A
 * refusal that waits for an MCP server still starting shows as `McpStartingRefusal`;
 * any other failure shows its message in the loud `ErrorState`.
 */
import type { ReactNode } from 'react';

import { errorMessage } from '../errors';
import { useApi } from '../hooks/useApi';
import { McpStartingRefusal } from './mcp-starting-refusal';
import { ErrorState } from './primitives';

export interface WriteFailureProps {
  /** The rejected value of the write. */
  readonly error: unknown;
}

export function WriteFailure({ error }: WriteFailureProps): ReactNode {
  const api = useApi();
  const message = errorMessage(error);
  if (api.isMcpStartingError(error)) return <McpStartingRefusal message={message} />;
  return <ErrorState message={message} />;
}
