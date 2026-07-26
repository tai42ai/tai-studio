/**
 * `CopyField` — a show-once box for a freshly-minted secret (an API key or a
 * minted backup key). It renders the value in a monospace, break-all,
 * select-all box beside a copy button that writes the value to the clipboard and
 * shows a transient "Copied" affordance. It is PRESENTATIONAL: the caller owns
 * the value; this component fetches nothing and never re-reads the secret.
 *
 * The button holds BOTH states stacked in one grid cell, so the widest of them
 * sets the width once and the flip never reflows the row. Only the active state
 * is exposed to assistive tech, and the button's accessible name is the constant
 * `aria-label` — so the flip is announced exactly once, by the polite live region
 * beside it, and never a second time as a renamed control.
 *
 * SAFETY: the value and caption render as TEXT (React escapes them) — never an
 * HTML sink. The value is never logged. Pinned by a test.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { CheckIcon, CopyIcon } from './icons';

export interface CopyFieldProps {
  readonly value: string;
  readonly caption?: string;
  readonly idPrefix?: string;
  readonly label?: string;
}

const COPIED_RESET_MS = 2000;

/** The button's accessible name. Constant across the flip, by design. */
const COPY_LABEL = 'Copy';

/** Announced once, and worded so it is never mistaken for the visible label. */
const COPIED_ANNOUNCEMENT = 'Copied to clipboard';

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
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
          setCopied(false);
        }, COPIED_RESET_MS);
      },
      (error: unknown) => {
        // Surface a clipboard failure loudly — never hide it behind the button.
        setTimeout(() => {
          throw error instanceof Error
            ? error
            : new Error(`Clipboard write failed: ${String(error)}`);
        });
      },
    );
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
          aria-label={COPY_LABEL}
          data-testid={`${idPrefix}-copy`}
          onClick={handleCopy}
        >
          <span style={statesStyle}>
            <span
              aria-hidden={copied}
              style={{ ...stateStyle, visibility: copied ? 'hidden' : 'visible' }}
            >
              <CopyIcon />
              Copy
            </span>
            <span
              aria-hidden={!copied}
              style={{ ...stateStyle, visibility: copied ? 'visible' : 'hidden' }}
            >
              <CheckIcon />
              Copied
            </span>
          </span>
        </button>
        <span aria-live="polite" className="tai-visually-hidden">
          {copied ? COPIED_ANNOUNCEMENT : ''}
        </span>
      </div>
      {caption !== undefined ? <span className="tai-field-hint">{caption}</span> : null}
    </div>
  );
}
