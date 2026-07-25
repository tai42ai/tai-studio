/**
 * `CodeBlock` — escaped, monospaced preformatted text for tool results and string
 * payloads. The content is a React text child inside `<pre><code>`, so it is
 * escaped by React and rendered verbatim; this component is NEVER an HTML sink
 * (no `dangerouslySetInnerHTML`).
 */
import type { CSSProperties } from 'react';

export interface CodeBlockProps {
  readonly code: string;
  /** Optional language label, shown as a caption; purely informational. */
  readonly language?: string;
}

const preStyle: CSSProperties = {
  margin: 0,
  padding: 'var(--tai-space-3)',
  background: 'var(--tai-color-surface)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  color: 'var(--tai-color-text)',
  font: 'var(--tai-text-sm) var(--tai-font-mono)',
  overflowX: 'auto',
  whiteSpace: 'pre',
};

const captionStyle: CSSProperties = {
  display: 'block',
  marginBottom: 'var(--tai-space-1)',
  fontSize: 'var(--tai-text-sm)',
  fontFamily: 'var(--tai-font-sans)',
  color: 'var(--tai-color-text-muted)',
};

export function CodeBlock({ code, language }: CodeBlockProps) {
  return (
    <div>
      {language !== undefined ? <span style={captionStyle}>{language}</span> : null}
      <pre style={preStyle}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
