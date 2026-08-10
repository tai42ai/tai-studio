/**
 * Per-format answer renderers for the interactions inbox. Each renderer
 * switches off `interaction.answer_format` and turns the human-in-the-loop question
 * into a concrete control whose "answer" is the value the `/answer` route expects:
 *
 *   - `text`     → a Textarea guarded on non-empty trimmed content; the answer is
 *                  the entered string (one-shot, so an empty submit is blocked).
 *   - `confirm`  → Yes / No buttons; the answer is a boolean.
 *   - `select`   → a RadioGroup / Select over `format_payload.options`; the answer
 *                  is the chosen string. A malformed options payload is a LOUD
 *                  inline error, never a silent empty control.
 *   - `form`     → the schema-driven `SchemaForm` over `format_payload.schema`,
 *                  validated before submit; the answer is the built object.
 *   - `external` → the external-link card: `format_payload.url` rendered via
 *                  `ExternalLinkButton`, whose href is scheme-checked (an
 *                  `http`/`https` allow-list). It has no submit — the link is
 *                  answered out-of-band via its callback URL, so its card flips to
 *                  the answered state (owned by `InteractionCard`) and then
 *                  disappears when the stream drops it.
 *
 * UNTRUSTED PAYLOADS: `interaction.question`, every `format_payload` value, and
 * every `interaction.media` item (its url + caption) arrive from callbacks and are
 * UNTRUSTED. They are ALWAYS rendered as text through the DS components (React
 * escapes them) — never interpolated as HTML, never a `dangerouslySetInnerHTML`
 * sink. Media images render through a per-item scheme gate (`MediaGallery`); links
 * through the scheme-gated `ExternalLinkButton`. Pinned by the XSS tests.
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import type { Interaction } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  ExternalLinkButton,
  Field,
  RadioGroup,
  Select,
  SchemaForm,
  Textarea,
  defaultValueForSchema,
  validateAgainstSchema,
} from '@tai42/studio-sdk';
import type { JsonSchema, SchemaFormErrors, StreamInteraction } from '@tai42/studio-sdk';

import { MediaGallery } from './media';

/** At most this many `select` options render as radios; more fall back to a Select. */
const RADIO_MAX_OPTIONS = 3;

/** Props every submittable renderer takes. `onSubmit` emits the format's answer. */
export interface AnswerRendererProps {
  readonly interaction: Interaction;
  readonly onSubmit: (answer: unknown) => void;
  readonly disabled: boolean;
}

// -- styles ------------------------------------------------------------------

const cardBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const promptStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-md)',
  fontFamily: 'var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const answerStackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
};

const answeredStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

const attributionStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
};

const malformedStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

// -- helpers -----------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value` as a `string[]`, or `null` when it is not an array of only strings. */
function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : null;
}

/**
 * A LOUD inline notice for structurally-malformed content (a bad `format_payload`
 * — bad options, a non-object form schema, a non-string url — or a malformed media
 * item). It renders as a visible `alert` rather than degrading to an empty or
 * silently-dropped control. `testId` defaults to the format-payload test id; the
 * media gallery passes its own so both callers reuse this single alert visual.
 */
export function MalformedPayload({
  message,
  testId = 'malformed-payload',
}: {
  readonly message: string;
  readonly testId?: string;
}): ReactNode {
  return (
    <div role="alert" data-testid={testId} style={malformedStyle}>
      <Badge variant="danger">Malformed</Badge>
      <span style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
        {message}
      </span>
    </div>
  );
}

// -- text --------------------------------------------------------------------

export function TextAnswer({ onSubmit, disabled }: AnswerRendererProps): ReactNode {
  const [value, setValue] = useState('');
  // Interactions are ONE-SHOT (the door 409s on an already-answered question), so a
  // stray click on an empty control would irreversibly answer `''`. A multi-line
  // textarea suits a free-text answer, and Submit stays disabled until the text has
  // non-whitespace content so an empty answer can never be sent.
  const canSubmit = !disabled && value.trim() !== '';
  return (
    <div style={answerStackStyle}>
      <Field label="Your answer">
        <Textarea
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </Field>
      <div>
        <Button
          type="button"
          variant="primary"
          disabled={!canSubmit}
          onClick={() => {
            onSubmit(value);
          }}
        >
          Submit
        </Button>
      </div>
    </div>
  );
}

// -- confirm -----------------------------------------------------------------

export function ConfirmAnswer({ onSubmit, disabled }: AnswerRendererProps): ReactNode {
  return (
    <div style={buttonRowStyle}>
      <Button
        type="button"
        variant="primary"
        disabled={disabled}
        onClick={() => {
          onSubmit(true);
        }}
      >
        Yes
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          onSubmit(false);
        }}
      >
        No
      </Button>
    </div>
  );
}

// -- select ------------------------------------------------------------------

export function SelectAnswer({ interaction, onSubmit, disabled }: AnswerRendererProps): ReactNode {
  // `''` = nothing chosen yet; the control stays CONTROLLED from first render.
  const [choice, setChoice] = useState('');
  const options = asStringArray(interaction.format_payload.options);
  if (options === null) {
    return (
      <MalformedPayload message="This select question is malformed: its options must be a list of text choices." />
    );
  }

  const items = options.map((option) => ({ value: option, label: option }));
  const control =
    options.length <= RADIO_MAX_OPTIONS ? (
      <RadioGroup options={items} value={choice} onValueChange={setChoice} disabled={disabled} />
    ) : (
      <Select
        options={items}
        value={choice}
        onValueChange={setChoice}
        disabled={disabled}
        placeholder="Choose an option…"
      />
    );

  return (
    <div style={answerStackStyle}>
      {/* A RadioGroup is a group, so the Field label carries no `for`; a Select
          renders a labelable trigger, so there it still does. */}
      <Field label="Choose an option" group={options.length <= RADIO_MAX_OPTIONS}>
        {control}
      </Field>
      <div>
        <Button
          type="button"
          variant="primary"
          disabled={disabled || choice === ''}
          onClick={() => {
            onSubmit(choice);
          }}
        >
          Submit
        </Button>
      </div>
    </div>
  );
}

// -- form --------------------------------------------------------------------

export function FormAnswer({ interaction, onSubmit, disabled }: AnswerRendererProps): ReactNode {
  const raw = interaction.format_payload.schema;
  if (!isPlainObject(raw)) {
    return (
      <MalformedPayload message="This form question is malformed: its schema must be an object." />
    );
  }
  // The permissive `JsonSchema` structural type is a plain record with an unknown
  // index signature; the renderer classifies each node at runtime.
  return <SchemaFormAnswer schema={raw} onSubmit={onSubmit} disabled={disabled} />;
}

function SchemaFormAnswer({
  schema,
  onSubmit,
  disabled,
}: {
  readonly schema: JsonSchema;
  readonly onSubmit: (answer: unknown) => void;
  readonly disabled: boolean;
}): ReactNode {
  const [value, setValue] = useState<unknown>(() => defaultValueForSchema(schema));
  const [errors, setErrors] = useState<SchemaFormErrors>({});

  const submit = (): void => {
    const found = validateAgainstSchema(schema, value);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(value);
  };

  return (
    <div style={answerStackStyle}>
      <SchemaForm schema={schema} value={value} onChange={setValue} errors={errors} />
      <div>
        <Button type="button" variant="primary" disabled={disabled} onClick={submit}>
          Submit
        </Button>
      </div>
    </div>
  );
}

// -- external link -----------------------------------------------------------

export function ExternalLinkCard({
  interaction,
}: {
  readonly interaction: Interaction;
}): ReactNode {
  const url = interaction.format_payload.url;
  if (typeof url !== 'string') {
    return (
      <MalformedPayload message="This link question is malformed: its url must be a text value." />
    );
  }
  // `ExternalLinkButton` scheme-checks the href: a `javascript:`/`data:` url is
  // neutralized to non-navigable text (an XSS pin), only `http`/`https` navigate.
  return (
    <div data-testid="external-link">
      <ExternalLinkButton url={url} />
    </div>
  );
}

// -- verified server callback ------------------------------------------------

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

// -- attribution -------------------------------------------------------------

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

// -- card wrapper ------------------------------------------------------------

/**
 * One inbox card: the (escaped) prompt plus the format's control while pending,
 * flipping to a compact "Answered" state once `interaction.answered` is set. A
 * `sensitive` question adds a "content not stored" note there, since its answer
 * body is never persisted server-side. The card itself disappears when the stream
 * drops the interaction (`interaction.removed`) — that lifecycle is owned by
 * `useInteractionsStream`, not this component.
 */
export function InteractionCard({
  interaction,
  onSubmit,
  disabled,
}: {
  readonly interaction: StreamInteraction;
  readonly onSubmit: (answer: unknown) => void;
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
          <FormatBody interaction={interaction} onSubmit={onSubmit} disabled={disabled} />
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
