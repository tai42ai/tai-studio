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
import type { AnswerRendererProps, FormFieldWords } from './answer-schema';
import {
  formFieldWording,
  initialFormValue,
  isPlainObject,
  nonBlankString,
  schemaWithSendOptions,
  wordingOf,
} from './answer-schema';
import { DisplayBlocks, ReviewReadback } from './form-display';
import {
  FormStepStatus,
  ReactionErrorNotice,
  type ReactionFailure,
  reactionFailure,
} from './form-lines';
import { MalformedPayload } from './malformed-payload';
import {
  answerStackStyle,
  contextHeadingStyle,
  contextListStyle,
  formContextStyle,
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
  // The form's caller words off the one `wording` catalogue: `back` labels the stepped
  // form's Back button, `submit` the single-page form's terminal button, `update_failed`
  // the could-not-update line, `step_progress` the stepped form's progress line, and
  // `fields` the per-field words the SchemaForm, the validator and the readback draw.
  const form = wordingOf(interaction.format_payload)?.form;
  return (
    <SchemaFormAnswer
      interactionId={interaction.interaction_id}
      schema={parsed.schema}
      values={parsed.values}
      options={parsed.options}
      pages={parsed.pages}
      reactions={parsed.reactions}
      backLabel={nonBlankString(form?.back)}
      submitLabel={nonBlankString(form?.submit)}
      updateFailedLabel={nonBlankString(form?.update_failed)}
      stepProgressLabel={nonBlankString(form?.step_progress)}
      fieldWording={formFieldWording(form?.fields)}
      onSubmit={onSubmit}
      disabled={disabled}
    />
  );
}

interface SchemaFormAnswerProps {
  readonly interactionId: string;
  readonly schema: JsonSchema;
  readonly values: Record<string, unknown>;
  readonly options: Record<string, readonly FormOption[]>;
  readonly pages: readonly FormPage[];
  readonly reactions: FormReactions;
  /** The caller's Back-button label (`wording.form.back`); absent shows "Back". */
  readonly backLabel: string | undefined;
  /** The caller's single-page submit label (`wording.form.submit`); absent shows "Submit". */
  readonly submitLabel: string | undefined;
  /**
   * The caller's could-not-update line (`wording.form.update_failed`), its `{reason}` filled
   * with the server door's reason; absent shows "The form could not update: <message>".
   */
  readonly updateFailedLabel: string | undefined;
  /**
   * The caller's progress line (`wording.form.step_progress`), its `{step}` / `{steps}`
   * filled; absent shows "Step <step> of <steps>".
   */
  readonly stepProgressLabel: string | undefined;
  /** Per-field words (`wording.form.fields`): the SDK's field words and the readback's. */
  readonly fieldWording: Readonly<Record<string, FormFieldWords>> | undefined;
  readonly onSubmit: (answer: unknown) => void;
  readonly disabled: boolean;
}

function SchemaFormAnswer({
  interactionId,
  schema,
  values,
  options: initialOptions,
  pages,
  reactions,
  backLabel,
  submitLabel,
  updateFailedLabel,
  stepProgressLabel,
  fieldWording,
  onSubmit,
  disabled,
}: SchemaFormAnswerProps): ReactNode {
  // The reaction door is chosen by the serving page: a host-provided same-origin
  // endpoint (the web channel plugin's own session door), or — by default — the in-app
  // authenticated door. Either way the round-trip POSTs `{event, values}`.
  const react = useFormReactor(interactionId);

  // Per-send options may be REPLACED by a reaction while the form is open, so
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
  const [reactionError, setReactionError] = useState<ReactionFailure | null>(null);
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
      if (seq === reactionSeq.current) setReactionError(reactionFailure(error));
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
    const found = validateAgainstSchema(effectiveSchema, value, { fieldWording });
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

  // No declared pages: the whole form on one surface.
  if (pages.length === 0) {
    return (
      <SinglePageForm
        schema={effectiveSchema}
        value={value}
        errors={errors}
        options={options}
        fieldWording={fieldWording}
        submitLabel={submitLabel}
        updateFailedLabel={updateFailedLabel}
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
    const found = validateAgainstSchema(pageInputSchema(effectiveSchema, currentPage), value, {
      fieldWording,
    });
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
      backLabel={backLabel}
      stepProgressLabel={stepProgressLabel}
      updateFailedLabel={updateFailedLabel}
      fieldWording={fieldWording}
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
  fieldWording,
  submitLabel,
  updateFailedLabel,
  reactionError,
  busy,
  onChange,
  onSubmit,
}: {
  readonly schema: JsonSchema;
  readonly value: unknown;
  readonly errors: SchemaFormErrors;
  readonly options: Record<string, readonly FormOption[]>;
  readonly fieldWording: Readonly<Record<string, FormFieldWords>> | undefined;
  readonly submitLabel: string | undefined;
  readonly updateFailedLabel: string | undefined;
  readonly reactionError: ReactionFailure | null;
  readonly busy: boolean;
  readonly onChange: (value: unknown) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <div style={answerStackStyle}>
      <ReactionErrorNotice failure={reactionError} label={updateFailedLabel} />
      <SchemaForm
        schema={schema}
        value={value}
        onChange={onChange}
        errors={errors}
        fieldWording={fieldWording}
      />
      <FormSendOptions options={options} />
      <div>
        {/* The terminal button carries the caller's `wording.form.submit`, else "Submit". */}
        <Button type="button" variant="primary" disabled={busy} onClick={onSubmit}>
          {submitLabel ?? 'Submit'}
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
  backLabel,
  stepProgressLabel,
  updateFailedLabel,
  fieldWording,
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
  readonly backLabel: string | undefined;
  readonly stepProgressLabel: string | undefined;
  readonly updateFailedLabel: string | undefined;
  readonly fieldWording: Readonly<Record<string, FormFieldWords>> | undefined;
  readonly reactionError: ReactionFailure | null;
  readonly busy: boolean;
  readonly onChange: (value: unknown) => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <div style={answerStackStyle}>
      <FormStepStatus pages={pages} step={step} label={stepProgressLabel} />
      <ReactionErrorNotice failure={reactionError} label={updateFailedLabel} />
      <DisplayBlocks blocks={currentPage.display} slots={slots} />
      {currentPage.kind === 'review' ? (
        <ReviewReadback schema={schema} value={objectValue} fieldWording={fieldWording} />
      ) : (
        <SchemaForm
          schema={pageSchema}
          value={value}
          onChange={onChange}
          errors={errors}
          fieldWording={fieldWording}
        />
      )}
      <FormSendOptions options={options} />
      <div style={stepNavStyle}>
        <div>
          {step > 0 ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={onBack}>
              {backLabel ?? 'Back'}
            </Button>
          ) : null}
        </div>
        <div>
          {/* The page's primary button carries the caller's `button_label`, else the
              surface's own word ("Confirm"/"Submit" on the last step, "Next" before). */}
          {isLast ? (
            <Button type="button" variant="primary" disabled={busy} onClick={onSubmit}>
              {currentPage.button_label ?? (currentPage.kind === 'review' ? 'Confirm' : 'Submit')}
            </Button>
          ) : (
            <Button type="button" variant="primary" disabled={busy} onClick={onNext}>
              {currentPage.button_label ?? 'Next'}
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
  const declared = schema.properties ?? {};
  // Built from entries so every field name, `__proto__` included, lands as an own key.
  const properties = Object.fromEntries(
    page.fields.flatMap((name) => {
      const prop = Object.hasOwn(declared, name) ? declared[name] : undefined;
      return prop === undefined ? [] : [[name, prop] as const];
    }),
  );
  const required = (schema.required ?? []).filter((name) => page.fields.includes(name));
  return { ...schema, properties, required };
}

/**
 * One option as text. The re-optioned control shows the VALUE, so a labelled option
 * reads `label (value)` to make the value→label mapping legible; an unlabelled one (or
 * a label equal to the value) is just the value, never an empty choice. An option's
 * second line (`description`) is appended as ` — <description>`; a null or blank
 * description is absent and adds nothing.
 */
function optionText(option: FormOption): string {
  const label = typeof option.label === 'string' ? option.label.trim() : '';
  const head = label !== '' && label !== option.value ? `${label} (${option.value})` : option.value;
  const description = typeof option.description === 'string' ? option.description.trim() : '';
  return description !== '' ? `${head} — ${description}` : head;
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
