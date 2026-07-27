/**
 * The dry-run VERDICT surface, shared by the create and save-version dialogs.
 *
 * An INVALID verdict is an answer, not a failure: the server ran the same
 * pre-store check a write would run and said no. It therefore reads as the
 * counterpart of the clean verdict — the same badge line, warn-tinted, with the
 * server's reason verbatim under it — never the crossed-circle error surface,
 * whose headline blames the system for a question the server answered.
 *
 * `role="status"` because the verdict lands asynchronously after the Validate
 * press and is the whole point of that press; polite, since neither verdict
 * interrupts what the author is typing. A request that never REACHED a verdict
 * (a 503) is a real failure and stays loud — that branch belongs to the caller.
 */
import type { ReactNode } from 'react';
import { Badge } from '@tai42/studio-sdk';

export function ValidateVerdict({
  valid,
  error,
}: {
  readonly valid: boolean;
  /** The server's rejection reason, rendered verbatim; `null` when it gave none. */
  readonly error: string | null;
}): ReactNode {
  return (
    <div role="status" className="tai-stack tai-stack-2">
      <div>
        <Badge variant={valid ? 'success' : 'warning'}>
          {valid ? 'Draft binds cleanly' : 'Draft is invalid'}
        </Badge>
      </div>
      {valid || error === null ? null : (
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{error}</p>
      )}
    </div>
  );
}
