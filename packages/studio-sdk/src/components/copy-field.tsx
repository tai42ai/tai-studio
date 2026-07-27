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
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { CheckIcon, CopyIcon, XCircleIcon } from './icons';

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

/**
 * `lib.dom` declares `navigator.clipboard` as always present, but the platform
 * exposes it only in a SECURE CONTEXT — over plain http it is not there at all.
 * Reading the navigator through this shape admits the absence the DOM types deny,
 * so the guard below is a real check rather than a cast around one.
 */
interface MaybeClipboard {
  readonly clipboard?: Clipboard;
}

/** The clipboard this browser actually offers, or `undefined` when it offers none. */
function clipboardOf(host: MaybeClipboard): Clipboard | undefined {
  return host.clipboard;
}

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
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | undefined>(undefined);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The clipboard write is async, so a copy can still be in flight when the
  // component goes away — the caller's dialog closes on the same click. Clearing
  // the timer alone would not cover that: at unmount there is no timer yet, and
  // the resolution that follows would start one nothing is left to clear. This
  // flag is what the resolution checks before it touches state at all.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleCopy = (): void => {
    const clipboard = clipboardOf(navigator);
    if (clipboard === undefined) {
      setCopyError(NO_CLIPBOARD);
      return;
    }
    setCopyError(undefined);
    void clipboard.writeText(value).then(
      () => {
        if (!mounted.current) return;
        setCopied(true);
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
          setCopied(false);
        }, COPIED_RESET_MS);
      },
      (error: unknown) => {
        if (!mounted.current) return;
        setCopyError(writeFailed(error));
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
