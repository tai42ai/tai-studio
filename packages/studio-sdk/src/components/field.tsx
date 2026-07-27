/**
 * `Field` — the label + description + error wrapper every form control sits in.
 * It owns one generated id and publishes it (plus the description/error ids and
 * the invalid flag) through a context; a nested control reads them via
 * `useFieldControl` and spreads them, so the label's `htmlFor`, the control's
 * `aria-describedby`, and its `aria-invalid` stay wired without the caller
 * threading ids by hand.
 */
import { createContext, useContext, useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { XCircleIcon } from './icons';

interface FieldContextValue {
  readonly controlId: string | undefined;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** The a11y wiring a form control spreads onto its element. */
export interface FieldControlProps {
  readonly id: string | undefined;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-invalid': true | undefined;
}

/**
 * Read the enclosing Field's wiring.
 *
 * `id` and `aria-describedby` are `undefined` both when there is no Field AND
 * inside a group `Field`: a group has no single element to carry them, and the
 * group container itself already carries the name and the description. Only
 * `aria-invalid` still crosses that boundary, because `role="group"` does not
 * support it (ARIA 1.2), so the control is the sole place an errored group can
 * expose its invalid state.
 */
export function useFieldControl(): FieldControlProps {
  const ctx = useContext(FieldContext);
  if (ctx === null) {
    return { id: undefined, 'aria-describedby': undefined, 'aria-invalid': undefined };
  }
  return {
    id: ctx.controlId,
    'aria-describedby': ctx.describedBy,
    'aria-invalid': ctx.invalid ? true : undefined,
  };
}

export interface FieldProps {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
  /** APPENDED to `tai-field` rather than replacing it, so the field keeps its paint. */
  readonly className?: string;
  /**
   * Set when the wrapped control is a GROUP rather than one labelable element —
   * a `RadioGroup`, a set of checkboxes, any `role="radiogroup"`/`role="group"`
   * panel.
   *
   * `<label for>` can only name a labelable element: pointed at a group it
   * either dangles at an id no element carries or names an element the browser
   * refuses to label, and it is inert either way. So a group Field wraps
   * `children` in the group CONTAINER itself — a `<div role="group">` carrying
   * `aria-labelledby` at the label and `aria-describedby` at the description and
   * error — and the label becomes a `<span>`, because a `<label>` associated
   * with nothing is a semantics lie.
   *
   * IT ALSO CHANGES WHAT A CHILD READS FROM {@link useFieldControl}. The
   * container is what carries the name and the description, so the group Field
   * publishes NEITHER `id` NOR `aria-describedby` — both are `undefined`, and a
   * control that spread them would take the group's own name and description for
   * itself. `aria-invalid` still crosses: `role="group"` does not support it
   * (ARIA 1.2), so the control is the only place an errored group can expose its
   * invalid state.
   *
   * Naming therefore happens BY CONSTRUCTION rather than by the call site
   * remembering to read a hook. The cost is one extra container announcement
   * where the child has a group role of its own; that is accepted deliberately,
   * because the two failure directions are asymmetric — a redundant container is
   * audible, an unnamed group is silent.
   *
   * A group child left UNMARKED is a build failure, not a runtime surprise:
   * `components/field-group.test.ts` ("Field group contract" → "marks every
   * Field whose child does not claim its control id") scans every Field call
   * site in the repository, and a child outside its list of control-id-claiming
   * components — `RadioGroup` among them — reddens until the site passes
   * `group`.
   */
  readonly group?: boolean;
}

export function Field({
  label,
  description,
  error,
  children,
  style,
  className,
  group = false,
}: FieldProps) {
  const controlId = useId();
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-desc`;
  const errorId = `${controlId}-err`;

  const describedByIds: string[] = [];
  if (description !== undefined) describedByIds.push(descriptionId);
  if (error !== undefined) describedByIds.push(errorId);
  const describedBy = describedByIds.length > 0 ? describedByIds.join(' ') : undefined;

  // A group withholds the ID and the DESCRIPTION — there is no single element to
  // carry them, and a control that spread them inside a group would take the
  // group's own name and description for itself — but it still publishes
  // `invalid`. `aria-invalid` is not supported on `role="group"` (ARIA 1.2), so
  // if the group Field withheld it too, a group Field carrying an `error` would
  // expose its invalid state NOWHERE in the accessibility tree.
  const value: FieldContextValue = group
    ? { controlId: undefined, describedBy: undefined, invalid: error !== undefined }
    : { controlId, describedBy, invalid: error !== undefined };

  return (
    <FieldContext.Provider value={value}>
      <div
        className={className === undefined ? 'tai-field' : `tai-field ${className}`}
        style={style}
      >
        {group ? (
          <span id={labelId} className="tai-field-label">
            {label}
          </span>
        ) : (
          <label id={labelId} htmlFor={controlId} className="tai-field-label">
            {label}
          </label>
        )}
        {group ? (
          <div
            role="group"
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            className="tai-field-group"
          >
            {children}
          </div>
        ) : (
          children
        )}
        {description !== undefined ? (
          <p id={descriptionId} className="tai-field-hint" style={{ margin: 0 }}>
            {description}
          </p>
        ) : null}
        {/* The icon carries the invalid state alongside the color, never the color
            alone — and it is the ERROR mark: a rejected value is a definite
            negative, not the warning the triangle states. */}
        {error !== undefined ? (
          <p id={errorId} role="alert" className="tai-field-error" style={{ margin: 0 }}>
            <XCircleIcon />
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
