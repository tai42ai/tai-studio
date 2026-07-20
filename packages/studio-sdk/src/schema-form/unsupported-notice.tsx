/**
 * The notice rendered for a schema node the form cannot turn into an input: a
 * danger badge plus the reason, shown inside a labelled field.
 */
import type { ReactNode } from 'react';

import { Badge } from '../components/badge';
import { Field } from '../components/field';

export function UnsupportedNotice({
  heading,
  reason,
  description,
  error,
}: {
  heading: string;
  reason: string;
  description: string | undefined;
  error: string | undefined;
}): ReactNode {
  return (
    <Field label={heading} description={description} error={error}>
      <div
        role="alert"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}
      >
        <Badge variant="danger">Unsupported</Badge>
        <span style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
          {`unsupported field: ${heading} (${reason})`}
        </span>
      </div>
    </Field>
  );
}
