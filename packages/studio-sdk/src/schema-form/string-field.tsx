/**
 * The string field renderer. A plain string renders as a text input (its
 * `type` derived from any JSON-Schema `format`); an expression-annotated schema
 * renders the INJECTED expression door (a resting textarea with the visual-editor
 * button) when the host supplies one; a media-annotated schema renders the upload
 * control instead; and when the form supplies a completion provider, the input is
 * backed by argument autocomplete.
 *
 * NO JQ EDGE. This module — and every module under `schema-form`, and the package
 * barrel above them — names no jq type and imports `@tai42/jq-studio` neither
 * statically NOR dynamically.
 * The jq authoring door drags a heavy subgraph (the xyflow visual editor, a Web
 * Worker entry, and a multi-megabyte wasm engine), and a bundler EMITS that whole
 * subgraph for a dynamic import just as it does for a static one — `lazy` defers
 * the FETCH, never the emission. A consumer that bundles the SDK to render forms
 * would still ship the chunks, the worker file, and the wasm it can never run.
 * So the door arrives from the host instead, through
 * {@link ExpressionFieldContext} (or the form's `expressionField` prop), and an
 * annotated field with no injected door falls back to the plain string input.
 */
import type { ReactNode } from 'react';
import { useCallback, useContext, useState } from 'react';

import { CompletionInput } from '../components/completion-input';
import { Field } from '../components/field';
import { AlertTriangleIcon } from '../components/icons';
import { Textarea, TextInput } from '../components/inputs';
import { errorMessage } from '../errors';
import { CompletionProviderContext, ExpressionFieldContext } from './context';
import { ExpressionField } from './expression-field';
import type { DateConstraints, ExpressionAnnotation, MediaUpload } from './field-model';
import { MediaField } from './media-field';
import type { CompletionProvider } from './SchemaForm';
import type { FormInputMode } from './types';

export function StringField({
  heading,
  description,
  error,
  format,
  inputMode,
  multiline,
  maxLength,
  minLength,
  media,
  expression,
  date,
  argName,
  value,
  required,
  onChange,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  format: string | undefined;
  inputMode: FormInputMode | undefined;
  multiline: boolean;
  maxLength: number | undefined;
  minLength: number | undefined;
  media: MediaUpload | undefined;
  expression: ExpressionAnnotation | undefined;
  date: DateConstraints | undefined;
  argName: string;
  value: unknown;
  required: boolean;
  onChange: (value: unknown) => void;
}): ReactNode {
  const control = stringControl(format, inputMode);
  const completionProvider = useContext(CompletionProviderContext);
  const expressionField = useContext(ExpressionFieldContext);
  const current = typeof value === 'string' ? value : '';
  // An empty optional field emits `undefined` (drops the key); a required one
  // keeps the empty string so validation can flag it.
  const emit = (next: string): void => {
    onChange(next === '' && !required ? undefined : next);
  };

  // An expression-annotated field renders the injected door — the resting control
  // plus its visual-editor button. Checked before `media` because the expression
  // annotation is the more specific, deliberate opt-in (`x-tai42-expression`);
  // a schema carrying both is contradictory, and an expression is text, not an
  // upload. Not reachable together with the completion provider path: an
  // expression is authored, not completed from server suggestions.
  //
  // With no door injected the annotation has no effect: the field falls through to the
  // ordinary paths below, exactly as a malformed annotation does, so a form
  // renders the same bytes either way.
  if (expression !== undefined && expressionField !== undefined) {
    return (
      <ExpressionField
        component={expressionField}
        heading={heading}
        description={description}
        error={error}
        expression={expression}
        argName={argName}
        value={current}
        onChange={emit}
      />
    );
  }

  // A media-annotated field renders the upload control instead of a text box.
  if (media !== undefined) {
    return (
      <MediaField
        heading={heading}
        description={description}
        error={error}
        media={media}
        value={current}
        onChange={emit}
      />
    );
  }

  return (
    <Field label={heading} description={description} error={error}>
      {completionProvider !== undefined ? (
        <CompletionField
          argName={argName}
          value={current}
          onChange={emit}
          provider={completionProvider}
        />
      ) : multiline ? (
        // `control: textarea` draws a multi-line control; the length bounds draw
        // natively, and a live counter shows the maximum (below).
        <Textarea
          maxLength={maxLength}
          minLength={minLength}
          value={current}
          onChange={(event) => {
            emit(event.target.value);
          }}
        />
      ) : (
        <TextInput
          type={control.type}
          // The keyboard hint for a `numeric`/`decimal` mode (a text box with a
          // numeric/decimal keyboard); `undefined` for every other control, which
          // selects its kind through `type` instead.
          inputMode={control.inputMode}
          // A native date control enforces its inclusive bounds; on a
          // non-date input the browser ignores these, and the validator enforces the
          // rest (unavailable days, range span) that the control cannot draw.
          min={date?.min}
          max={date?.max}
          // The length bounds draw natively (the control caps input at `maxLength`)
          // and the validator enforces them; a counter shows the maximum (below).
          maxLength={maxLength}
          minLength={minLength}
          value={current}
          onChange={(event) => {
            emit(event.target.value);
          }}
        />
      )}
      {/* The live length counter, shown whenever a maximum is declared — on both the
          text box and the text area. It counts code points, matching the validator's
          own `maxLength` check. */}
      {completionProvider === undefined && maxLength !== undefined ? (
        <LengthCounter current={current} max={maxLength} />
      ) : null}
    </Field>
  );
}

/** The `n / max` length hint under a bounded string control. */
function LengthCounter({ current, max }: { current: string; max: number }): ReactNode {
  return (
    <p className="tai-field-hint" style={{ margin: 0 }} aria-live="polite">
      {`${String(Array.from(current).length)} / ${String(max)}`}
    </p>
  );
}

/**
 * A string field backed by argument completions. Split out so its memoised
 * hooks stay unconditional (they cannot live behind the provider check in
 * {@link StringField}) and so the completion `provider` is a non-optional prop.
 */
function CompletionField({
  argName,
  value,
  onChange,
  provider,
}: {
  argName: string;
  value: string;
  onChange: (value: string) => void;
  provider: CompletionProvider;
}): ReactNode {
  // Memoised so its identity is stable across renders: CompletionInput lists
  // `fetchCompletions` in its effect deps, so a fresh function each render would
  // re-fetch on every keystroke in every string field.
  const fetchCompletions = useCallback(
    (partial: string) => provider(argName, partial),
    [provider, argName],
  );
  // A completion fetch is a best-effort enhancement, not a fatal error — but it
  // must never be swallowed. The failure goes to the human as a hint under the
  // input AND to the console with the field's path, because the two audiences
  // need different things: the reason the suggestions are gone, and which field
  // and which throw produced it.
  const [failure, setFailure] = useState<string | null>(null);
  // Memoised for the same effect-deps reason as `fetchCompletions`.
  const onError = useCallback(
    (error: unknown) => {
      console.error(`SchemaForm: completion fetch failed for field "${argName}"`, error);
      setFailure(errorMessage(error));
    },
    [argName],
  );

  return (
    <>
      <CompletionInput
        value={value}
        // Every edit starts a fresh fetch, so the previous one's failure stops
        // being true here; a new one re-reports through `onError`.
        onChange={(next) => {
          setFailure(null);
          onChange(next);
        }}
        fetchCompletions={fetchCompletions}
        onError={onError}
      />
      {/* A degradation, not a rejected value: the field still accepts what is
          typed, only the suggestions are gone. So it wears the warning mark and
          the hint style, never the error one. */}
      {failure === null ? null : (
        <p role="status" className="tai-field-hint" style={{ margin: 0 }}>
          <AlertTriangleIcon />
          {`Suggestions are unavailable: ${failure}`}
        </p>
      )}
    </>
  );
}

// The native control per JSON-Schema `format`. `date` and `time` post the exact
// wire shapes their formats expect (`YYYY-MM-DD`; `HH:mm` or `HH:mm:ss`), so they
// render natively. `date-time` is deliberately absent: the browser's
// `datetime-local` control posts `YYYY-MM-DDTHH:mm` with NO zone offset, which is
// not an RFC 3339 timestamp, so a `date-time` field falls through to a text box
// where the full offset-bearing value can be typed. Any format not listed here is
// a plain text box.
const FORMAT_INPUT_TYPES: Record<string, string> = {
  email: 'email',
  uri: 'url',
  'uri-reference': 'url',
  date: 'date',
  time: 'time',
};

function stringInputType(format: string | undefined): string {
  if (format === undefined) return 'text';
  return FORMAT_INPUT_TYPES[format] ?? 'text';
}

/** The native control each `inputMode` draws. `tel`/`email`/`url` select the
 *  matching input `type`; `numeric`/`decimal` keep a text box and set the HTML
 *  `inputmode` keyboard hint; `text` is a plain text box. */
const INPUT_MODE_CONTROLS: Record<
  FormInputMode,
  { readonly type: string; readonly inputMode: 'numeric' | 'decimal' | undefined }
> = {
  text: { type: 'text', inputMode: undefined },
  numeric: { type: 'text', inputMode: 'numeric' },
  decimal: { type: 'text', inputMode: 'decimal' },
  tel: { type: 'tel', inputMode: undefined },
  email: { type: 'email', inputMode: undefined },
  url: { type: 'url', inputMode: undefined },
};

// The native control for a string field: the `inputMode` keyword OUTRANKS
// `format` when present; otherwise the format mapping picks the control. The value
// is always the typed string — `numeric`/`decimal` set only the keyboard, never a
// number coercion.
function stringControl(
  format: string | undefined,
  inputMode: FormInputMode | undefined,
): { readonly type: string; readonly inputMode: 'numeric' | 'decimal' | undefined } {
  if (inputMode !== undefined) return INPUT_MODE_CONTROLS[inputMode];
  return { type: stringInputType(format), inputMode: undefined };
}
