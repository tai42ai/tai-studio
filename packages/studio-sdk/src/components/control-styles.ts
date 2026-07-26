/**
 * The design-system class each form control wears. The 36 px geometry, the
 * boundary, the placeholder, and the hover/disabled/invalid states all live in
 * `components.css` under these names — this module is the single place a
 * control names the class, so no control re-derives that geometry inline.
 */
export const INPUT_CLASS = 'tai-input';
export const TEXTAREA_CLASS = 'tai-textarea';
export const SELECT_TRIGGER_CLASS = 'tai-select-trigger';

/** A control's class plus the caller's, which sorts last so it can override. */
export function controlClassName(base: string, className: string | undefined): string {
  return className === undefined ? base : `${base} ${className}`;
}
