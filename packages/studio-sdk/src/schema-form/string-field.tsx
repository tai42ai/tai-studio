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
import { Suspense, useCallback, useContext, useMemo, useState } from 'react';

import { CompletionInput } from '../components/completion-input';
import { Field } from '../components/field';
import { AlertTriangleIcon } from '../components/icons';
import { TextInput, Textarea } from '../components/inputs';
import { errorMessage } from '../errors';
import type { ExpressionAnnotation, MediaUpload } from './classify';
import type { ExpressionFieldComponent, ExpressionInputShape } from './context';
import { CompletionProviderContext, ExpressionFieldContext } from './context';
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
  // With no door injected the annotation is INERT: the field falls through to the
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
 * An expression-annotated string field, rendered through the injected door: a
 * multiline resting control with the door's own visual-editor button. The door
 * brings its own label/description/error chrome (a11y-linked slots), so it is NOT
 * wrapped in the form's `Field` component — the annotation's descriptor fields map
 * onto the input-shape descriptor, and the form's per-field error feeds `error`.
 *
 * The door is rendered as an ELEMENT, never called as a function, so its hooks and
 * state (editor open, worker handle) belong to it and survive re-renders of this
 * field.
 *
 * It mounts inside a `Suspense` boundary because a host is free to inject a `lazy`
 * door to keep the jq subgraph in a split chunk of ITS OWN bundle. The fallback
 * paints the resting shell — label/description/error chrome around the current
 * value in a read-only multiline control — so the field holds its layout and keeps
 * the value visible while that chunk resolves, and the swap does not flash. A door
 * injected eagerly never suspends and renders straight through.
 *
 * The form passes only the props the field owns; a jq door's `serverValidate`,
 * `onEditorOpenChange`, and `compact` stay unwired, because no author-time
 * validation endpoint applies to a schema-declared field, the hosts that render
 * `SchemaForm` register no global shortcuts to mute, and every sibling field shows
 * a visible label (the compact variant is for dense host rows).
 */
function ExpressionField({
  component: Door,
  heading,
  description,
  error,
  expression,
  argName,
  value,
  onChange,
}: {
  component: ExpressionFieldComponent;
  heading: string;
  description: string | undefined;
  error: string | undefined;
  expression: ExpressionAnnotation;
  argName: string;
  value: string;
  onChange: (value: string) => void;
}): ReactNode {
  // Memoised: the descriptor's identity feeds the door's own memoisation, so a
  // fresh object each keystroke would defeat it.
  const shape = useMemo(() => expressionShape(expression, argName), [expression, argName]);
  return (
    <Suspense
      fallback={
        <ExpressionFieldSkeleton
          heading={heading}
          description={description}
          error={error}
          value={value}
        />
      }
    >
      <Door
        label={heading}
        description={description}
        error={error}
        shape={shape}
        multiline
        value={value}
        onChange={onChange}
      />
    </Suspense>
  );
}

/**
 * The resting shell shown while a lazily-injected door resolves. It mirrors the
 * live door's footprint — the same label/description/error chrome wrapping a
 * multiline control seeded with the current value — but the control is inert
 * (read-only, `aria-busy`) because there is nothing to edit yet. Matching the
 * footprint is what keeps the Suspense swap from shifting layout or flashing.
 */
function ExpressionFieldSkeleton({
  heading,
  description,
  error,
  value,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  value: string;
}): ReactNode {
  return (
    <Field label={heading} description={description} error={error}>
      <Textarea value={value} readOnly aria-busy="true" />
    </Field>
  );
}

/**
 * Map a classified expression annotation onto the door's input-shape descriptor.
 * A bare annotation (`language` only) maps to NO descriptor — an undeclared shape
 * is the honest rendering when the server said nothing about `.`. When any
 * descriptor field is present, the required descriptor members the annotation
 * omits fall back to neutral values rather than invented copy.
 */
function expressionShape(
  expression: ExpressionAnnotation,
  argName: string,
): ExpressionInputShape | undefined {
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
