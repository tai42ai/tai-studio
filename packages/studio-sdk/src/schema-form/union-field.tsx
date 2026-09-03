/**
 * The union field renderer: a variant picker plus the active variant's fields.
 * An object variant renders its properties inline (skipping the discriminator
 * tag, which the picker owns), with the variant's required fields carrying the
 * design system's required marker; a scalar/enum variant renders as a single
 * nested {@link FieldNode}. Selecting a variant seeds a concrete value for it,
 * preserving the fields the outgoing value shares with the new variant (see
 * {@link switchVariantValue}).
 */
import type { ReactNode } from 'react';

import { Field } from '../components/field';
import { Select } from '../components/select';
import { classifySchema, type FieldModel, type UnionVariant } from './classify';
import { skeletonValueForSchema } from './default-value';
import { FieldGroup } from './field-group';
import { FieldNode } from './field-node';
import { ObjectFields } from './object-fields';
import { resolveRef } from './resolve';
import { groupClass } from './styles';
import { activeVariantIndex } from './union';
import type { JsonSchema, SchemaFormErrors } from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A concrete seed for a chosen union variant. Object variants get their full
 * skeleton (every required field minted, so the seed validates against the
 * variant's own schema); a scalar/enum variant that has no explicit default
 * still needs a non-`undefined` value so the selection sticks (otherwise
 * `activeVariantIndex` reads it back as "no variant" and the picker snaps empty).
 */
function seedVariantValue(schema: JsonSchema, root: JsonSchema): unknown {
  const seeded = skeletonValueForSchema(schema, root);
  if (seeded !== undefined) return seeded;
  const resolved = resolveRef(schema, root);
  if (resolved.const !== undefined) return resolved.const;
  if (resolved.enum !== undefined && resolved.enum.length > 0) return resolved.enum[0];
  return undefined;
}

/**
 * The value committed when the user switches to `target`. Typed values SURVIVE
 * the switch: the target's skeleton is minted first, then every top-level field
 * of the current value whose NAME exists in the target variant's properties is
 * carried over wholesale — the merge happens at the top level only, each carried
 * field keeping its nested contents as-is — so fields both variants share are
 * never silently discarded. Only fields absent from the current value keep
 * their freshly minted seed. The discriminator tag is never carried: it always
 * comes from the target's seed (the old tag would re-select the old variant).
 * A non-object side (scalar variant, or a non-object current value) has no
 * fields to carry, so it reseeds wholesale.
 */
function switchVariantValue(
  current: unknown,
  target: UnionVariant,
  discriminator: string | undefined,
  root: JsonSchema,
): unknown {
  const seeded = seedVariantValue(target.schema, root);
  if (!isPlainObject(current) || !isPlainObject(seeded)) return seeded;
  const { model } = classifySchema(target.schema, root);
  if (model.kind !== 'object') return seeded;
  const targetNames = new Set(model.properties.map(([name]) => name));
  const merged: Record<string, unknown> = { ...seeded };
  for (const [name, held] of Object.entries(current)) {
    if (name === discriminator) continue;
    if (targetNames.has(name)) merged[name] = held;
  }
  return merged;
}

/** Title-case a property name: `kind` → "Kind", `content_type` → "Content Type". */
function titleCaseName(name: string): string {
  return name
    .split(/[_\-\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * The variant picker's label. A discriminated union names the picker after the
 * discriminator property it sets — the property's schema `title` when a variant
 * declares one, else the property name title-cased — so the picker reads as the
 * field it is ("Kind", "Format"). Only a union without a discriminator falls
 * back to the generic "Variant".
 */
function pickerLabel(
  discriminator: string | undefined,
  variants: readonly UnionVariant[],
  root: JsonSchema,
): string {
  if (discriminator === undefined) return 'Variant';
  for (const variant of variants) {
    const property = resolveRef(variant.schema, root).properties?.[discriminator];
    if (property === undefined) continue;
    const title = property.title ?? resolveRef(property, root).title;
    if (typeof title === 'string' && title.length > 0) return title;
  }
  const cased = titleCaseName(discriminator);
  return cased.length > 0 ? cased : 'Variant';
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
    onChange(switchVariantValue(value, variant, model.discriminator, root));
  };

  const active = index === -1 ? undefined : model.variants[index];
  const activeClassified = active === undefined ? undefined : classifySchema(active.schema, root);

  return (
    // At the form root the union sits inside a field the HOST already labels
    // and describes — a synthetic heading there is noise, so it is suppressed
    // exactly as a root object's is; nested unions keep theirs.
    <FieldGroup heading={heading} description={description} error={error} atRoot={path === ''}>
      <Field label={pickerLabel(model.discriminator, model.variants, root)}>
        <Select
          options={options}
          value={index === -1 ? '' : String(index)}
          placeholder="Select a variant…"
          onValueChange={selectVariant}
        />
      </Field>
      {activeClassified?.model.kind === 'object' ? (
        <div className={groupClass}>
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
            markRequired
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
