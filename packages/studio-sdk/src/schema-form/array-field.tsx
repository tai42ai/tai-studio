/**
 * The array field renderer. Each item is a nested {@link FieldNode}; edits map
 * the list to a new array (add appends a seeded item, remove filters by index).
 * The whole list re-renders as one controlled value, so index keys are correct.
 */
import type { ReactNode } from 'react';

import { CloseIcon } from '../components/icons';
import { Button } from '../components/primitives';
import { classifySchema } from './classify';
import { defaultValueForSchema } from './default-value';
import { FieldGroup } from './field-group';
import { FieldNode } from './field-node';
import type { JsonSchema, SchemaFormErrors } from './types';

export function ArrayField({
  heading,
  description,
  error,
  items,
  root,
  value,
  onChange,
  path,
  errors,
  idPrefix,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  items: JsonSchema;
  root: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  errors: SchemaFormErrors | undefined;
  idPrefix: string;
}): ReactNode {
  const list = Array.isArray(value) ? (value as unknown[]) : [];
  const addItem = (): void => {
    onChange([...list, newItemValue(items, root)]);
  };
  const removeItem = (index: number): void => {
    onChange(list.filter((_, position) => position !== index));
  };
  const setItem = (index: number, next: unknown): void => {
    onChange(list.map((item, position) => (position === index ? next : item)));
  };

  return (
    <FieldGroup heading={heading} description={description} error={error} atRoot={false}>
      {list.length === 0 ? <span className="tai-field-hint">No items</span> : null}
      {list.map((item, index) => (
        <div
          // Index keys are correct here: items have no stable identity and the
          // whole list re-renders as one controlled value on every edit.
          key={index}
          className="tai-row"
        >
          {/* The item takes the row's spare width; the Remove button keeps its own. */}
          <div style={{ flex: 1 }}>
            <FieldNode
              schema={items}
              root={root}
              value={item}
              onChange={(next) => {
                setItem(index, next);
              }}
              path={`${path}[${String(index)}]`}
              label={`Item ${String(index + 1)}`}
              required
              errors={errors}
              idPrefix={idPrefix}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            aria-label={`Remove item ${String(index + 1)}`}
            onClick={() => {
              removeItem(index);
            }}
          >
            <CloseIcon />
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="secondary" onClick={addItem}>
          Add item
        </Button>
      </div>
    </FieldGroup>
  );
}

function newItemValue(schema: JsonSchema, root: JsonSchema): unknown {
  const seeded = defaultValueForSchema(schema, root);
  if (seeded !== undefined) return seeded;
  const classified = classifySchema(schema, root);
  switch (classified.model.kind) {
    case 'string':
      return '';
    case 'boolean':
      return false;
    default:
      return undefined;
  }
}
