/**
 * Renders the property fields of an object schema, one {@link FieldNode} per
 * property. Each child's edits are folded back into an immutable copy of the
 * object value; an optional `skip` omits a property (used for a union's
 * discriminator tag, which the variant picker owns).
 */
import type { ReactNode } from 'react';

import { FieldNode } from './field-node';
import type { JsonSchema, SchemaFormErrors } from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function ObjectFields({
  properties,
  requiredKeys,
  root,
  value,
  onChange,
  path,
  errors,
  idPrefix,
  skip,
  markRequired = false,
}: {
  properties: readonly (readonly [string, JsonSchema])[];
  requiredKeys: ReadonlySet<string>;
  root: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  errors: SchemaFormErrors | undefined;
  idPrefix: string;
  skip: string | undefined;
  /** Mark each required property's label with the DS required marker. */
  markRequired?: boolean;
}): ReactNode {
  const obj = isPlainObject(value) ? value : {};
  return (
    <>
      {properties.map(([name, propSchema]) => {
        if (skip !== undefined && name === skip) return null;
        const childPath = path === '' ? name : `${path}.${name}`;
        return (
          <FieldNode
            key={name}
            schema={propSchema}
            root={root}
            value={obj[name]}
            onChange={(next) => {
              onChange(setKey(obj, name, next));
            }}
            path={childPath}
            label={name}
            required={requiredKeys.has(name)}
            markRequired={markRequired}
            errors={errors}
            idPrefix={idPrefix}
          />
        );
      })}
    </>
  );
}

function setKey(
  obj: Record<string, unknown>,
  name: string,
  next: unknown,
): Record<string, unknown> {
  if (next === undefined) {
    const { [name]: _removed, ...rest } = obj;
    return rest;
  }
  return { ...obj, [name]: next };
}
