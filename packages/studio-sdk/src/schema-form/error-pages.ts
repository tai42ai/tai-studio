/**
 * Where a stepped form's validation errors sit: the top-level field an error path belongs
 * to, and the first page that carries an errored field.
 */
import type { SchemaFormErrors } from './types';

/** One page of a stepped form: the top-level fields it shows. */
export interface FormPageFields {
  readonly fields: readonly string[];
}

/** The top-level field an error path belongs to: the segment before its first `.` or `[`,
 * so a nested error (`address.street`, `tags[0]`) maps to its field. */
export function errorPathField(path: string): string {
  const cut = [path.indexOf('.'), path.indexOf('[')].filter((i) => i !== -1);
  return cut.length > 0 ? path.slice(0, Math.min(...cut)) : path;
}

/** The index of the first page whose fields carry an error, or `-1` when none does. */
export function firstPageWithError(
  pages: readonly FormPageFields[],
  errors: SchemaFormErrors,
): number {
  const errored = new Set(Object.keys(errors).map(errorPathField));
  return pages.findIndex((page) => page.fields.some((field) => errored.has(field)));
}
