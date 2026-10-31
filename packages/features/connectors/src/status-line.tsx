/** The one-line status the Connectors screens draw: muted, or toned with its icon. */
import { AlertTriangleIcon, PendingIcon } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

/** A status line's tone: a problem (`warn`, `err`) or a state still in progress (`pending`). */
export type StatusTone = 'warn' | 'err' | 'pending';

export function StatusLine({
  tone,
  role,
  children,
}: {
  tone?: StatusTone;
  /** `status` for a line that announces a state the user is waiting on. */
  role?: 'status';
  children: ReactNode;
}): ReactNode {
  const className = tone === undefined ? 'tai-status' : `tai-status tai-status-${tone}`;
  return (
    <p role={role} className={className} style={{ margin: 0, overflowWrap: 'anywhere' }}>
      {tone === 'pending' ? <PendingIcon /> : tone !== undefined ? <AlertTriangleIcon /> : null}
      {children}
    </p>
  );
}
