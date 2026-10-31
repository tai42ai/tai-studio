/**
 * `McpStartingRefusal` — a write the platform refused because an MCP server it must
 * list to check a tool selection is still starting. The refusal is retriable and
 * nothing was written, so it wears the warn ground, not the error state: the headline
 * names the start, the platform's message follows, and the last line says what to do.
 */
import type { ReactNode } from 'react';

import { AlertTriangleIcon } from './icons';

export interface McpStartingRefusalProps {
  /** The platform's message of the refused write. */
  readonly message: string;
}

export function McpStartingRefusal({ message }: McpStartingRefusalProps): ReactNode {
  return (
    <div role="alert" className="tai-warn-state tai-stack tai-stack-2">
      <strong className="tai-status tai-status-warn">
        <AlertTriangleIcon />
        An MCP server is still starting
      </strong>
      <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{message}</p>
      <p style={{ margin: 0 }}>Nothing was changed. Try again once it has started.</p>
    </div>
  );
}
