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
 *                  validated before submit; the answer is the built object. Any
 *                  per-send `data.values` prefill its controls; each field named in
 *                  `data.options` renders as a choice of that send's values (the
 *                  schema's enum for the property is replaced for this send); and the
 *                  value→label mapping and the `pages` outline show as read-only context.
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
import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { schemas } from '@tai42/api-client';
import type { FormOption, FormPage, Interaction } from '@tai42/api-client';
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

// The withdraw action is a QUIET, secondary affordance: right-aligned and ghost, so
// it sits apart from the format's primary Submit and never competes with answering.
const cancelRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
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

// A read-only context block beside the form (the per-send options and the pages
// outline): a small heading over a muted list, distinct from the answer controls.
const formContextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

const contextHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text)',
};

const contextListStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const pagesListStyle: CSSProperties = {
  ...contextListStyle,
  paddingLeft: 'var(--tai-space-5)',
};

const optionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
};

const optionFieldStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--tai-font-mono)',
  color: 'var(--tai-color-text)',
};

const optionValuesStyle: CSSProperties = {
  margin: 0,
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

  // An absent `data`/`pages` leaves the preview exactly the bare form. A
  // present-but-malformed block is a LOUD notice, never a silent drop: the server
  // validates both against the schema before delivery, so a bad shape here is a
  // corrupt frame, refused like a non-object schema rather than answered against a
  // half-understood prefill.
  const rawData = interaction.format_payload.data;
  const parsedData = rawData === undefined ? null : schemas.formData.safeParse(rawData);
  if (parsedData !== null && !parsedData.success) {
    return (
      <MalformedPayload message="This form question is malformed: its prefilled data is not in the expected shape." />
    );
  }

  const rawPages = interaction.format_payload.pages;
  const parsedPages = rawPages === undefined ? null : schemas.formPages.safeParse(rawPages);
  if (parsedPages !== null && !parsedPages.success) {
    return (
      <MalformedPayload message="This form question is malformed: its pages are not in the expected shape." />
    );
  }

  // The permissive `JsonSchema` structural type is a plain record with an unknown
  // index signature; the renderer classifies each node at runtime.
  return (
    <SchemaFormAnswer
      schema={raw}
      values={parsedData?.data.values ?? {}}
      options={parsedData?.data.options ?? {}}
      pages={parsedPages?.data ?? []}
      onSubmit={onSubmit}
      disabled={disabled}
    />
  );
}

/** Whether a property node is array-shaped (`type: "array"`, alone or in a union). */
function isArraySchema(schema: JsonSchema): boolean {
  const { type } = schema;
  return Array.isArray(type) ? type.includes('array') : type === 'array';
}

/**
 * The schema the operator actually answers against. For every top-level property the
 * send re-optioned, its `enum` becomes that send's option VALUES — so the control
 * renders as a choice of exactly the valid values instead of a free control that only
 * fails at the answer door. This REPLACES any enum the published schema carried for
 * that property, for this send only. The served payload is never mutated: a fresh
 * derived schema is built, sharing untouched nodes. A property named in `options`
 * always exists and is string- or array-of-strings-typed (the ask door rejects any
 * other), so the enum lands on the property itself, or on an array's `items`.
 */
function schemaWithSendOptions(
  schema: JsonSchema,
  options: Record<string, readonly FormOption[]>,
): JsonSchema {
  const active = Object.entries(options).filter(([, list]) => list.length > 0);
  const properties = schema.properties;
  if (active.length === 0 || properties === undefined) return schema;
  const nextProperties: Record<string, JsonSchema> = { ...properties };
  for (const [field, list] of active) {
    const prop = properties[field];
    if (prop === undefined) continue;
    const values = list.map((option) => option.value);
    nextProperties[field] = isArraySchema(prop)
      ? { ...prop, items: { ...prop.items, enum: values } }
      : { ...prop, enum: values };
  }
  return { ...schema, properties: nextProperties };
}

/**
 * The initial form value: the schema's defaults with any per-send `values` laid over
 * the top-level properties. A form schema is object-shaped, so the overlay is a
 * shallow merge; a non-object seed (no valid property to key onto) keeps the default.
 */
function initialFormValue(schema: JsonSchema, values: Record<string, unknown>): unknown {
  const base = defaultValueForSchema(schema);
  if (Object.keys(values).length === 0) return base;
  return isPlainObject(base) ? { ...base, ...values } : base;
}

function SchemaFormAnswer({
  schema,
  values,
  options,
  pages,
  onSubmit,
  disabled,
}: {
  readonly schema: JsonSchema;
  readonly values: Record<string, unknown>;
  readonly options: Record<string, readonly FormOption[]>;
  readonly pages: readonly FormPage[];
  readonly onSubmit: (answer: unknown) => void;
  readonly disabled: boolean;
}): ReactNode {
  // The schema the controls and the validator both use: the published schema with each
  // re-optioned property's enum set to this send's values, so the operator picks from
  // the valid set in the control and a bad choice cannot be typed. Prefilled `values`
  // seed the initial value on top; a prefill outside the per-send set cannot occur
  // (the ask door validates each value against the effective schema before delivery).
  const effectiveSchema = useMemo(() => schemaWithSendOptions(schema, options), [schema, options]);
  const [value, setValue] = useState<unknown>(() => initialFormValue(effectiveSchema, values));
  const [errors, setErrors] = useState<SchemaFormErrors>({});

  const submit = (): void => {
    const found = validateAgainstSchema(effectiveSchema, value);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(value);
  };

  return (
    <div style={answerStackStyle}>
      <FormPagesOutline pages={pages} />
      <SchemaForm schema={effectiveSchema} value={value} onChange={setValue} errors={errors} />
      <FormSendOptions options={options} />
      <div>
        <Button type="button" variant="primary" disabled={disabled} onClick={submit}>
          Submit
        </Button>
      </div>
    </div>
  );
}

/** The read-only "Pages" outline: each page's title over the fields it groups. */
function FormPagesOutline({ pages }: { readonly pages: readonly FormPage[] }): ReactNode {
  if (pages.length === 0) return null;
  return (
    <section style={formContextStyle} data-testid="form-pages" aria-label="Pages">
      <p style={contextHeadingStyle}>Pages</p>
      <ol style={pagesListStyle}>
        {pages.map((page, index) => (
          <li key={index}>
            <span style={{ color: 'var(--tai-color-text)' }}>{page.title}</span>
            {page.fields.length > 0 ? <span> — {page.fields.join(', ')}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * One option as text. The re-optioned control shows the VALUE, so a labelled option
 * reads `label (value)` to make the value→label mapping legible; an unlabelled one (or
 * a label equal to the value) is just the value, never an empty choice.
 */
function optionText(option: FormOption): string {
  const label = typeof option.label === 'string' ? option.label.trim() : '';
  return label !== '' && label !== option.value ? `${label} (${option.value})` : option.value;
}

/**
 * The read-only "Options for this send" list: per field, the value→label mapping this
 * send offered — the control renders the values, so this block names what each means.
 * A field whose per-send list is empty is omitted; with no field carrying one the whole
 * block is absent.
 */
function FormSendOptions({
  options,
}: {
  readonly options: Record<string, readonly FormOption[]>;
}): ReactNode {
  const fields = Object.entries(options).filter(([, list]) => list.length > 0);
  if (fields.length === 0) return null;
  return (
    <section
      style={formContextStyle}
      data-testid="form-send-options"
      aria-label="Options for this send"
    >
      <p style={contextHeadingStyle}>Options for this send</p>
      <dl style={contextListStyle}>
        {fields.map(([field, list]) => (
          <div key={field} style={optionRowStyle}>
            <dt style={optionFieldStyle}>{field}</dt>
            <dd style={optionValuesStyle}>{list.map(optionText).join(', ')}</dd>
          </div>
        ))}
      </dl>
    </section>
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
