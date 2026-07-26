/**
 * `CodeBlock` — escaped, monospaced preformatted text for tool results and string
 * payloads, on the design system's terminal ground (`tai-code-block`). The content
 * is a React text child inside `<pre><code>`, so it is escaped by React and
 * rendered verbatim; this component is NEVER an HTML sink (no
 * `dangerouslySetInnerHTML`).
 *
 * The `<pre>` IS the scrolling box, so it carries the region attributes itself
 * rather than sitting inside a `ScrollRegion` wrapper that would add a second
 * scroller: a long line makes it a named keyboard target, a short one leaves it
 * an ordinary block.
 */
import { useRef } from 'react';

import { useOverflowRegion } from './scroll-region';

export interface CodeBlockProps {
  readonly code: string;
  /** Optional language label, shown as a caption; purely informational. */
  readonly language?: string;
}

/** The region's name when no language caption supplies one. */
const DEFAULT_LABEL = 'Code';

export function CodeBlock({ code, language }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const region = useOverflowRegion(preRef, language ?? DEFAULT_LABEL);

  return (
    <div className="tai-stack tai-stack-2">
      {language !== undefined ? <span className="tai-label">{language}</span> : null}
      <pre ref={preRef} className="tai-code-block" {...region}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
