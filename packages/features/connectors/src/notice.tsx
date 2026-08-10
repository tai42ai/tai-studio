/**
 * Inline connector states rendered as banners.
 *
 * {@link Notice} is a small dismissible banner for an {@link OAuthNotice} outcome.
 * {@link ConnectorRefusalNotice} is the muted, named-actionable surface for a 501
 * connector refusal (`OFF is a state, not an error`): the token store being
 * unconfigured, or a single provider's OAuth credentials being unset.
 *
 * Every message is rendered as TEXT (JSX children) — never as HTML — so a provider-
 * or server-supplied string can carry no markup sink.
 */
import { Button, EmptyState, FeatureDisabled, featureDisabledMessage } from '@tai42/studio-sdk';
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
    border: 'var(--tai-color-ok-text)',
    fg: 'var(--tai-color-ok-text)',
    role: 'status',
    title: 'Connected',
  },
  failed: {
    border: 'var(--tai-color-err-text)',
    fg: 'var(--tai-color-err-text)',
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
    border: 'var(--tai-color-err-text)',
    fg: 'var(--tai-color-err-text)',
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

// The machine-readable `code`s the skeleton's named 501 refusals carry. The store
// code names the whole feature being off; the provider code names one provider's
// OAuth client-credentials env var gap (whose message names the offending var).
const STORE_NOT_CONFIGURED_CODE = 'connectors-not-configured';
const PROVIDER_NOT_CONFIGURED_CODE = 'connector-provider-not-configured';

/** A classified connector refusal — the muted OFF states, distinct from real errors. */
export type ConnectorRefusal =
  | { readonly kind: 'store-off'; readonly message: string }
  | { readonly kind: 'provider-off'; readonly message: string };

/**
 * Classify a mutation error as a named 501 connector refusal, or `null` when it is a
 * genuine error (validation, upstream, 5xx) that belongs in a loud ErrorState. Duck-
 * types the error's `status` / `code` / `message` so it needs no `instanceof`.
 *
 * The provider-credential gap is checked before the store code, then a bare 501 with
 * no specific code falls back to the whole-feature-off state.
 */
export function readConnectorRefusal(error: unknown): ConnectorRefusal | null {
  if (typeof error !== 'object' || error === null) return null;
  const { status, code, message } = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (code === PROVIDER_NOT_CONFIGURED_CODE) {
    return {
      kind: 'provider-off',
      message:
        typeof message === 'string' && message !== ''
          ? message
          : 'This connector is not configured on this deployment.',
    };
  }
  if (code === STORE_NOT_CONFIGURED_CODE || status === 501) {
    return { kind: 'store-off', message: featureDisabledMessage(error) };
  }
  return null;
}

/**
 * The muted, honest surface for a {@link ConnectorRefusal}. Both cases surface the
 * server's own actionable message (which names the missing configuration) — the
 * store-off case through the shared {@link FeatureDisabled} note, the provider-off
 * case as a `role="status"` note — never a loud red alert, because a capability the
 * deployment has not provided is a state, not a malfunction.
 */
export function ConnectorRefusalNotice({ refusal }: { refusal: ConnectorRefusal }): ReactNode {
  if (refusal.kind === 'store-off') {
    return <FeatureDisabled feature="Connectors" message={refusal.message} />;
  }
  return (
    <div data-testid="connector-provider-off">
      <EmptyState title="This connector is not configured" description={refusal.message} />
    </div>
  );
}
