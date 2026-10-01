import type {
  FormOption,
  FormPage,
  FormReactions,
  FormUpdate,
  ReactionEvent,
} from '@tai42/api-client';
import { schemas } from '@tai42/api-client';
import type { JsonSchema, SchemaFormErrors } from '@tai42/studio-sdk';
import { Button, SchemaForm, validateAgainstSchema } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';

import { useFormReactor } from '../reaction-config';
import type { AnswerRendererProps } from './answer-schema';
import { initialFormValue, isPlainObject, schemaWithSendOptions } from './answer-schema';
import { DisplayBlocks, ReviewReadback } from './form-display';
import { MalformedPayload } from './malformed-payload';
import {
  answerStackStyle,
  contextHeadingStyle,
  contextListStyle,
  formContextStyle,
  malformedStyle,
  optionFieldStyle,
  optionRowStyle,
  optionValuesStyle,
  stepNavStyle,
} from './renderer-styles';

/** An inert reactions declaration — a static form that never calls a reaction handler. */
const NO_REACTIONS: FormReactions = {
  field_changed: [],
  page_advanced: [],
  submitted: false,
  choices: [],
};

/** The parsed form payload, or the loud message to show when a block is malformed. */
type ParsedForm =
  | { readonly malformed: string }
  | {
      readonly schema: JsonSchema;
      readonly values: Record<string, unknown>;
      readonly options: Record<string, readonly FormOption[]>;
      readonly pages: readonly FormPage[];
      readonly reactions: FormReactions;
    };

/** Sentinel distinguishing a malformed optional block from an absent (undefined) one. */
const MALFORMED = Symbol('malformed');

/** Parse one optional payload block: absent → undefined, malformed → the sentinel. */
function optionalBlock<T>(
  raw: unknown,
  parse: (value: unknown) => { success: true; data: T } | { success: false },
): T | undefined | typeof MALFORMED {
  if (raw === undefined) return undefined;
  const parsed = parse(raw);
  return parsed.success ? parsed.data : MALFORMED;
}

/**
 * Parse `schema`/`data`/`pages`/`reactions` off the form payload. An absent block leaves
 * the bare form; a present-but-malformed one is a LOUD message, never a silent drop — the
 * server validates each before delivery, so a bad shape here is a corrupt frame.
 */
function parseFormPayload(payload: Record<string, unknown>): ParsedForm {
  const schema = payload.schema;
  if (!isPlainObject(schema)) {
    return { malformed: 'This form question is malformed: its schema must be an object.' };
  }
  const data = optionalBlock(payload.data, (v) => schemas.formData.safeParse(v));
  if (data === MALFORMED) {
    return {
      malformed:
        'This form question is malformed: its prefilled data is not in the expected shape.',
    };
  }
  const pages = optionalBlock(payload.pages, (v) => schemas.formPages.safeParse(v));
  if (pages === MALFORMED) {
    return {
      malformed: 'This form question is malformed: its pages are not in the expected shape.',
    };
  }
  const reactions = optionalBlock(payload.reactions, (v) => schemas.formReactions.safeParse(v));
  if (reactions === MALFORMED) {
    return {
      malformed: 'This form question is malformed: its reactions are not in the expected shape.',
    };
  }
  return {
    schema,
    values: data?.values ?? {},
    options: data?.options ?? {},
    pages: pages ?? [],
    reactions: reactions ?? NO_REACTIONS,
  };
}

export function FormAnswer({ interaction, onSubmit, disabled }: AnswerRendererProps): ReactNode {
  const parsed = parseFormPayload(interaction.format_payload);
  if ('malformed' in parsed) return <MalformedPayload message={parsed.malformed} />;
  return (
    <SchemaFormAnswer
      interactionId={interaction.interaction_id}
      schema={parsed.schema}
      values={parsed.values}
      options={parsed.options}
      pages={parsed.pages}
      reactions={parsed.reactions}
      onSubmit={onSubmit}
      disabled={disabled}
    />
  );
}

function SchemaFormAnswer({
  interactionId,
  schema,
  values,
  options: initialOptions,
  pages,
  reactions,
  onSubmit,
  disabled,
}: {
  readonly interactionId: string;
  readonly schema: JsonSchema;
  readonly values: Record<string, unknown>;
  readonly options: Record<string, readonly FormOption[]>;
  readonly pages: readonly FormPage[];
  readonly reactions: FormReactions;
  readonly onSubmit: (answer: unknown) => void;
  readonly disabled: boolean;
}): ReactNode {
  // The reaction door is chosen by the serving page (scope A): a host-provided same-origin
  // endpoint (the web channel plugin's own session door), or — by default — the in-app
  // authenticated door. Either way the round-trip POSTs `{event, values}`.
  const react = useFormReactor(interactionId);

  // Per-send options may be REPLACED by a reaction while the form is open (scope A), so
  // they are state, not a prop: the control re-renders against the current option set.
  const [options, setOptions] = useState(initialOptions);
  // The schema the controls and the validator both use: the published schema with each
  // re-optioned property's enum set to this send's values. Prefilled `values` seed the
  // initial value on top.
  const effectiveSchema = useMemo(() => schemaWithSendOptions(schema, options), [schema, options]);
  const [value, setValue] = useState<unknown>(() => initialFormValue(effectiveSchema, values));
  const [validationErrors, setValidationErrors] = useState<SchemaFormErrors>({});
  // Per-field messages a reaction returned (kept apart from the client validation bag so a
  // reaction that returns no errors clears its own prior ones without wiping a live
  // client-validation error).
  const [reactionErrors, setReactionErrors] = useState<SchemaFormErrors>({});
  // Display slots, seeded from the send data and overwritten by a reaction's `display`
  // update — this is how a computed total (a display slot, not a special case) is shown.
  const [slots, setSlots] = useState<Record<string, unknown>>(() => ({ ...values }));
  const [step, setStep] = useState(0);
  const [reacting, setReacting] = useState(false);
  const [reactionError, setReactionError] = useState<string | null>(null);
  // Only the latest reaction's response is applied: a slow earlier round-trip must never
  // overwrite a later one (field changes can fire several in flight).
  const reactionSeq = useRef(0);

  const objectValue = isPlainObject(value) ? value : {};
  const errors: SchemaFormErrors = { ...validationErrors, ...reactionErrors };
  const busy = disabled || reacting;

  const applyUpdate = (update: FormUpdate): void => {
    if (Object.keys(update.values).length > 0) {
      setValue((current: unknown) => ({
        ...(isPlainObject(current) ? current : {}),
        ...update.values,
      }));
    }
    if (Object.keys(update.options).length > 0) {
      setOptions((current) => ({ ...current, ...update.options }));
    }
    setReactionErrors(update.errors);
    if (Object.keys(update.display).length > 0) {
      setSlots((current) => ({ ...current, ...update.display }));
    }
  };

  // Run one reaction round-trip for `event`, carrying the partial `values` filled so far,
  // and apply the returned update. A handler error/timeout surfaces LOUDLY (the reaction
  // banner) and never leaves a stale value behind — it returns null so the caller can
  // hold a page/submit. Returns the applied update, or null on failure.
  const fireReaction = async (
    event: ReactionEvent,
    partial: unknown,
  ): Promise<FormUpdate | null> => {
    const seq = ++reactionSeq.current;
    setReacting(true);
    setReactionError(null);
    try {
      const update = await react(event, partial);
      if (seq !== reactionSeq.current) return update;
      applyUpdate(update);
      return update;
    } catch (error) {
      if (seq === reactionSeq.current) {
        setReactionError(error instanceof Error ? error.message : String(error));
      }
      return null;
    } finally {
      if (seq === reactionSeq.current) setReacting(false);
    }
  };

  const handleChange = (next: unknown): void => {
    const changed = changedTopLevelKeys(value, next);
    setValue(next);
    const triggered = changed.find((key) => reactions.field_changed.includes(key));
    if (triggered !== undefined) {
      void fireReaction({ kind: 'field_changed', field: triggered }, next);
    }
  };

  const validateWhole = (): boolean => {
    const found = validateAgainstSchema(effectiveSchema, value);
    setValidationErrors(found);
    return Object.keys(found).length === 0;
  };

  const submit = async (): Promise<void> => {
    if (!validateWhole()) return;
    if (reactions.submitted) {
      const update = await fireReaction({ kind: 'submitted' }, value);
      // The reaction failed loudly, or the consumer refused with per-field errors: keep
      // the form open rather than accepting an unvetted answer.
      if (update === null || Object.keys(update.errors).length > 0) return;
    }
    onSubmit(value);
  };

  // No declared pages: the whole form on one surface, exactly as before.
  if (pages.length === 0) {
    return (
      <SinglePageForm
        schema={effectiveSchema}
        value={value}
        errors={errors}
        options={options}
        reactionError={reactionError}
        busy={busy}
        onChange={handleChange}
        onSubmit={() => void submit()}
      />
    );
  }

  const currentPage = pages[step];
  if (currentPage === undefined) {
    return <MalformedPayload message="This form question is malformed: it has no pages to show." />;
  }

  const advance = async (): Promise<void> => {
    const found = validateAgainstSchema(pageInputSchema(effectiveSchema, currentPage), value);
    setValidationErrors(found);
    if (Object.keys(found).length > 0) return;
    if (reactions.page_advanced.includes(currentPage.title)) {
      const update = await fireReaction({ kind: 'page_advanced', page: currentPage.title }, value);
      if (update === null || Object.keys(update.errors).length > 0) return;
    }
    setValidationErrors({});
    setStep(step + 1);
  };

  const back = (): void => {
    setValidationErrors({});
    setReactionErrors({});
    setReactionError(null);
    setStep(step - 1);
  };

  return (
    <SteppedForm
      pages={pages}
      step={step}
      currentPage={currentPage}
      isLast={step === pages.length - 1}
      schema={effectiveSchema}
      pageSchema={pageInputSchema(effectiveSchema, currentPage)}
      objectValue={objectValue}
      value={value}
      errors={errors}
      options={options}
      slots={slots}
      reactionError={reactionError}
      busy={busy}
      onChange={handleChange}
      onBack={back}
      onNext={() => void advance()}
      onSubmit={() => void submit()}
    />
  );
}

/** The single-form surface: the whole schema, the options legend, and Submit. */
function SinglePageForm({
  schema,
  value,
  errors,
  options,
  reactionError,
  busy,
  onChange,
  onSubmit,
}: {
  readonly schema: JsonSchema;
  readonly value: unknown;
  readonly errors: SchemaFormErrors;
  readonly options: Record<string, readonly FormOption[]>;
  readonly reactionError: string | null;
  readonly busy: boolean;
  readonly onChange: (value: unknown) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <div style={answerStackStyle}>
      <ReactionErrorNotice message={reactionError} />
      <SchemaForm schema={schema} value={value} onChange={onChange} errors={errors} />
      <FormSendOptions options={options} />
      <div>
        <Button type="button" variant="primary" disabled={busy} onClick={onSubmit}>
          Submit
        </Button>
      </div>
    </div>
  );
}

/** The stepped surface: a step status, the page's display blocks, its body (fields or a
 *  review readback), the options legend, and the Back / Next / Submit navigation. */
function SteppedForm({
  pages,
  step,
  currentPage,
  isLast,
  schema,
  pageSchema,
  objectValue,
  value,
  errors,
  options,
  slots,
  reactionError,
  busy,
  onChange,
  onBack,
  onNext,
  onSubmit,
}: {
  readonly pages: readonly FormPage[];
  readonly step: number;
  readonly currentPage: FormPage;
  readonly isLast: boolean;
  readonly schema: JsonSchema;
  readonly pageSchema: JsonSchema;
  readonly objectValue: Record<string, unknown>;
  readonly value: unknown;
  readonly errors: SchemaFormErrors;
  readonly options: Record<string, readonly FormOption[]>;
  readonly slots: Record<string, unknown>;
  readonly reactionError: string | null;
  readonly busy: boolean;
  readonly onChange: (value: unknown) => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <div style={answerStackStyle}>
      <FormStepStatus pages={pages} step={step} />
      <ReactionErrorNotice message={reactionError} />
      <DisplayBlocks blocks={currentPage.display} slots={slots} />
      {currentPage.kind === 'review' ? (
        <ReviewReadback schema={schema} value={objectValue} />
      ) : (
        <SchemaForm schema={pageSchema} value={value} onChange={onChange} errors={errors} />
      )}
      <FormSendOptions options={options} />
      <div style={stepNavStyle}>
        <div>
          {step > 0 ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={onBack}>
              Back
            </Button>
          ) : null}
        </div>
        <div>
          {isLast ? (
            <Button type="button" variant="primary" disabled={busy} onClick={onSubmit}>
              {currentPage.kind === 'review' ? 'Confirm' : 'Submit'}
            </Button>
          ) : (
            <Button type="button" variant="primary" disabled={busy} onClick={onNext}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The top-level keys whose value differs between the previous and next form value. */
function changedTopLevelKeys(previous: unknown, next: unknown): string[] {
  const before = isPlainObject(previous) ? previous : {};
  const after = isPlainObject(next) ? next : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => before[key] !== after[key]);
}

/**
 * The schema a single page answers against: the form schema narrowed to this page's
 * declared fields (and the required set narrowed to them). The whole value object flows
 * through unchanged, so a conditional predicate that references a field on another page
 * still resolves and no entered value is dropped between steps.
 */
function pageInputSchema(schema: JsonSchema, page: FormPage): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const name of page.fields) {
    const prop = schema.properties?.[name];
    if (prop !== undefined) properties[name] = prop;
  }
  const required = (schema.required ?? []).filter((name) => page.fields.includes(name));
  return { ...schema, properties, required };
}

/** The current step as "Step N of M (title)" — a plain, live progress line. */
function FormStepStatus({
  pages,
  step,
}: {
  readonly pages: readonly FormPage[];
  readonly step: number;
}): ReactNode {
  const page = pages[step];
  if (page === undefined) return null;
  return (
    <section style={formContextStyle} data-testid="form-step-status" aria-label="Step">
      <p style={contextHeadingStyle}>
        {`Step ${String(step + 1)} of ${String(pages.length)}`}
        {page.title !== '' ? ` — ${page.title}` : ''}
      </p>
    </section>
  );
}

/** A LOUD banner for a failed reaction round-trip — never a silent or stale value. */
function ReactionErrorNotice({ message }: { readonly message: string | null }): ReactNode {
  if (message === null) return null;
  return (
    <p
      role="alert"
      data-testid="form-reaction-error"
      className="tai-field-error"
      style={malformedStyle}
    >
      {`The form could not update: ${message}`}
    </p>
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
 * block is absent. It reflects the CURRENT option set, so a reaction that replaces a
 * field's choices updates the legend too.
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
