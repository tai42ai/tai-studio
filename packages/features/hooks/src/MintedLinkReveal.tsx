/**
 * The shown-once reveal of a minted trigger link: its QR, a copy field, an expiry
 * caption and a loud "shown once" note. There is no reopen/regenerate affordance —
 * the server cannot reproduce the token — so the only way out is the Done button.
 */
import type { TriggerLinkCreated } from '@tai42/api-client';
import { Button, CopyField } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { formatExpiry } from './expiry';

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const qrWrapperStyle: CSSProperties = {
  maxWidth: '14rem',
  width: '100%',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  background: 'var(--tai-color-surface)',
  borderRadius: 'var(--tai-radius-md)',
};

const captionStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

export interface MintedLinkRevealProps {
  readonly url: string;
  readonly link: TriggerLinkCreated;
  readonly qr: { readonly __html: string };
  readonly onClose: () => void;
}

export function MintedLinkReveal({ url, link, qr, onClose }: MintedLinkRevealProps): ReactNode {
  return (
    <div style={sectionStyle}>
      <div
        role="img"
        aria-label="Trigger link QR code"
        data-testid="trigger-link-qr"
        style={qrWrapperStyle}
        dangerouslySetInnerHTML={qr}
      />
      <CopyField
        value={url}
        label="Trigger link"
        caption="Scan the QR or share this link — anyone who holds it fires the topic."
      />
      <p style={captionStyle}>
        {link.expires_at === null
          ? 'Permanent — never expires.'
          : `Expires ${formatExpiry(link.expires_at)}`}
      </p>
      <p style={captionStyle}>This code is shown once — revoke and re-create to get a new one.</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="button" variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
