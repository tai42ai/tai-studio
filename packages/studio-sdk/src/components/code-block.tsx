/**
 * `CodeBlock` — escaped, monospaced preformatted text for tool results and string
 * payloads, on the design system's terminal ground (`tai-code-block`). The content
 * is a React text child inside `<pre><code>`; NEVER an HTML sink (no
 * `dangerouslySetInnerHTML`).
 *
 * The `<pre>` IS the scrolling box, carrying the region attributes itself rather
 * than nesting a `ScrollRegion` that would add a second scroller.
 *
 * A top-right copy button sits OUTSIDE the `<pre>`, pinned to a relatively-positioned
 * frame, so horizontal scroll never carries it off-screen. Its accessible name is
 * the state it shows ("Copy code" / "Copied"), so it is never named by words it has
 * stopped saying (WCAG 2.5.3). A clipboard failure renders as a visible `role="alert"`
 * naming the reason, never the payload — see {@link useClipboardCopy}.
 */
import type { CSSProperties } from 'react';

import { CheckIcon, CopyIcon, XCircleIcon } from './icons';
import { useOverflowRegion } from './scroll-region';
import { COPIED_LABEL, useClipboardCopy } from '../hooks/useClipboardCopy';

export interface CodeBlockProps {
  readonly code: string;
  /** Optional language label, shown as a caption; purely informational. */
  readonly language?: string;
}

/** The region's name when no language caption supplies one. */
const DEFAULT_LABEL = 'Code';

/** The button's resting accessible name; whichever face shows is also its name. */
const COPY_LABEL = 'Copy code';

/** Shown when the browser offers no clipboard at all (any non-secure context). */
const NO_CLIPBOARD =
  'This browser will not write to the clipboard here. Select the code and copy it.';

/** Shown when the write is offered and refused. */
function writeFailed(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `Copy failed: ${detail}. Select the code and copy it.`;
}

/** The frame the copy button is pinned to, over the top-right of the code. */
const frameStyle: CSSProperties = { position: 'relative' };

const copyButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 'var(--tai-space-2)',
  right: 'var(--tai-space-2)',
};

export function CodeBlock({ code, language }: CodeBlockProps) {
  // No consumer ref: the measurement's own callback ref is the only thing that
  // needs the `<pre>`, and this component publishes no `ref` prop.
  const region = useOverflowRegion(undefined, language ?? DEFAULT_LABEL);

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
    void copy(() => code);
  };

  return (
    <div className="tai-stack tai-stack-2">
      {language !== undefined ? <span className="tai-label">{language}</span> : null}
      <div style={frameStyle}>
        <pre className="tai-code-block" {...region}>
          <code>{code}</code>
        </pre>
        <button
          type="button"
          className="tai-icon-btn"
          style={copyButtonStyle}
          aria-label={copied ? COPIED_LABEL : COPY_LABEL}
          onClick={handleCopy}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
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
    </div>
  );
}
