/**
 * The pure per-field helpers for the schema-driven Settings tab: value coercion for
 * the input controls and the label/placeholder rules.
 */
import type { SettingsSchema } from '@tai42/api-client';

export type SettingsGroup = SettingsSchema['groups'][number];
export type SettingsFieldModel = SettingsGroup['fields'][number];

/** Render a scalar field value as the string an input control shows. */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Interpret a field value as a boolean for a checkbox. */
export function toBool(value: unknown): boolean {
  return value === true || value === 'true';
}

/** True when a field is a reference to another settings group (non-editable). */
export function isNestedRef(field: SettingsFieldModel): boolean {
  return field.nested_group !== null && field.env_var === '';
}

/** The visible label — a required field carries a trailing marker. */
export function labelOf(field: SettingsFieldModel): string {
  return field.required ? `${field.name} *` : field.name;
}

/**
 * The placeholder shown for an unset field. A field whose declared default is null
 * (no hidden localhost fallback — the None-default doctrine) shows an em-dash, so an
 * empty input reads honestly as "no value, no default" rather than a blank that
 * could imply a silent default.
 */
export function placeholderOf(field: SettingsFieldModel): string {
  return field.default === null || field.default === undefined ? '—' : toText(field.default);
}
