/**
 * The show-once dialog that presents a freshly minted API key in a copy box with a
 * warning that it cannot be retrieved again, and lets the operator turn that key
 * into a one-time CLAIM LINK: a QR code (and matching absolute URL) another device
 * scans to sign in scoped to the new key.
 *
 * The claim link exists exactly once — the raw key is client-side only inside this
 * dialog, and the claim token rides the returned `claim_path` fragment
 * (`/login#claim=<token>`), which the QR and the copy field carry verbatim. The
 * token is NEVER logged, stored, or persisted; regenerating mints an independent
 * one-time link. Failures surface loudly inline.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { renderSVG } from 'uqr';
import {
  Button,
  CopyField,
  Dialog,
  ErrorState,
  Spinner,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { ClaimLinkCreated } from '@tai42/api-client';

import { dialogActionsStyle } from './api-keys-common';

const claimSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
  marginTop: 'var(--tai-space-4)',
  paddingTop: 'var(--tai-space-4)',
  borderTop: '1px solid var(--tai-color-border)',
};

const qrWrapperStyle: CSSProperties = {
  maxWidth: '14rem',
  width: '100%',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  background: 'var(--tai-color-surface)',
  borderRadius: 'var(--tai-radius-md)',
};

const expiryStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

/** An ISO-8601 instant rendered for humans; an unparseable value shows verbatim. */
function formatExpiry(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function MintedKeyDialog({
  apiKey,
  onClose,
}: {
  readonly apiKey: string;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  // The last link is held in local state (not `mutation.data`) so the QR stays
  // visible while a regenerate is in flight — each regenerate mints an independent
  // one-time link that replaces this one on success.
  const [link, setLink] = useState<ClaimLinkCreated | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.createClaimLink({ api_key: apiKey }),
    onSuccess: setLink,
  });

  // The absolute URL a second device opens; the token lives in its fragment, so it
  // is never sent to the server on the request that fetches `/login` and never
  // leaves this rendered value.
  const claimUrl = link !== null ? window.location.origin + link.claim_path : null;

  return (
    <Dialog
      title="API key created"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <CopyField
        value={apiKey}
        label="New API key"
        caption="Copy this key now — it cannot be retrieved again."
      />

      <div style={claimSectionStyle}>
        {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}

        {claimUrl !== null && link !== null ? (
          <>
            <div
              role="img"
              aria-label="Claim link QR code"
              data-testid="claim-link-qr"
              style={qrWrapperStyle}
              dangerouslySetInnerHTML={{ __html: renderSVG(claimUrl) }}
            />
            <CopyField
              value={claimUrl}
              label="Claim link"
              caption="Scan the QR or share this link — it can be used once, then expires."
            />
            <p style={expiryStyle}>Expires {formatExpiry(link.expires_at)}</p>
            <div style={dialogActionsStyle}>
              <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  mutation.mutate();
                }}
              >
                {mutation.isPending ? <Spinner label="Generating" /> : null}
                Generate new link
              </Button>
            </div>
          </>
        ) : (
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              mutation.mutate();
            }}
          >
            {mutation.isPending ? <Spinner label="Generating" /> : null}
            Create claim link (QR)
          </Button>
        )}
      </div>

      <div style={dialogActionsStyle}>
        <Button type="button" variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
