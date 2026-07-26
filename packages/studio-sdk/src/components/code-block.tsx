/**
 * `CodeBlock` — escaped, monospaced preformatted text for tool results and string
 * payloads, on the design system's terminal ground (`tai-code-block`). The content
 * is a React text child inside `<pre><code>`, so it is escaped by React and
 * rendered verbatim; this component is NEVER an HTML sink (no
 * `dangerouslySetInnerHTML`).
 */
export interface CodeBlockProps {
  readonly code: string;
  /** Optional language label, shown as a caption; purely informational. */
  readonly language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  return (
    <div className="tai-stack tai-stack-2">
      {language !== undefined ? <span className="tai-label">{language}</span> : null}
      <pre className="tai-code-block">
        <code>{code}</code>
      </pre>
    </div>
  );
}
