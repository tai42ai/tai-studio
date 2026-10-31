/**
 * The refusal of a call that must read an MCP server's tool listing when the worker that
 * answered holds none (`mcpListingRefusalOf` reads it), and how a refused write shows it.
 *
 * `McpListingRefusal` — a write the platform refused because the worker that answered holds
 * no tool listing for an MCP server the write must check a tool selection against: the
 * server's start is still in progress, or that worker has not loaded the server. Nothing was
 * written and the write can be sent again, so it wears the warn ground, not the error state:
 * the headline names why, the platform's message follows, and the last line says what to do.
 * A failed start or bind is not such a refusal: its write fails with the recorded cause.
 */
import type { ApiClient } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { AlertTriangleIcon } from './icons';

/** Why the answering worker holds no listing for the server a refused call had to read. */
export type McpListingRefusalReason = 'starting' | 'not_loaded';

/** The headline and the next step each refusal reads. */
const REFUSAL_TEXT: Readonly<Record<McpListingRefusalReason, { headline: string; next: string }>> =
  {
    starting: {
      headline: 'An MCP server is still starting',
      next: 'Nothing was changed. Try again once it has started.',
    },
    not_loaded: {
      headline: 'An MCP server is not loaded on the worker that answered',
      next: 'Nothing was changed. Reload the server, then try again.',
    },
  };

/**
 * The listing refusal `error` is, read through the client that raised it, or `null` when it
 * is not one: a read of a server's tools or a selection-changing write, refused because the
 * worker that answered holds no listing for the server.
 */
export function mcpListingRefusalOf(
  api: Pick<ApiClient, 'isMcpStartingError' | 'isMcpNotLoadedError'>,
  error: unknown,
): McpListingRefusalReason | null {
  if (api.isMcpStartingError(error)) return 'starting';
  if (api.isMcpNotLoadedError(error)) return 'not_loaded';
  return null;
}

export interface McpListingRefusalProps {
  /** Why the write was refused. */
  readonly reason: McpListingRefusalReason;
  /** The platform's message of the refused write. */
  readonly message: string;
}

export function McpListingRefusal({ reason, message }: McpListingRefusalProps): ReactNode {
  const text = REFUSAL_TEXT[reason];
  return (
    <div role="alert" className="tai-warn-state tai-stack tai-stack-2">
      <strong className="tai-status tai-status-warn">
        <AlertTriangleIcon />
        {text.headline}
      </strong>
      <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{message}</p>
      <p style={{ margin: 0 }}>{text.next}</p>
    </div>
  );
}
