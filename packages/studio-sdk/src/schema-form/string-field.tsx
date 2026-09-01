/**
 * The string field renderer. A plain string renders as a text input (its
 * `type` derived from any JSON-Schema `format`); an expression-annotated schema
 * renders the jq field (a resting textarea with the visual-editor door); a
 * media-annotated schema renders the upload control instead; and when the form
 * supplies a completion provider, the input is backed by argument autocomplete.
 *
 * `JqField` is imported through the SDK's own `./jq` re-export — the ONE
 * `@tai42/jq-studio` instance the whole deployment shares — never from
 * `@tai42/jq-studio` directly, which would bundle a second copy and orphan its
 * worker (see the `jq` module doc-comment).
 */
import type { ReactNode } from 'react';
import { useCallback, useContext, useMemo, useState } from 'react';

import { CompletionInput } from '../components/completion-input';
import { Field } from '../components/field';
import { AlertTriangleIcon } from '../components/icons';
import { TextInput } from '../components/inputs';
import { errorMessage } from '../errors';
import { JqField, type JqInputShapeDescriptor } from '../jq';
import type { ExpressionAnnotation, MediaUpload } from './classify';
import { CompletionProviderContext } from './context';
import { MediaField } from './media-field';
import type { CompletionProvider } from './SchemaForm';

export function StringField({
  heading,
  description,
  error,
  format,
  media,
  expression,
  argName,
  value,
  required,
  onChange,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  format: string | undefined;
  media: MediaUpload | undefined;
  expression: ExpressionAnnotation | undefined;
  argName: string;
  value: unknown;
  required: boolean;
  onChange: (value: unknown) => void;
}): ReactNode {
  const completionProvider = useContext(CompletionProviderContext);
  const current = typeof value === 'string' ? value : '';
  // An empty optional field emits `undefined` (drops the key); a required one
  // keeps the empty string so validation can flag it.
  const emit = (next: string): void => {
    onChange(next === '' && !required ? undefined : next);
  };

  // An expression-annotated field renders the jq field — the resting control plus
  // the visual-editor door. Checked before `media` because the expression
  // annotation is the more specific, deliberate opt-in (`x-tai42-expression`);
  // a schema carrying both is contradictory, and a jq expression is text, not an
  // upload. Not reachable together with the completion provider path: an
  // expression is authored, not completed from server suggestions.
  if (expression !== undefined) {
    return (
      <JqExpressionField
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
      ) : (
        <TextInput
          type={stringInputType(format)}
          value={current}
          onChange={(event) => {
            emit(event.target.value);
          }}
        />
      )}
    </Field>
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

/**
 * An expression-annotated string field, rendered as `JqField`: a multiline
 * resting control with the always-present visual-editor door. `JqField` brings
 * its own label/description/error chrome (a11y-linked slots), so it is NOT
 * wrapped in the form's `Field` component — the annotation's descriptor fields
 * map onto jq-studio's input-shape descriptor, and the form's per-field error
 * feeds the `error` prop.
 *
 * Deliberately unwired:
 * - `serverValidate` — no author-time validation endpoint applies to a
 *   schema-declared field (the WASM runtime still powers the Test panel locally).
 * - `onEditorOpenChange` — the hosts that render `SchemaForm` register no global
 *   keyboard shortcuts, so there is nothing to mute while the editor is open.
 * - `compact` — the form renders every sibling field with a visible label;
 *   the compact variant (visually-hidden label, icon-only door) is for dense
 *   host rows, which the schema form does not have.
 */
function JqExpressionField({
  heading,
  description,
  error,
  expression,
  argName,
  value,
  onChange,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  expression: ExpressionAnnotation;
  argName: string;
  value: string;
  onChange: (value: string) => void;
}): ReactNode {
  // Memoised: the descriptor's identity feeds jq-studio's own memoisation, so a
  // fresh object each keystroke would defeat it.
  const shape = useMemo(() => expressionShape(expression, argName), [expression, argName]);
  return (
    <JqField
      label={heading}
      description={description}
      error={error}
      shape={shape}
      multiline
      value={value}
      onChange={onChange}
    />
  );
}

/**
 * Map a classified expression annotation onto jq-studio's input-shape
 * descriptor. A bare annotation (`language` only) maps to NO descriptor — the
 * undeclared-shape `JqField` is the honest rendering when the server said
 * nothing about `.`. When any descriptor field is present, the required
 * descriptor members the annotation omits fall back to neutral values rather
 * than invented copy.
 */
function expressionShape(
  expression: ExpressionAnnotation,
  argName: string,
): JqInputShapeDescriptor | undefined {
  const declared =
    expression.label !== undefined ||
    expression.blurb !== undefined ||
    expression.keys !== undefined ||
    expression.returns !== undefined ||
    expression.caveats !== undefined ||
    expression.hasSample;
  if (!declared) return undefined;
  return {
    // Opaque, host-namespaced, stable per field (memoisation/telemetry only).
    id: argName === '' ? 'tai42.schema-form' : `tai42.schema-form.${argName}`,
    label: expression.label ?? 'input',
    blurb: expression.blurb ?? '',
    keys: expression.keys ?? [],
    returns: expression.returns ?? '',
    ...(expression.caveats === undefined ? {} : { caveats: expression.caveats }),
    ...(expression.hasSample ? { sample: expression.sample } : {}),
  };
}

const FORMAT_INPUT_TYPES: Record<string, string> = {
  email: 'email',
  uri: 'url',
  'uri-reference': 'url',
  date: 'date',
  'date-time': 'datetime-local',
  time: 'time',
};

function stringInputType(format: string | undefined): string {
  if (format === undefined) return 'text';
  return FORMAT_INPUT_TYPES[format] ?? 'text';
}
