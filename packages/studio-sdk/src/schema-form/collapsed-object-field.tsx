/**
 * A level of a self-referencing definition that the value does not hold: the
 * field's labelled group with one Add button, which seeds the definition's value
 * for that level. Drawn instead of the level's fields so the nesting stops at the
 * data (see `ExpandedShapesContext`).
 */
import type { ReactNode } from 'react';

import { Button } from '../components/primitives';
import { defaultValueForSchema } from './default-value';
import { FieldGroup } from './field-group';
import { useSeedingAction } from './seeding-action';
import type { JsonSchema } from './types';

export function CollapsedObjectField({
  heading,
  description,
  error,
  definition,
  shape,
  root,
  onChange,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  /** The ref-resolved object schema the Add button seeds. */
  definition: JsonSchema;
  /** The level's object model `shape`, the identity a failure belongs to. */
  shape: object;
  root: JsonSchema;
  onChange: (value: unknown) => void;
}): ReactNode {
  const add = useSeedingAction(shape);
  return (
    <FieldGroup
      heading={heading}
      description={description}
      error={add.failure ?? error}
      atRoot={false}
    >
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const level = add.seed(() => defaultValueForSchema(definition, root));
            if (level.ok) onChange(level.value);
          }}
        >
          Add
        </Button>
      </div>
    </FieldGroup>
  );
}
