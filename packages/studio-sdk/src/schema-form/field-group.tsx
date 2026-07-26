/**
 * The wrapper around a nested group of fields (object, array, or union). At the
 * form root it lays children out in a plain stack; below the root it renders a
 * heading, an optional description, an optional error — an icon beside the
 * message, never a hue on its own — and the nested group surface.
 */
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
  if (atRoot) {
    return <div className={stackClass}>{children}</div>;
  }
  return (
    <div className={groupHeaderClass}>
      <span className="tai-field-label">{heading}</span>
      {description !== undefined ? <span className="tai-field-hint">{description}</span> : null}
      {error !== undefined ? (
        <span role="alert" className="tai-field-error">
          <AlertTriangleIcon />
          {error}
        </span>
      ) : null}
      <div className={groupClass}>{children}</div>
    </div>
  );
}
