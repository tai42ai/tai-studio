/**
 * A small dismissible banner for an {@link OAuthNotice} outcome. The message is
 * rendered as TEXT (JSX children) — never as HTML — so a provider- or
 * server-supplied string can carry no markup sink.
 */
import { Button } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import type { OAuthNotice } from './oauth';

interface NoticePalette {
  readonly border: string;
  readonly fg: string;
  readonly role: 'status' | 'alert';
  readonly title: string;
}

const PALETTE: Record<OAuthNotice['kind'], NoticePalette> = {
  success: {
    border: 'var(--tai-color-success)',
    fg: 'var(--tai-color-success)',
    role: 'status',
    title: 'Connected',
  },
  failed: {
    border: 'var(--tai-color-danger)',
    fg: 'var(--tai-color-danger)',
    role: 'alert',
    title: 'Sign-in failed',
  },
  cancelled: {
    border: 'var(--tai-color-border)',
    fg: 'var(--tai-color-text-muted)',
    role: 'status',
    title: 'Sign-in cancelled',
  },
  error: {
    border: 'var(--tai-color-danger)',
    fg: 'var(--tai-color-danger)',
    role: 'alert',
    title: 'Something went wrong',
  },
};

export function Notice({
  notice,
  onDismiss,
}: {
  notice: OAuthNotice;
  onDismiss: () => void;
}): ReactNode {
  const palette = PALETTE[notice.kind];
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'var(--tai-space-4)',
    padding: 'var(--tai-space-3) var(--tai-space-4)',
    border: `1px solid ${palette.border}`,
    borderRadius: 'var(--tai-radius-md)',
    color: 'var(--tai-color-text)',
    fontSize: 'var(--tai-text-md)',
    fontFamily: 'var(--tai-font-sans)',
  };
  return (
    <div role={palette.role} data-kind={notice.kind} style={style}>
      <div>
        <strong style={{ color: palette.fg }}>{palette.title}</strong>
        <p style={{ margin: 'var(--tai-space-1) 0 0', whiteSpace: 'pre-wrap' }}>{notice.message}</p>
      </div>
      <Button onClick={onDismiss} aria-label="Dismiss notice">
        Dismiss
      </Button>
    </div>
  );
}
