/**
 * The notice rendered for a schema node the form cannot turn into an input: a
 * warning badge — a mark beside its label, so the meaning never rests on the
 * tint alone — followed by the reason, shown inside a labelled field.
 */
import type { ReactNode } from 'react';

import { Badge } from '../components/badge';
import { Field } from '../components/field';
import { AlertTriangleIcon } from '../components/icons';

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
    <Field label={heading} description={description} error={error} group>
      <div role="alert" className="tai-row">
        <Badge variant="warning">
          <AlertTriangleIcon />
          Unsupported
        </Badge>
        <span className="tai-field-hint">{`unsupported field: ${heading} (${reason})`}</span>
      </div>
    </Field>
  );
}
