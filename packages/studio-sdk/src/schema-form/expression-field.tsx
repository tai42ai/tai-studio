/**
 * The injected expression door as a schema-form field: an `x-tai42-expression`
 * annotation mapped onto the door's input-shape descriptor, and the door mounted
 * inside a Suspense boundary that paints a resting shell while a lazily-injected
 * door resolves. A jq-annotated string draws it as the whole field; a jq-annotated
 * templated-text field draws it as its inline editor.
 *
 * NO JQ EDGE: the door arrives from the host (see `ExpressionFieldContext`);
 * this module names no jq type.
 */
import type { ReactNode } from 'react';
import { Suspense, useMemo } from 'react';

import { Field } from '../components/field';
import { Textarea } from '../components/inputs';
import type { ExpressionFieldComponent, ExpressionInputShape } from './context';
import type { ExpressionAnnotation } from './field-model';

/**
 * An expression-annotated field, rendered through the injected door: a
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
export function ExpressionField({
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
 * multiline control seeded with the current value — but the control is
 * non-interactive (read-only, `aria-busy`) because there is nothing to edit yet. Matching the
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
    [
      expression.label,
      expression.blurb,
      expression.keys,
      expression.variables,
      expression.returns,
      expression.caveats,
    ].some((field) => field !== undefined) || expression.hasSample;
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
    ...(expression.variables === undefined
      ? {}
      : { variables: expression.variables.map(expressionVariable) }),
  };
}

/** Map one classified annotation variable onto the door's variable descriptor. */
function expressionVariable(
  variable: NonNullable<ExpressionAnnotation['variables']>[number],
): NonNullable<ExpressionInputShape['variables']>[number] {
  return {
    name: variable.name,
    blurb: variable.blurb,
    // The annotation glosses no sub-keys of a variable's value, so the door gets
    // the variable's shape as untyped (empty keys).
    keys: [],
    ...(variable.hasSample ? { sample: variable.sample } : {}),
  };
}
