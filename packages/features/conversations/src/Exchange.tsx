/**
 * One EXCHANGE of a transcript — the visitor's message, the agent's answer, and
 * where that answer's delivery stands — or one send record: a message the
 * platform sent on its own, with the participant's reply when it was an ask.
 *
 * SAFETY CONTRACT. The visitor's `inbound_text`, an ask's reply and the quoted
 * text of the message either one replies to are verbatim untrusted values: a
 * string renders as ESCAPED React text with its own whitespace preserved, never
 * as markdown, and a structured reply renders as its JSON through `CodeBlock`, so
 * a message can neither restyle the operator's screen nor become an HTML sink. The agent's `answer` is prose the platform
 * authored and renders through the SDK `Markdown`, which is escaped by
 * construction. The admin-only internal detail (`error`) goes through `CodeBlock`,
 * also text-only. Nothing here ever reaches `dangerouslySetInnerHTML`.
 *
 * A send bubble's label never names an author the record does not prove. Only a
 * send made during a turn to that turn's participant (`turn_message_id` set) is
 * labelled as the agent; every other send takes the neutral `send` speaker.
 *
 * A loud delivery (`failed`, `outcome_unknown`) is not an ordinary row: the
 * exchange takes the error rule down its leading edge on top of the danger chip,
 * so the failure is visible without relying on the chip's colour alone.
 */
import type { ConversationMessage } from '@tai42/api-client';
import { Badge, CodeBlock, Markdown } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { formatAbsoluteEpoch, formatRelativeEpoch } from './format';
import { MediaAttachments } from './MediaAttachments';
import {
  ANSWER_LABEL,
  ANSWER_VARIANT,
  DELIVERY_LABEL,
  DELIVERY_VARIANT,
  isLoudDelivery,
} from './status';

type Speaker = 'visitor' | 'agent' | 'operator' | 'send';

const bubbleStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-border)',
  maxWidth: '46rem',
};

/**
 * The visitor speaks on the leading edge in the accent tint; the agent answers
 * below it. An operator answers on the agent's side too, set apart by an accent
 * border so a human's message reads as distinct from the target's. A send whose
 * author the record does not prove sits on the same side in neutral tokens with a
 * dashed border, carrying no author's colour.
 */
const SPEAKER_STYLE: Record<Speaker, CSSProperties> = {
  visitor: { ...bubbleStyle, background: 'var(--tai-color-accent-tint)' },
  agent: {
    ...bubbleStyle,
    background: 'var(--tai-color-surface-raised)',
    marginInlineStart: 'auto',
  },
  operator: {
    ...bubbleStyle,
    background: 'var(--tai-color-surface-raised)',
    border: '1px solid var(--tai-color-accent)',
    marginInlineStart: 'auto',
  },
  send: {
    ...bubbleStyle,
    background: 'var(--tai-color-surface)',
    border: '1px dashed var(--tai-color-border-strong)',
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

const mutedLineStyle: CSSProperties = {
  margin: 0,
  fontStyle: 'italic',
  color: 'var(--tai-color-text-muted)',
};

const quoteStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
  padding: 'var(--tai-space-2)',
  paddingInlineStart: 'var(--tai-space-3)',
  borderInlineStart: '3px solid var(--tai-color-border-strong)',
  borderRadius: 'var(--tai-radius-sm)',
  background: 'var(--tai-color-surface)',
  color: 'var(--tai-color-text-muted)',
};

const metaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  fontSize: 'var(--tai-text-xs)',
  color: 'var(--tai-color-text-muted)',
};

function edgeStyle(loud: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--tai-space-2)',
    paddingInlineStart: 'var(--tai-space-3)',
    borderInlineStart: loud
      ? '3px solid var(--tai-color-err-text)'
      : '3px solid var(--tai-color-border)',
  };
}

function Bubble({
  speaker,
  label,
  children,
}: {
  readonly speaker: Speaker;
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

type Quote = NonNullable<ConversationMessage['inbound_reply_to']>;

/**
 * The earlier message a visitor's message or an ask's reply quotes, drawn above
 * it. A held message shows its text in full; a message the record does not hold,
 * one answering a sensitive question, and one with no text each say so instead.
 */
function QuoteBlock({ quote }: { readonly quote: Quote }): ReactNode {
  let body: ReactNode;
  switch (quote.status) {
    case 'found':
      body = (
        <>
          <span style={speakerLabelStyle}>Replying to</span>
          <p style={{ ...verbatimStyle, color: 'var(--tai-color-text)' }}>{quote.text}</p>
        </>
      );
      break;
    case 'not_found':
      body = (
        <>
          <p style={mutedLineStyle}>
            Replying to a message this thread's record does not hold. It may be in an earlier thread
            of this conversation, whose text is not shown here, or it expired, was forgotten or was
            never recorded.
          </p>
          <span style={speakerLabelStyle}>
            {'Message id: '}
            <span className="tai-mono">{quote.message_id}</span>
          </span>
        </>
      );
      break;
    case 'sensitive':
      body = (
        <p style={mutedLineStyle}>
          Replying to an answer to a sensitive question. Its text is not kept.
        </p>
      );
      break;
    case 'no_text':
      body = <p style={mutedLineStyle}>Replying to a message with no text.</p>;
      break;
  }
  return (
    <blockquote style={quoteStyle} data-testid="exchange-quote" data-status={quote.status}>
      {body}
    </blockquote>
  );
}

/** The speaker and label of a send record's own bubble, from what the record proves. */
function sendBubble(record: ConversationMessage): { speaker: Speaker; label: string } {
  const inTurn = record.turn_message_id !== null;
  switch (record.sent_by) {
    case 'ask':
      return inTurn
        ? { speaker: 'agent', label: 'Agent · question' }
        : { speaker: 'send', label: 'Question' };
    case 'notice':
      return { speaker: 'send', label: 'Platform notice' };
    case 'channel':
      return { speaker: 'send', label: 'Channel notice' };
    default:
      return inTurn
        ? { speaker: 'agent', label: 'Agent' }
        : { speaker: 'send', label: 'Sent message' };
  }
}

/**
 * The participant's reply to an ask, drawn only when it came over the channel
 * (`ask_reply`). A sensitive ask's reply is never stored, so its bubble says so in
 * place of a body.
 */
function AskReplyBubble({ record }: { readonly record: ConversationMessage }): ReactNode {
  const reply = record.ask_reply;
  if (reply === null) return null;
  let body: ReactNode;
  if (record.ask?.sensitive === true) {
    body = <p style={mutedLineStyle}>Reply received · not stored (sensitive)</p>;
  } else if (typeof reply.answer === 'string') {
    body = <p style={verbatimStyle}>{reply.answer}</p>;
  } else {
    body = <CodeBlock code={JSON.stringify(reply.answer, null, 2)} language="json" />;
  }
  return (
    <Bubble speaker="visitor" label="Visitor · reply">
      {reply.reply_to === null ? null : <QuoteBlock quote={reply.reply_to} />}
      {body}
    </Bubble>
  );
}

/** A send record's bubbles: what was sent, then the reply over the channel, if any. */
function SendBubbles({ record }: { readonly record: ConversationMessage }): ReactNode {
  const { speaker, label } = sendBubble(record);
  return (
    <>
      {record.answer === null ? null : (
        <Bubble speaker={speaker} label={label}>
          <Markdown markdown={record.answer} />
        </Bubble>
      )}
      <AskReplyBubble record={record} />
    </>
  );
}

/**
 * The record fields the caller-scoped projection withholds, read as `null` there (and
 * `sends` as an empty list). A set value means the reader is an admin and the record
 * carries that detail.
 */
function hasAdminDetail(record: ConversationMessage): boolean {
  return record.attempts !== null || record.error !== null || record.sends.length > 0;
}

function AdminDetail({ record }: { readonly record: ConversationMessage }): ReactNode {
  return (
    <details className="tai-stack tai-stack-2" data-testid="exchange-admin-detail">
      <summary>Delivery detail</summary>
      {record.attempts === null ? null : (
        <div style={metaRowStyle}>
          <span>{`Attempts: ${String(record.attempts)}`}</span>
        </div>
      )}
      {record.sends.length === 0 ? null : (
        <ul
          style={{
            ...metaRowStyle,
            gap: 'var(--tai-space-1)',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          {record.sends.map((sent) => (
            <li key={sent.part} className="tai-mono" data-testid="exchange-sent-part">
              {`Part ${String(sent.part + 1)} · ${String(sent.chars)} chars · ${
                sent.provider_message_ids.length === 0
                  ? 'No provider message id'
                  : sent.provider_message_ids.join(', ')
              }`}
            </li>
          ))}
        </ul>
      )}
      {record.error === null ? null : <CodeBlock code={record.error} language="error" />}
    </details>
  );
}

/** Where a record's delivery stands: when, its delivery and answer chips, its successor. */
function MetaRow({
  record,
  now,
}: {
  readonly record: ConversationMessage;
  readonly now: number | undefined;
}): ReactNode {
  return (
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
      {record.successor_id === null ? null : (
        <>
          <span aria-hidden="true">·</span>
          <span>
            {record.delivery_status === 'merged' ? 'Merged into ' : 'Superseded by '}
            <span className="tai-mono">{record.successor_id}</span>
          </span>
        </>
      )}
    </div>
  );
}

/** A send made during the turn, drawn inside the turn's exchange with its own delivery state. */
function MidTurnSend({
  record,
  now,
}: {
  readonly record: ConversationMessage;
  readonly now: number | undefined;
}): ReactNode {
  const loud = isLoudDelivery(record.delivery_status);
  return (
    <div
      style={edgeStyle(loud)}
      data-testid="exchange-mid-turn-send"
      data-failed={loud ? '' : undefined}
    >
      <SendBubbles record={record} />
      <MetaRow record={record} now={now} />
      {hasAdminDetail(record) ? <AdminDetail record={record} /> : null}
    </div>
  );
}

export function Exchange({
  record,
  now,
  midTurn = [],
}: {
  readonly record: ConversationMessage;
  /** The pane's ticking clock, so the relative label stays true while it is open. */
  readonly now?: number;
  /** The sends made during this turn, drawn between the visitor's message and the answer. */
  readonly midTurn?: readonly ConversationMessage[];
}): ReactNode {
  const failed = isLoudDelivery(record.delivery_status);
  // An operator or send record has no visitor side (its `inbound_text` is empty):
  // its message rides `answer`, shown on the agent's side.
  const operator = record.origin === 'operator';
  const send = record.origin === 'send';

  return (
    <li
      style={edgeStyle(failed)}
      data-testid="conversation-exchange"
      data-failed={failed ? '' : undefined}
    >
      {send ? (
        <SendBubbles record={record} />
      ) : (
        <>
          {operator ? null : (
            <Bubble speaker="visitor" label="Visitor">
              {record.inbound_reply_to === null ? null : (
                <QuoteBlock quote={record.inbound_reply_to} />
              )}
              <p style={verbatimStyle}>{record.inbound_text}</p>
              {record.inbound_attachments && record.inbound_attachments.length > 0 ? (
                <MediaAttachments items={record.inbound_attachments} />
              ) : null}
            </Bubble>
          )}
          {midTurn.map((sent) => (
            <MidTurnSend key={sent.message_id} record={sent} now={now} />
          ))}
          {record.answer === null ? null : (
            <Bubble
              speaker={operator ? 'operator' : 'agent'}
              label={operator ? 'Operator' : 'Agent'}
            >
              <Markdown markdown={record.answer} />
            </Bubble>
          )}
        </>
      )}
      <MetaRow record={record} now={now} />
      {hasAdminDetail(record) ? <AdminDetail record={record} /> : null}
    </li>
  );
}
