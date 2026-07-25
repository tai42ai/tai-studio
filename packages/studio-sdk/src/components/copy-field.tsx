/**
 * `CopyField` — a show-once box for a freshly-minted secret (an API key or a
 * minted backup key). It renders the value in a monospace, break-all,
 * select-all box beside a copy button that writes the value to the clipboard and
 * shows a transient "Copied" affordance. It is PRESENTATIONAL: the caller owns
 * the value; this component fetches nothing and never re-reads the secret.
 *
 * SAFETY: the value and caption render as TEXT (React escapes them) — never an
 * HTML sink. The value is never logged. Pinned by a test.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { Button } from './primitives';

export interface CopyFieldProps {
  readonly value: string;
  readonly caption?: string;
  readonly idPrefix?: string;
  readonly label?: string;
}

const COPIED_RESET_MS = 2000;

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
};

const labelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 'var(--tai-space-2)',
};

const codeStyle: CSSProperties = {
  flex: 1,
  display: 'block',
  padding: 'var(--tai-space-2) var(--tai-space-3)',
  background: 'var(--tai-color-surface)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  color: 'var(--tai-color-text)',
  font: 'var(--tai-text-sm) var(--tai-font-mono)',
  wordBreak: 'break-all',
  userSelect: 'all',
};

const captionStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
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
    <div data-testid={idPrefix} style={containerStyle}>
      {label !== undefined ? <span style={labelStyle}>{label}</span> : null}
      <div style={rowStyle}>
        <code style={codeStyle}>{value}</code>
        <Button
          type="button"
          variant="secondary"
          aria-label="Copy"
          data-testid={`${idPrefix}-copy`}
          onClick={handleCopy}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
      {caption !== undefined ? <span style={captionStyle}>{caption}</span> : null}
    </div>
  );
}

// -- Icons (inline SVG; the SDK ships no icon dependency) --------------------

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
