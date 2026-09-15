/**
 * The inbox card and its per-format dispatch.
 *
 * UNTRUSTED PAYLOADS: `interaction.question`, every `format_payload` value, and every
 * `interaction.media` item arrive from callbacks and are UNTRUSTED. They render ALWAYS
 * as text through DS components (React escapes them) — never as HTML, never a
 * `dangerouslySetInnerHTML` sink. Images render through a per-item scheme gate
 * (`MediaGallery`); links through the scheme-gated `ExternalLinkButton`. Pinned by the
 * XSS tests.
 */
import type { StreamInteraction } from '@tai42/studio-sdk';
import { Badge, Button, Card } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { MediaGallery } from '../media';
import type { AnswerRendererProps } from './answer-schema';
import { ConfirmAnswer } from './confirm-answer';
import { ExternalLinkCard } from './external-link-card';
import { FormAnswer } from './form-answer';
import { MalformedPayload } from './malformed-payload';
import {
  answeredStyle,
  attributionStyle,
  cancelRowStyle,
  cardBodyStyle,
  promptStyle,
} from './renderer-styles';
import { SelectAnswer } from './select-answer';
import { TextAnswer } from './text-answer';

/**
 * A NON-actionable pending card for an external question that is answered by a
 * signed server-to-server callback, never by a human. The browser confirm page is
 * suppressed server-side, so the clickable external-link card would be a dead link;
 * this shows a plain "awaiting" status instead and flips to answered when the
 * signed callback resolves the interaction (its `interaction.answered` frame).
 */
export function VerifiedCallbackPending(): ReactNode {
  return (
    <div role="status" data-testid="verified-callback-pending" style={answeredStyle}>
      <Badge variant="neutral">Pending</Badge>
      <span style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
        awaiting a verified server callback
      </span>
    </div>
  );
}

/**
 * Secondary attribution badges on a card: `recipient` (the channel delivery
 * address, labeled "to"), `audience` (the addressed user_id, labeled "for"), and
 * `origin` (the asking tool run's id, labeled "run"). Each rides the frame only
 * when set — an absent field renders nothing, and with none present the block is
 * omitted entirely so a plain inbox card is unchanged.
 */
function Attribution({ interaction }: { readonly interaction: StreamInteraction }): ReactNode {
  const { recipient, audience, origin } = interaction;
  if (recipient === undefined && audience === undefined && origin === undefined) return null;
  return (
    <div data-testid="interaction-attribution" style={attributionStyle}>
      {recipient !== undefined ? (
        <span data-testid="interaction-recipient">
          <Badge variant="neutral">to {recipient}</Badge>
        </span>
      ) : null}
      {audience !== undefined ? (
        <span data-testid="interaction-audience">
          <Badge variant="neutral">for {audience}</Badge>
        </span>
      ) : null}
      {origin !== undefined ? (
        <span data-testid="interaction-origin">
          <Badge variant="neutral">run {origin}</Badge>
        </span>
      ) : null}
    </div>
  );
}

/**
 * One inbox card: the (escaped) prompt plus the format's control while pending,
 * flipping to a compact "Answered" state once `interaction.answered` is set. A
 * `sensitive` question adds a "content not stored" note there, since its answer
 * body is never persisted server-side. The card itself disappears when the stream
 * drops the interaction (`interaction.removed`) — that lifecycle is owned by
 * `useInteractionsStream`, not this component.
 *
 * A PENDING card also carries a quiet "Cancel question" ghost action when the page
 * supplies `onCancel`: it withdraws the ask without answering it (the flow that
 * asked never resumes). The action rides ONLY the pending branch — an answered card
 * is already terminal, so there is nothing to withdraw. The confirm dialog and the
 * cancel request itself are owned by the page, not this card.
 */
export function InteractionCard({
  interaction,
  onSubmit,
  onCancel,
  disabled,
}: {
  readonly interaction: StreamInteraction;
  readonly onSubmit: (answer: unknown) => void;
  /** Open the page's withdraw-confirm for this pending question. Omitted → no action. */
  readonly onCancel?: () => void;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <Card>
      <div
        style={cardBodyStyle}
        data-testid="interaction-card"
        data-interaction-id={interaction.interaction_id}
      >
        <p style={promptStyle}>{interaction.question}</p>
        {Array.isArray(interaction.media) && interaction.media.length > 0 ? (
          <MediaGallery media={interaction.media} />
        ) : null}
        {interaction.channel !== undefined ? (
          <div data-testid="interaction-channel">
            <Badge variant="neutral">via {interaction.channel}</Badge>
          </div>
        ) : null}
        <Attribution interaction={interaction} />
        {interaction.answered ? (
          <div role="status" data-testid="interaction-answered" style={answeredStyle}>
            <Badge variant="success">Answered</Badge>
            {interaction.sensitive ? (
              <span
                data-testid="interaction-sensitive-note"
                style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}
              >
                content not stored
              </span>
            ) : null}
          </div>
        ) : (
          <>
            <FormatBody interaction={interaction} onSubmit={onSubmit} disabled={disabled} />
            {onCancel !== undefined ? (
              <div style={cancelRowStyle}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  data-testid="interaction-cancel"
                  onClick={onCancel}
                >
                  Cancel question
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

/** Dispatch a pending interaction to its per-format renderer. */
function FormatBody({ interaction, onSubmit, disabled }: AnswerRendererProps): ReactNode {
  switch (interaction.answer_format) {
    case 'text':
      return <TextAnswer interaction={interaction} onSubmit={onSubmit} disabled={disabled} />;
    case 'confirm':
      return <ConfirmAnswer interaction={interaction} onSubmit={onSubmit} disabled={disabled} />;
    case 'select':
      return <SelectAnswer interaction={interaction} onSubmit={onSubmit} disabled={disabled} />;
    case 'form':
      return <FormAnswer interaction={interaction} onSubmit={onSubmit} disabled={disabled} />;
    case 'external':
      // A server-verified external question is resolved by a signed callback, not
      // the human — render a non-actionable pending status, never the clickable
      // (and here dead) external-link card.
      return interaction.server_verified === true ? (
        <VerifiedCallbackPending />
      ) : (
        <ExternalLinkCard interaction={interaction} />
      );
    default:
      // The stream validates `answer_format` against the known set, so this is
      // unreachable in practice — a loud fallback rather than a silent blank if
      // an unknown format ever slips through.
      return <MalformedPayload message="This question has an unsupported format." />;
  }
}
