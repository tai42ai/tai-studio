/**
 * Text-like form controls: `TextInput`, `Textarea`, `NumberInput`. Each is a
 * thin wrapper over the native element wearing the shared control class, and
 * each auto-wires to an enclosing `Field` (id + `aria-describedby` +
 * `aria-invalid`) via `useFieldControl`.
 */
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { controlClassName, INPUT_CLASS, TEXTAREA_CLASS } from './control-styles';
import { useFieldControl } from './field';

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function TextInput({ className, type = 'text', ...props }: TextInputProps) {
  const field = useFieldControl();
  return (
    <input {...field} type={type} {...props} className={controlClassName(INPUT_CLASS, className)} />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  const field = useFieldControl();
  return (
    <textarea
      {...field}
      rows={rows}
      {...props}
      className={controlClassName(TEXTAREA_CLASS, className)}
    />
  );
}

export type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function NumberInput({ className, ...props }: NumberInputProps) {
  const field = useFieldControl();
  return (
    <input
      {...field}
      type="number"
      {...props}
      className={controlClassName(INPUT_CLASS, className)}
    />
  );
}
