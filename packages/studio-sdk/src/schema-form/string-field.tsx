/**
 * The string field renderer. A plain string renders as a text input (its
 * `type` derived from any JSON-Schema `format`); an expression-annotated schema
 * renders the jq field (a resting textarea with the visual-editor door); a
 * media-annotated schema renders the upload control instead; and when the form
 * supplies a completion provider, the input is backed by argument autocomplete.
 *
 * `JqField` is reached through the SDK's own `./jq` re-export — the ONE
 * `@tai42/jq-studio` instance the whole deployment shares — never from
 * `@tai42/jq-studio` directly, which would bundle a second copy and orphan its
 * worker (see the `jq` module doc-comment).
 *
 * That door is loaded LAZILY, through a dynamic `import('../jq')` behind
 * {@link JqField}. The jq authoring door drags a heavy subgraph — the xyflow
 * visual editor, a Web Worker entry, and a wasm engine chunk — that a form
 * whose fields carry no `x-tai42-expression` annotation must never ship. A
 * static import would pin that subgraph into every consumer that bundles the
 * SDK (a host that externalises the SDK is unaffected either way); the dynamic
 * import keeps it out of `schema-form`'s static graph and pulls it only when an
 * annotated field actually mounts.
 */
import type { ReactNode } from 'react';
import { Suspense, lazy, useCallback, useContext, useMemo, useState } from 'react';

import { CompletionInput } from '../components/completion-input';
import { Field } from '../components/field';
import { AlertTriangleIcon } from '../components/icons';
import { TextInput, Textarea } from '../components/inputs';
import { errorMessage } from '../errors';
import type { JqInputShapeDescriptor } from '../jq';
import type { ExpressionAnnotation, MediaUpload } from './classify';
import { CompletionProviderContext } from './context';
import { MediaField } from './media-field';
import type { CompletionProvider } from './SchemaForm';

// The lazily-loaded jq door. Defining it at module scope (never inside a
// component) is what keeps the lazy component's identity stable across renders,
// so React resolves the chunk once and never re-suspends a mounted field. The
// `import('../jq')` here is a DYNAMIC import — the sole runtime edge from
// `schema-form` to the jq door — so the visual editor, worker, and wasm live in
// a split chunk that a non-annotated form never requests. The `type`-only
// import of `JqInputShapeDescriptor` above is erased at compile time and adds no
// such edge.
const JqField = lazy(async () => {
  const { JqField } = await import('../jq');
  return { default: JqField };
});

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
 *
 * The door is code-split ({@link JqField} is a `lazy` component), so it mounts
 * inside a `Suspense` boundary. Its fallback paints the resting shell —
 * label/description/error chrome around the current value in a read-only
 * multiline control — so the field holds its layout and keeps the value visible
 * while the chunk resolves, and the swap to the live door does not flash.
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
    <Suspense
      fallback={
        <JqExpressionFieldSkeleton
          heading={heading}
          description={description}
          error={error}
          value={value}
        />
      }
    >
      <JqField
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
 * The resting shell shown while the jq door chunk loads. It mirrors the live
 * door's footprint — the same label/description/error chrome wrapping a
 * multiline control seeded with the current value — but the control is inert
 * (read-only, `aria-busy`) because there is nothing to edit yet. Matching the
 * footprint is what keeps the Suspense swap from shifting layout or flashing.
 */
function JqExpressionFieldSkeleton({
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
