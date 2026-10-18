/**
 * Renders the property fields of an object schema, one {@link FieldNode} per
 * property. Each child's edits are folded back into an immutable copy of the
 * object value; an optional `skip` omits a property (used for a union's
 * discriminator tag, which the variant picker owns).
 */
import type { ReactNode } from 'react';

import { ownValue } from '../guards';
import { DateRangeField, dateRangePairs } from './date-range-field';
import { FieldNode } from './field-node';
import { useKeyedCallbacks } from './keyed-callbacks';
import type { JsonSchema, SchemaFormErrors } from './types';
import { isFieldVisible } from './visibility';

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
  fieldWording,
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
  /**
   * Per-property picker placeholders, keyed by property name. Handed to the root form's
   * object only; a property whose `enum` draws as a select shows its entry's
   * `choiceLabel` as the select placeholder. Absent for nested objects.
   */
  fieldWording?: Readonly<Record<string, { choiceLabel?: string; invalid?: string }>>;
}): ReactNode {
  const obj = isPlainObject(value) ? value : {};
  const changeFor = useKeyedCallbacks<string, unknown>(
    (name, next) => {
      onChange(setKey(obj, name, next));
    },
    properties.map(([name]) => name),
  );
  // A drawable date-range pair renders as ONE DateRangeField at the START's slot; the
  // END is skipped. The pairing is `dateRangePairs`, the one definition every surface
  // shares. Properties here are one page's, so the "same page" rule holds by construction.
  const pairs = dateRangePairs(properties);
  const pairByStart = new Map(pairs.map((pair) => [pair.startName, pair]));
  const skippedEnds = new Set(pairs.map((pair) => pair.endName));
  const childPathOf = (name: string): string => (path === '' ? name : `${path}.${name}`);
  return (
    <>
      {properties.map(([name, propSchema]) => {
        if (skip !== undefined && name === skip) return null;
        if (skippedEnds.has(name)) return null;
        // A field hidden by its `visibleWhen` predicate is not rendered; the
        // validator skips it in step, so a hidden field is neither shown nor required.
        if (!isFieldVisible(propSchema, obj)) return null;
        const pair = pairByStart.get(name);
        if (pair !== undefined) {
          return (
            <DateRangeField
              key={name}
              pair={pair}
              startValue={ownValue(obj, pair.startName)}
              endValue={ownValue(obj, pair.endName)}
              startRequired={requiredKeys.has(pair.startName)}
              endRequired={requiredKeys.has(pair.endName)}
              markRequired={markRequired}
              startError={ownValue(errors, childPathOf(pair.startName))}
              endError={ownValue(errors, childPathOf(pair.endName))}
              onChangeStart={changeFor(pair.startName)}
              onChangeEnd={changeFor(pair.endName)}
            />
          );
        }
        return (
          <FieldNode
            key={name}
            schema={propSchema}
            root={root}
            value={ownValue(obj, name)}
            onChange={changeFor(name)}
            path={childPathOf(name)}
            label={name}
            required={requiredKeys.has(name)}
            markRequired={markRequired}
            errors={errors}
            idPrefix={idPrefix}
            choiceLabel={fieldWording?.[name]?.choiceLabel}
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
