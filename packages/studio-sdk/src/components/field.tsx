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

import { AlertTriangleIcon } from './icons';

interface FieldContextValue {
  readonly controlId: string;
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

/** Read the enclosing Field's wiring; a passthrough (all `undefined`) when standalone. */
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
  /**
   * Set when the wrapped control is a GROUP rather than one labelable element —
   * a `RadioGroup`, a set of checkboxes, any `role="radiogroup"`/`role="group"`
   * panel.
   *
   * `<label for>` can only name a labelable element: pointed at a group it
   * either dangles at an id no element carries or names an element the browser
   * refuses to label, and it is inert either way. So a group Field renders the
   * group CONTAINER itself — `role="group"` carrying `aria-labelledby` and
   * `aria-describedby` — and the label becomes a `<span>`, because a `<label>`
   * associated with nothing is a semantics lie.
   *
   * Naming therefore happens BY CONSTRUCTION rather than by the call site
   * remembering to read a hook: the previous shape published the label id and
   * left every group control to point at it, and ten live sites did not. The
   * cost is one extra container announcement where the child has a group role of
   * its own; that is accepted deliberately, because the two failure directions
   * are asymmetric — a redundant container is audible, an unnamed group is
   * silent.
   */
  readonly group?: boolean;
}

export function Field({ label, description, error, children, style, group = false }: FieldProps) {
  const controlId = useId();
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-desc`;
  const errorId = `${controlId}-err`;

  const describedByIds: string[] = [];
  if (description !== undefined) describedByIds.push(descriptionId);
  if (error !== undefined) describedByIds.push(errorId);
  const describedBy = describedByIds.length > 0 ? describedByIds.join(' ') : undefined;

  const value: FieldContextValue = {
    controlId,
    describedBy,
    invalid: error !== undefined,
  };

  // A group publishes NO control wiring: there is no single element to carry the
  // id, and a control that spread `controlId` inside a group would take the
  // group's own name and description for itself.
  return (
    <FieldContext.Provider value={group ? null : value}>
      <div className="tai-field" style={style}>
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
        {/* The icon carries the invalid state alongside the color, never the color alone. */}
        {error !== undefined ? (
          <p id={errorId} role="alert" className="tai-field-error" style={{ margin: 0 }}>
            <AlertTriangleIcon />
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
