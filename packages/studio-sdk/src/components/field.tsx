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

interface FieldContextValue {
  readonly controlId: string;
  readonly labelId: string;
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

/**
 * Read the enclosing Field's label element id, or `undefined` when standalone.
 * A control whose root is not a labelable element (e.g. a `role="radiogroup"`
 * div, which `<label htmlFor>` cannot name) points its `aria-labelledby` at this
 * id to take the field label as its accessible name.
 */
export function useFieldLabelId(): string | undefined {
  const ctx = useContext(FieldContext);
  return ctx === null ? undefined : ctx.labelId;
}

export interface FieldProps {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
}

export function Field({ label, description, error, children, style }: FieldProps) {
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
    labelId,
    describedBy,
    invalid: error !== undefined,
  };

  return (
    <FieldContext.Provider value={value}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--tai-space-2)',
          font: 'var(--tai-text-md) var(--tai-font-sans)',
          color: 'var(--tai-color-text)',
          ...style,
        }}
      >
        <label
          id={labelId}
          htmlFor={controlId}
          style={{ fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}
        >
          {label}
        </label>
        {children}
        {description !== undefined ? (
          <p
            id={descriptionId}
            style={{
              margin: 0,
              fontSize: 'var(--tai-text-sm)',
              color: 'var(--tai-color-text-muted)',
            }}
          >
            {description}
          </p>
        ) : null}
        {error !== undefined ? (
          <p
            id={errorId}
            role="alert"
            style={{ margin: 0, fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-danger)' }}
          >
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
