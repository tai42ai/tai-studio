/**
 * One EXCHANGE of a transcript — the visitor's message, the agent's answer, and
 * where that answer's delivery stands.
 *
 * SAFETY CONTRACT. The visitor's `inbound_text` is a verbatim string from an
 * untrusted sender: it renders as ESCAPED React text with its own whitespace
 * preserved, never as markdown, so a message can neither restyle the operator's
 * screen nor become an HTML sink. The agent's `answer` is prose the turn authored
 * and renders through the SDK `Markdown`, which is escaped by construction. The
 * admin-only internal detail (`error`) goes through `CodeBlock`, also text-only.
 * Nothing here ever reaches `dangerouslySetInnerHTML`.
 *
 * A `failed` delivery is not an ordinary row: the exchange takes the error rule
 * down its leading edge on top of the danger chip, so the failure is visible
 * without relying on the chip's colour alone.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Badge, CodeBlock, Markdown } from '@tai42/studio-sdk';
import type { ConversationMessage } from '@tai42/api-client';

import { formatAbsoluteEpoch, formatRelativeEpoch } from './format';
import {
  ANSWER_LABEL,
  ANSWER_VARIANT,
  DELIVERY_LABEL,
  DELIVERY_VARIANT,
  isLoudDelivery,
} from './status';

const bubbleStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-border)',
  maxWidth: '46rem',
};

/** The visitor speaks on the leading edge in the accent tint; the agent answers below it. */
const SPEAKER_STYLE: Record<'visitor' | 'agent', CSSProperties> = {
  visitor: { ...bubbleStyle, background: 'var(--tai-color-accent-tint)' },
  agent: {
    ...bubbleStyle,
    background: 'var(--tai-color-surface-raised)',
    marginInlineStart: 'auto',
  },
};

const speakerLabelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-xs)',
  color: 'var(--tai-color-text-muted)',
};

const verbatimStyle: CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

const metaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  fontSize: 'var(--tai-text-xs)',
  color: 'var(--tai-color-text-muted)',
};

function Bubble({
  speaker,
  label,
  children,
}: {
  readonly speaker: 'visitor' | 'agent';
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div style={SPEAKER_STYLE[speaker]} data-speaker={speaker}>
      <span style={speakerLabelStyle}>{label}</span>
      {children}
    </div>
  );
}

/**
 * The record fields the caller-scoped projection withholds. Present means the
 * reader is an admin; a value of `null` there is a real "nothing recorded".
 */
function hasAdminDetail(record: ConversationMessage): boolean {
  return (
    record.attempts !== undefined ||
    record.outbound_message_ids !== undefined ||
    (record.error !== undefined && record.error !== null)
  );
}

function AdminDetail({ record }: { readonly record: ConversationMessage }): ReactNode {
  return (
    <details className="tai-stack tai-stack-2" data-testid="exchange-admin-detail">
      <summary>Delivery detail</summary>
      <div style={metaRowStyle}>
        {record.attempts === undefined ? null : (
          <span>{`Attempts: ${String(record.attempts)}`}</span>
        )}
        {record.outbound_message_ids === undefined ? null : (
          <span className="tai-mono">
            {record.outbound_message_ids.length === 0
              ? 'No provider message id'
              : record.outbound_message_ids.join(', ')}
          </span>
        )}
      </div>
      {record.error === undefined || record.error === null ? null : (
        <CodeBlock code={record.error} language="error" />
      )}
    </details>
  );
}

export function Exchange({
  record,
  now,
}: {
  readonly record: ConversationMessage;
  /** The pane's ticking clock, so the relative label stays true while it is open. */
  readonly now?: number;
}): ReactNode {
  const failed = isLoudDelivery(record.delivery_status);
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--tai-space-2)',
    paddingInlineStart: 'var(--tai-space-3)',
    borderInlineStart: failed
      ? '3px solid var(--tai-color-err-text)'
      : '3px solid var(--tai-color-border)',
  };

  return (
    <li style={style} data-testid="conversation-exchange" data-failed={failed ? '' : undefined}>
      <Bubble speaker="visitor" label="Visitor">
        <p style={verbatimStyle}>{record.inbound_text}</p>
      </Bubble>
      {record.answer === null ? null : (
        <Bubble speaker="agent" label="Agent">
          <Markdown markdown={record.answer} />
        </Bubble>
      )}
      <div style={metaRowStyle}>
        <span title={formatAbsoluteEpoch(record.created_at)}>
          {formatRelativeEpoch(record.created_at, now)}
        </span>
        <Badge variant={DELIVERY_VARIANT[record.delivery_status]}>
          {DELIVERY_LABEL[record.delivery_status]}
        </Badge>
        {record.answer_status === null ? null : (
          <Badge variant={ANSWER_VARIANT[record.answer_status]}>
            {ANSWER_LABEL[record.answer_status]}
          </Badge>
        )}
      </div>
      {hasAdminDetail(record) ? <AdminDetail record={record} /> : null}
    </li>
  );
}
