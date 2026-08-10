/**
 * The recursive dispatcher: classifies a single schema node and renders the
 * matching field component for its model kind (const/number/boolean render
 * inline; every other kind delegates to a dedicated field component). Object,
 * array, and union renderers recurse back through here for their children.
 */
import type { ReactNode } from 'react';

import { Checkbox } from '../components/checkbox';
import { Field } from '../components/field';
import { NumberInput, TextInput } from '../components/inputs';
import { ArrayField } from './array-field';
import { classifySchema } from './classify';
import { EnumField } from './enum-field';
import { FieldGroup } from './field-group';
import { ObjectFields } from './object-fields';
import { RecordField } from './record-field';
import { scalarLabel } from './resolve';
import { StringField } from './string-field';
import { UnionField } from './union-field';
import { UnsupportedNotice } from './unsupported-notice';
import type { JsonSchema, SchemaFormErrors } from './types';

interface FieldNodeProps {
  readonly schema: JsonSchema;
  readonly root: JsonSchema;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly path: string;
  /** The label to show — a property key, array-item caption, or `undefined` at root. */
  readonly label: string | undefined;
  readonly required: boolean;
  readonly errors: SchemaFormErrors | undefined;
  readonly idPrefix: string;
}

function labelText(explicit: string | undefined, label: string | undefined): string {
  return explicit ?? label ?? 'Value';
}

/** A single schema node, dispatched on its classified model kind. */
export function FieldNode(props: FieldNodeProps): ReactNode {
  const { schema, root, value, onChange, path, label, required, errors, idPrefix } = props;
  const classified = classifySchema(schema, root);
  const heading = labelText(classified.title, label);
  const description = classified.description;
  const error = errors?.[path];
  const model = classified.model;

  switch (model.kind) {
    case 'unsupported':
      return (
        <UnsupportedNotice
          heading={heading}
          reason={model.reason}
          description={description}
          error={error}
        />
      );
    case 'const':
      return (
        <Field label={heading} description={description} error={error}>
          <TextInput value={scalarLabel(model.value)} readOnly disabled />
        </Field>
      );
    case 'enum':
      return (
        <EnumField
          heading={heading}
          description={description}
          error={error}
          model={model}
          value={value}
          onChange={onChange}
        />
      );
    case 'string':
      return (
        <StringField
          heading={heading}
          description={description}
          error={error}
          format={model.format}
          media={model.media}
          argName={path}
          value={value}
          required={required}
          onChange={onChange}
        />
      );
    case 'number':
      return (
        <Field label={heading} description={description} error={error}>
          <NumberInput
            step={model.integer ? '1' : 'any'}
            value={typeof value === 'number' ? value : ''}
            onChange={(event) => {
              const raw = event.target.value;
              onChange(raw === '' ? undefined : Number(raw));
            }}
          />
        </Field>
      );
    case 'boolean':
      return (
        <Field label={heading} description={description} error={error}>
          <Checkbox
            checked={value === true}
            onCheckedChange={(checked) => {
              onChange(checked);
            }}
          />
        </Field>
      );
    case 'array':
      return (
        <ArrayField
          heading={heading}
          description={description}
          error={error}
          items={model.items}
          root={root}
          value={value}
          onChange={onChange}
          path={path}
          errors={errors}
          idPrefix={idPrefix}
        />
      );
    case 'object':
      return (
        <FieldGroup heading={heading} description={description} error={error} atRoot={path === ''}>
          <ObjectFields
            properties={model.properties}
            requiredKeys={model.required}
            root={root}
            value={value}
            onChange={onChange}
            path={path}
            errors={errors}
            idPrefix={idPrefix}
            skip={undefined}
          />
        </FieldGroup>
      );
    case 'record':
      return (
        <RecordField
          heading={heading}
          description={description}
          error={error}
          values={model.values}
          root={root}
          value={value}
          onChange={onChange}
          path={path}
          errors={errors}
          idPrefix={idPrefix}
        />
      );
    case 'union':
      return (
        <UnionField
          heading={heading}
          description={description}
          error={error}
          model={model}
          root={root}
          value={value}
          onChange={onChange}
          path={path}
          errors={errors}
          idPrefix={idPrefix}
        />
      );
  }
}
