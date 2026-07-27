/**
 * The wrapper around a nested group of fields (object, array, or union). At the
 * form root it lays children out in a plain stack; below the root it renders a
 * heading, an optional description, an optional error — an icon beside the
 * message, never a hue on its own — and the nested group surface.
 */
import { useId } from 'react';
import type { ReactNode } from 'react';

import { AlertTriangleIcon } from '../components/icons';
import { groupClass, groupHeaderClass, stackClass } from './styles';

export function FieldGroup({
  heading,
  description,
  error,
  atRoot,
  children,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  atRoot: boolean;
  children: ReactNode;
}): ReactNode {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const descriptionId = `${baseId}-desc`;
  const errorId = `${baseId}-err`;

  if (atRoot) {
    return <div className={stackClass}>{children}</div>;
  }

  // The group container carries the ROLE, the name and the description. Without
  // them the heading was a `<span>` — not a heading either — and the description
  // and the validation error were orphaned text: entering a nested object in a
  // schema form announced the controls with no indication of which group they
  // belonged to. It is the same "named by construction" shape `Field group`
  // uses, for the same reason.
  const describedByIds: string[] = [];
  if (description !== undefined) describedByIds.push(descriptionId);
  if (error !== undefined) describedByIds.push(errorId);

  return (
    <div className={groupHeaderClass}>
      <span id={headingId} className="tai-field-label">
        {heading}
      </span>
      {description !== undefined ? (
        <span id={descriptionId} className="tai-field-hint">
          {description}
        </span>
      ) : null}
      {error !== undefined ? (
        <span id={errorId} role="alert" className="tai-field-error">
          <AlertTriangleIcon />
          {error}
        </span>
      ) : null}
      <div
        role="group"
        aria-labelledby={headingId}
        aria-describedby={describedByIds.length > 0 ? describedByIds.join(' ') : undefined}
        className={groupClass}
      >
        {children}
      </div>
    </div>
  );
}
