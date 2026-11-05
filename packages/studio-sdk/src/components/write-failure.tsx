/**
 * `WriteFailure` — the failure of a write, read through the client that raised it. A
 * refusal because the answering worker holds no listing for an MCP server the write must
 * check (its start still in progress, or the server not loaded there) shows as
 * `McpListingRefusal`; any other failure shows its message in the loud `ErrorState`, beside
 * the recycle roll its reply carries.
 */
import type { ReactNode } from 'react';

import { errorMessage } from '../errors';
import { useApi } from '../hooks/useApi';
import { FailedReplyOutcome } from './failed-reply-outcome';
import { McpListingRefusal, mcpListingRefusalOf } from './mcp-listing-refusal';
import { ErrorState } from './primitives';

export interface WriteFailureProps {
  /** The rejected value of the write. */
  readonly error: unknown;
  /** The name of the write that failed. */
  readonly scope: string;
}

export function WriteFailure({ error, scope }: WriteFailureProps): ReactNode {
  const api = useApi();
  const message = errorMessage(error);
  const refusal = mcpListingRefusalOf(api, error);
  if (refusal !== null) return <McpListingRefusal reason={refusal} message={message} />;
  return (
    <div className="tai-stack tai-stack-3">
      <ErrorState message={message} />
      <FailedReplyOutcome error={error} scope={scope} />
    </div>
  );
}
