/**
 * `CopyField` — a show-once box for a freshly-minted secret (an API key or a
 * minted backup key). It renders the value in a monospace, break-all,
 * select-all box beside a copy button that writes the value to the clipboard and
 * shows a transient "Copied" affordance. It is PRESENTATIONAL: the caller owns
 * the value; this component fetches nothing and never re-reads the secret.
 *
 * The button holds BOTH states stacked in one grid cell, so the widest of them
 * sets the width once and the flip never reflows the row. Only the active state
 * is exposed to assistive tech, and that state's own words are the button's
 * accessible name: a constant `aria-label` would leave a button reading "Copied"
 * named "Copy", which fails WCAG 2.5.3 (Label in Name) and leaves a voice-control
 * user naming a control they cannot see. The polite live region beside the button
 * is what actually announces the flip.
 *
 * A clipboard write can FAIL — a permissions policy blocks it, or the page is
 * not in a secure context, where `navigator.clipboard` does not exist at all.
 * Either way the value is a secret shown once, so the failure is rendered as a
 * visible `role="alert"` telling the reader to copy it by hand: throwing it at
 * the console would leave the button looking inert and the secret unrecoverable.
 *
 * SAFETY: the value and caption render as TEXT (React escapes them) — never an
 * HTML sink. The value is never logged, and neither is a failure — the alert
 * names the reason, never the value. Pinned by a test.
 */
import type { CSSProperties } from 'react';

import { CheckIcon, CopyIcon, XCircleIcon } from './icons';
import { COPIED_LABEL, useClipboardCopy } from '../hooks/useClipboardCopy';

export interface CopyFieldProps {
  readonly value: string;
  readonly caption?: string;
  readonly idPrefix?: string;
  readonly label?: string;
}

/** The button's resting face; whichever face is exposed is also its accessible name. */
const COPY_LABEL = 'Copy';

/** Shown when the browser offers no clipboard at all (any non-secure context). */
const NO_CLIPBOARD =
  'This browser will not write to the clipboard here. Select the value above and copy it.';

/** Shown when the write is offered and refused. */
function writeFailed(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `Copy failed: ${detail}. Select the value above and copy it.`;
}

const valueStyle: CSSProperties = {
  flex: 1,
  padding: 'var(--tai-space-2) var(--tai-space-3)',
  wordBreak: 'break-all',
  userSelect: 'all',
};

/** Both states share one grid cell, so the button is as wide as the wider one. */
const statesStyle: CSSProperties = {
  display: 'grid',
  alignItems: 'center',
  justifyItems: 'center',
};

const stateStyle: CSSProperties = {
  gridArea: '1 / 1',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

export function CopyField({ value, caption, idPrefix = 'copy-field', label }: CopyFieldProps) {
  const {
    copied,
    error: copyError,
    announcement,
    copy,
  } = useClipboardCopy({
    noClipboard: NO_CLIPBOARD,
    writeFailed,
  });

  const handleCopy = (): void => {
    void copy(() => value);
  };

  return (
    <div data-testid={idPrefix} className="tai-stack tai-stack-2">
      {label !== undefined ? <span className="tai-field-label">{label}</span> : null}
      <div className="tai-row">
        <code className="tai-code" style={valueStyle}>
          {value}
        </code>
        <button
          type="button"
          className="tai-btn tai-btn-secondary"
          data-testid={`${idPrefix}-copy`}
          onClick={handleCopy}
        >
          <span style={statesStyle}>
            <span
              aria-hidden={copied}
              style={{ ...stateStyle, visibility: copied ? 'hidden' : 'visible' }}
            >
              <CopyIcon />
              {COPY_LABEL}
            </span>
            <span
              aria-hidden={!copied}
              style={{ ...stateStyle, visibility: copied ? 'visible' : 'hidden' }}
            >
              <CheckIcon />
              {COPIED_LABEL}
            </span>
          </span>
        </button>
        <span aria-live="polite" className="tai-visually-hidden">
          {announcement}
        </span>
      </div>
      {copyError !== undefined ? (
        <span role="alert" className="tai-field-error">
          <XCircleIcon />
          {copyError}
        </span>
      ) : null}
      {caption !== undefined ? <span className="tai-field-hint">{caption}</span> : null}
    </div>
  );
}
