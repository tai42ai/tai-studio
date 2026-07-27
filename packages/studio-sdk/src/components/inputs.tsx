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
 *
 * WHERE A CALLER'S `aria-label` GOES, stated once for the whole SDK because the
 * two families answer differently and only one of them said so:
 *
 * - NATIVE-ATTRIBUTE PASS-THROUGH — `TextInput`, `Textarea`, `NumberInput`,
 *   `RevealInput`, `TagsInput`. Their props ARE the native element's attributes,
 *   so a caller's `aria-label` reaches the element and WINS over the `Field`'s
 *   `<label for>`, exactly as it does in plain HTML. Nothing intercepts it,
 *   because an explicit prop is a decision (see {@link wireToField}) — a `Field`
 *   that hosts two controls needs the second one nameable.
 * - NAMED PROP WITH A DOCUMENTED FALLBACK — `Select` and `Checkbox`. Their
 *   `aria-label` is a prop the component reads, and they DROP it when a `Field`
 *   or an inline `label` already names the control from visible text. Their own
 *   docblocks state that, and it is the behaviour their call sites depend on.
 *
 * The rule that binds BOTH families, and the reason the pass-through one is not a
 * hole: whatever name reaches the control must CONTAIN the `Field`'s visible
 * label (WCAG 2.5.3, Label in Name) — "Fixed kwargs" wrapping a control named
 * "Fixed kwargs JSON" is fine, a control named "Add a tag" under a label reading
 * "Tags" is not, because a voice-control user can only say what they can see.
 * `components/field-group.test.ts` asserts that containment across every call
 * site in the repository. It is deliberately NOT a "the Field always wins" rule:
 * that would delete the per-row disambiguation `ScopesMapper.tsx` gives each of
 * its route inputs, where several identical fields sit in one form and only the
 * caller knows which scope a row belongs to.
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
