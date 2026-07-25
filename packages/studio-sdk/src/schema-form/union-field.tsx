/**
 * The union field renderer: a variant picker plus the active variant's fields.
 * An object variant renders its properties inline (skipping the discriminator
 * tag, which the picker owns); a scalar/enum variant renders as a single nested
 * {@link FieldNode}. Selecting a variant seeds a concrete value for it.
 */
import type { ReactNode } from 'react';

import { Field } from '../components/field';
import { Select } from '../components/select';
import { classifySchema, type FieldModel } from './classify';
import { defaultValueForSchema } from './default-value';
import { FieldGroup } from './field-group';
import { FieldNode } from './field-node';
import { ObjectFields } from './object-fields';
import { resolveRef } from './resolve';
import { groupStyle } from './styles';
import { activeVariantIndex } from './union';
import type { JsonSchema, SchemaFormErrors } from './types';

/**
 * A concrete seed for a chosen union variant. Object variants get their
 * required-field skeleton; a scalar/enum variant that has no explicit default
 * still needs a non-`undefined` value so the selection sticks (otherwise
 * `activeVariantIndex` reads it back as "no variant" and the picker snaps empty).
 */
function seedVariantValue(schema: JsonSchema, root: JsonSchema): unknown {
  const seeded = defaultValueForSchema(schema, root);
  if (seeded !== undefined) return seeded;
  const resolved = resolveRef(schema, root);
  if (resolved.const !== undefined) return resolved.const;
  if (resolved.enum !== undefined && resolved.enum.length > 0) return resolved.enum[0];
  switch (classifySchema(schema, root).model.kind) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return undefined;
  }
}

export function UnionField({
  heading,
  description,
  error,
  model,
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
  model: Extract<FieldModel, { kind: 'union' }>;
  root: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  errors: SchemaFormErrors | undefined;
  idPrefix: string;
}): ReactNode {
  const index = activeVariantIndex(value, model.variants, model.discriminator, root);
  const options = model.variants.map((variant, position) => ({
    value: String(position),
    label: variant.label,
  }));
  const selectVariant = (key: string): void => {
    const position = Number(key);
    const variant = model.variants[position];
    if (variant === undefined) return;
    onChange(seedVariantValue(variant.schema, root));
  };

  const active = index === -1 ? undefined : model.variants[index];
  const activeClassified = active === undefined ? undefined : classifySchema(active.schema, root);

  return (
    <FieldGroup heading={heading} description={description} error={error} atRoot={false}>
      <Field label="Variant">
        <Select
          options={options}
          value={index === -1 ? '' : String(index)}
          placeholder="Select a variant…"
          onValueChange={selectVariant}
        />
      </Field>
      {activeClassified?.model.kind === 'object' ? (
        <div style={groupStyle}>
          <ObjectFields
            properties={activeClassified.model.properties}
            requiredKeys={activeClassified.model.required}
            root={root}
            value={value}
            onChange={onChange}
            path={path}
            errors={errors}
            idPrefix={idPrefix}
            skip={model.discriminator}
          />
        </div>
      ) : active !== undefined ? (
        <FieldNode
          schema={active.schema}
          root={root}
          value={value}
          onChange={onChange}
          path={path}
          label={active.label}
          required
          errors={errors}
          idPrefix={idPrefix}
        />
      ) : null}
    </FieldGroup>
  );
}
