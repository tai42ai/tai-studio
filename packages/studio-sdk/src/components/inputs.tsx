/**
 * Text-like form controls: `TextInput`, `Textarea`, `NumberInput`. Each is a
 * thin wrapper over the native element wearing the shared control class, and
 * each auto-wires to an enclosing `Field` (id + `aria-describedby` +
 * `aria-invalid`) via `useFieldControl`.
 *
 * The wiring is composed with the caller's own attributes rather than spread
 * before them, because a plain spread let one caller prop silently delete part of
 * it — see {@link wireToField}.
 *
 * A consumer `ref` is FORWARDED to the native control by that same spread, so a
 * caller that has to focus or measure its own input is not pushed out of the
 * design system to get at the element.
 */
import type { AriaAttributes, InputHTMLAttributes, Ref, TextareaHTMLAttributes } from 'react';

import { controlClassName, INPUT_CLASS, TEXTAREA_CLASS } from './control-styles';
import { useFieldControl, type FieldControlProps } from './field';

/** The three attributes a `Field` and its control can both want to own. */
interface WiredControlAttributes {
  readonly id: string | undefined;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-invalid': AriaAttributes['aria-invalid'];
}

/**
 * The enclosing `Field`'s wiring composed with the caller's own attributes, to be
 * written after the caller's prop spread.
 *
 * `id` and `aria-invalid` are the caller's where the caller states them — an
 * explicit prop is a decision, and a Field that hosts more than one control has
 * to be able to give the second one an id of its own. `aria-describedby` is
 * different: it is a LIST, both sides own entries in it legitimately, and the
 * plain spread order made a caller's hint silently delete the field's description
 * and error IDREFs. So the two lists are CONCATENATED, caller's first.
 */
function wireToField(
  field: FieldControlProps,
  own: AriaAttributes & { readonly id?: string },
): WiredControlAttributes {
  const describedBy = [own['aria-describedby'], field['aria-describedby']].filter(
    (id): id is string => id !== undefined,
  );
  return {
    id: own.id ?? field.id,
    'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
    'aria-invalid': own['aria-invalid'] ?? field['aria-invalid'],
  };
}

/** A consumer ref for the native control; the prop spread forwards it. */
interface ControlRefProps<T> {
  readonly ref?: Ref<T>;
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> &
  ControlRefProps<HTMLInputElement>;

export function TextInput({ className, type = 'text', ...props }: TextInputProps) {
  const field = useFieldControl();
  return (
    <input
      {...props}
      {...wireToField(field, props)}
      type={type}
      className={controlClassName(INPUT_CLASS, className)}
    />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  ControlRefProps<HTMLTextAreaElement>;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  const field = useFieldControl();
  return (
    <textarea
      {...props}
      {...wireToField(field, props)}
      rows={rows}
      className={controlClassName(TEXTAREA_CLASS, className)}
    />
  );
}

export type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> &
  ControlRefProps<HTMLInputElement>;

export function NumberInput({ className, ...props }: NumberInputProps) {
  const field = useFieldControl();
  return (
    <input
      {...props}
      {...wireToField(field, props)}
      type="number"
      className={controlClassName(INPUT_CLASS, className)}
    />
  );
}
