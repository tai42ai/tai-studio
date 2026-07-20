/**
 * Text-like form controls: `TextInput`, `Textarea`, `NumberInput`. Each is a thin
 * token-styled wrapper over the native element and auto-wires to an enclosing
 * `Field` (id + `aria-describedby` + `aria-invalid`) via `useFieldControl`.
 */
import type { CSSProperties, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { controlBaseStyle } from './control-styles';
import { useFieldControl } from './field';

function merge(style: CSSProperties | undefined): CSSProperties {
  return { ...controlBaseStyle, ...style };
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function TextInput({ style, type = 'text', ...props }: TextInputProps) {
  const field = useFieldControl();
  return <input {...field} type={type} {...props} style={merge(style)} />;
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ style, rows = 4, ...props }: TextareaProps) {
  const field = useFieldControl();
  return <textarea {...field} rows={rows} {...props} style={merge(style)} />;
}

export type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function NumberInput({ style, ...props }: NumberInputProps) {
  const field = useFieldControl();
  return <input {...field} type="number" {...props} style={merge(style)} />;
}
