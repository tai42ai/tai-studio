/**
 * Structural rendering for an LLM span's messages, recorded in the OpenTelemetry
 * GenAI convention: a list of `{ role, parts }` messages, an output message also
 * carrying its `finish_reason`. {@link asMessages} returns null for any other value so
 * the caller falls back to the JSON tree (all data stays visible).
 *
 * Each message is a role-tagged bubble and each part renders by its type: a `text`
 * part as its literal text; a `tool_call` as "Call · <name>" with its id and a tree of
 * its arguments; a `tool_call_response` as "Result · <id>" with a tree of its response;
 * any other part as a tree under a label of its type. No payload string is ever
 * interpreted as markup.
 */
import { Badge, JsonTree } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

type Part = Record<string, unknown>;

export interface Message {
  readonly role: string;
  readonly parts: readonly unknown[];
  readonly finish_reason?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The message list of an LLM span value, or null when the value is not that list:
 * every item must carry a string `role` and an array `parts`.
 */
export function asMessages(value: unknown): Message[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const every = value.every(
    (item) => isRecord(item) && typeof item.role === 'string' && Array.isArray(item.parts),
  );
  return every ? (value as Message[]) : null;
}

const bubbleStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-border)',
  background: 'var(--tai-color-surface-raised)',
};

const partHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--tai-space-2)',
  flexWrap: 'wrap',
  fontSize: 'var(--tai-text-sm)',
};

/** Per-role bubble tint from design tokens; system/unknown keeps the neutral base. */
function roleTint(role: string): CSSProperties {
  switch (role.toLowerCase()) {
    case 'user':
      return { background: 'var(--tai-color-accent-tint)' };
    case 'assistant':
      return { background: 'var(--tai-color-ok-tint)' };
    case 'tool':
      return { background: 'var(--tai-color-warn-tint)' };
    default:
      return {};
  }
}

/**
 * `JSON.stringify` is typed to always return `string`, but a value it cannot
 * represent (a function, a bare `undefined`) yields `undefined` at runtime; this
 * annotation admits that absence so the fallback below is a real check.
 */
function stringifyJson(value: unknown): string | undefined {
  return JSON.stringify(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : (stringifyJson(value) ?? String(value));
}

function PartView({ part }: { readonly part: unknown }): ReactNode {
  if (!isRecord(part)) {
    return <JsonTree data={part} label="Message part" />;
  }
  const record: Part = part;
  switch (record.type) {
    case 'text':
      return <div style={{ whiteSpace: 'pre-wrap' }}>{text(record.content)}</div>;
    case 'tool_call':
      return (
        <div className="tai-stack tai-stack-2">
          <div style={partHeadStyle}>
            <strong>Call · {text(record.name)}</strong>
            {record.id !== undefined && record.id !== null ? (
              <span className="tai-mono tai-muted">{text(record.id)}</span>
            ) : null}
          </div>
          <JsonTree data={record.arguments} label={`${text(record.name)} arguments`} />
        </div>
      );
    case 'tool_call_response':
      return (
        <div className="tai-stack tai-stack-2">
          <div style={partHeadStyle}>
            <strong>Result · {text(record.id)}</strong>
          </div>
          <JsonTree data={record.response} label={`${text(record.id)} result`} />
        </div>
      );
    default:
      return (
        <div className="tai-stack tai-stack-2">
          <span className="tai-muted" style={{ fontSize: 'var(--tai-text-sm)' }}>
            {text(record.type ?? 'part')}
          </span>
          <JsonTree data={record} label={`${text(record.type ?? 'part')} part`} />
        </div>
      );
  }
}

export function SpanMessages({
  messages,
  label,
}: {
  readonly messages: readonly Message[];
  readonly label?: string;
}): ReactNode {
  return (
    <div className="tai-stack tai-stack-2">
      {label !== undefined ? <span className="tai-label">{label}</span> : null}
      <div className="tai-stack tai-stack-3">
        {messages.map((message, index) => (
          <div key={index} style={{ ...bubbleStyle, ...roleTint(message.role) }}>
            <Badge>{message.role}</Badge>
            {message.parts.map((part, partIndex) => (
              <PartView key={partIndex} part={part} />
            ))}
            {message.finish_reason !== undefined && message.finish_reason !== null ? (
              <span className="tai-muted" style={{ fontSize: 'var(--tai-text-xs)' }}>
                finish: {text(message.finish_reason)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
