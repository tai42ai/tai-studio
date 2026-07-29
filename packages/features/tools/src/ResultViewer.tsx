/**
 * The typed RESULT VIEWER — the run-panel's success state, reused as a
 * standalone unit. A run result is arbitrary JSON, so the viewer branches by
 * runtime shape:
 *
 *  - media object    → an `<img>`/`<audio>` (a serialized fastmcp Image/Audio
 *                      MediaBlock, `{ type, data, mimeType }`), rendered from a
 *                      `data:` URI BEFORE the truncation gate and ONLY for an
 *                      image/* or audio/* mime (a foreign mime falls back);
 *  - object / array  → a collapsible `<JsonTree>`;
 *  - string          → an escaped `<CodeBlock>` (never an HTML sink — a payload
 *                      containing `<script>` renders as literal text);
 *  - other primitive → readable monospace text;
 *  - `undefined`     → an explicit "no result" empty state.
 *
 * OVERSIZED payloads (serialized length over {@link RESULT_MAX_CHARS}) are shown
 * TRUNCATED with a download action that streams the FULL result as a Blob, so a
 * huge result never floods the DOM yet is never silently lost.
 */
import type { ReactNode } from 'react';
import { Button, CodeBlock, EmptyState, JsonTree } from '@tai42/studio-sdk';
import { schemas } from '@tai42/api-client';

/** Serialized-length threshold above which a result is truncated + downloadable. */
export const RESULT_MAX_CHARS = 50_000;

/** A tool image/audio result stays within its column rather than overflowing it. */
const mediaStyle = { maxWidth: '100%' } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The canonical text form of a result — the string itself, or pretty JSON. */
function serialize(result: unknown): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result, null, 2);
}

/** Stream `content` to the user as a file download via a transient object URL. */
function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick: revoking synchronously can cancel the download
  // before the browser has committed it in some engines.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function ResultViewer({ result }: { result: unknown }): ReactNode {
  if (result === undefined) {
    return <EmptyState title="No result" description="The tool returned no value." />;
  }

  // Media results: a direct tool run can return a serialized fastmcp
  // Image/Audio MediaBlock as the MCP content object
  // `{ type: 'image' | 'audio', data: <base64>, mimeType: <mime> }`. Detect and
  // render it AHEAD of the RESULT_MAX_CHARS truncation below — a base64 `data`
  // field almost always exceeds the threshold, so a later check would never fire
  // and the media would be shown truncated/garbled. The schema's mimeType
  // refinement is the SECURITY gate: only an `image/*` (for <img>) or `audio/*`
  // (for <audio>) mime parses, so a drifting/arbitrary mime — or a non-media
  // object — falls through to the JSON/text view and is never turned into a
  // `data:` URI.
  const media = schemas.toolMediaResult.safeParse(result);
  if (media.success) {
    const { type, data, mimeType } = media.data;
    const src = `data:${mimeType};base64,${data}`;
    if (type === 'image') {
      return <img src={src} alt="Tool result" style={mediaStyle} />;
    }
    // A tool-returned audio payload is opaque base64 with no companion caption
    // track, so `media-has-caption` cannot be satisfied without inventing a fake
    // empty <track> — the disable is scoped to this one genuinely-inapplicable case.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio controls src={src} style={mediaStyle} />;
  }

  const isString = typeof result === 'string';
  const full = serialize(result);

  if (full.length > RESULT_MAX_CHARS) {
    const filename = isString ? 'tool-result.txt' : 'tool-result.json';
    const mime = isString ? 'text/plain' : 'application/json';
    return (
      <div className="tai-stack tai-stack-3">
        <p role="status" className="tai-muted" style={{ margin: 0 }}>
          {`Result is large (${full.length.toLocaleString()} characters) and is shown truncated below. Download the full result to see everything.`}
        </p>
        <CodeBlock
          language={`truncated result (first ${RESULT_MAX_CHARS.toLocaleString()} characters)`}
          code={full.slice(0, RESULT_MAX_CHARS)}
        />
        <div>
          <Button
            variant="primary"
            onClick={() => {
              triggerDownload(full, filename, mime);
            }}
          >
            Download full result
          </Button>
        </div>
      </div>
    );
  }

  if (isString) {
    return <CodeBlock language="result" code={result} />;
  }
  if (isRecord(result) || Array.isArray(result)) {
    return <JsonTree data={result} label="Tool result" />;
  }
  // Other primitives (number, boolean, null, bigint) — readable escaped mono text.
  return (
    <p className="tai-mono" style={{ margin: 0, overflowWrap: 'anywhere' }}>
      {full}
    </p>
  );
}
