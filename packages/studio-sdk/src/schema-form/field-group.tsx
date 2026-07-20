/**
 * The wrapper around a nested group of fields (object, array, or union). At the
 * form root it lays children out in a plain stack; below the root it renders a
 * heading, optional description/error, and an indented group container.
 */
import type { ReactNode } from 'react';

import { groupStyle, stackStyle } from './styles';

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
    return <div style={stackStyle}>{children}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <span
        style={{ fontSize: 'var(--tai-text-sm)', fontWeight: 600, color: 'var(--tai-color-text)' }}
      >
        {heading}
      </span>
      {description !== undefined ? (
        <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
          {description}
        </span>
      ) : null}
      {error !== undefined ? (
        <span
          role="alert"
          style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-danger)' }}
        >
          {error}
        </span>
      ) : null}
      <div style={groupStyle}>{children}</div>
    </div>
  );
}
