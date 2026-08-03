/**
 * Structural rendering for an LLM/generation span's message payload. A payload is
 * "message-shaped" when it is an array of `{ role, content }` objects — directly,
 * or under a `messages` key — and {@link asMessages} returns null for anything else
 * so the caller falls back to the JSON tree.
 *
 * Each message is a role-tagged bubble. Prose `content` renders through the SDK
 * {@link Markdown} (escaped by construction — never an HTML sink); a structured
 * `content` part or a `tool_calls` array renders through {@link CodeBlock} (also
 * text-only, with copy). No payload string is ever interpreted as markup.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Badge, CodeBlock, Markdown } from '@tai42/studio-sdk';

interface Message {
  readonly role: string;
  readonly content: unknown;
  readonly tool_calls?: unknown;
}

/**
 * `JSON.stringify` is typed to always return `string`, but a value it cannot
 * represent (a function, a bare `undefined`) yields `undefined` at runtime; this
 * annotation admits that absence so the fallback below is a real check.
 */
function stringifyJson(value: unknown): string | undefined {
  return JSON.stringify(value, null, 2);
}

/** JSON for a structured payload, shown in a `CodeBlock`; unrepresentable → String. */
function toJson(value: unknown): string {
  return stringifyJson(value) ?? String(value);
}

/**
 * A message array from an LLM payload, or null when the value is not message-shaped.
 * Accepts a bare array or one nested under a `messages` key; every element must be
 * an object carrying a `role`.
 */
export function asMessages(value: unknown): Message[] | null {
  const array = Array.isArray(value)
    ? value
    : value !== null &&
        typeof value === 'object' &&
        Array.isArray((value as Record<string, unknown>).messages)
      ? ((value as Record<string, unknown>).messages as unknown[])
      : null;
  if (array === null || array.length === 0) return null;
  const everyMessage = array.every(
    (item) =>
      item !== null && typeof item === 'object' && 'role' in (item as Record<string, unknown>),
  );
  return everyMessage ? (array as Message[]) : null;
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

function MessageContent({ content }: { readonly content: unknown }): ReactNode {
  if (content === null || content === undefined) return null;
  if (typeof content === 'string') {
    return content.trim() === '' ? null : <Markdown markdown={content} />;
  }
  // Multimodal content: an array of parts. Text parts render as prose; every other
  // part (an image ref, a structured block) renders as its escaped JSON.
  if (Array.isArray(content)) {
    return (
      <div className="tai-stack tai-stack-2">
        {content.map((part, index) => {
          const text =
            part !== null &&
            typeof part === 'object' &&
            typeof (part as Record<string, unknown>).text === 'string'
              ? ((part as Record<string, unknown>).text as string)
              : null;
          return text !== null ? (
            <Markdown key={index} markdown={text} />
          ) : (
            <CodeBlock key={index} code={toJson(part)} language="part" />
          );
        })}
      </div>
    );
  }
  return <CodeBlock code={toJson(content)} language="content" />;
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
            <MessageContent content={message.content} />
            {message.tool_calls !== undefined && message.tool_calls !== null ? (
              <CodeBlock code={toJson(message.tool_calls)} language="tool_calls" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
