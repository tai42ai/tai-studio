/**
 * The recursive dispatcher: classifies a single schema node and renders the
 * matching field component for its model kind (const/number/boolean render
 * inline; every other kind delegates to a dedicated field component). Object,
 * array, and union renderers recurse back through here for their children.
 */
import { memo, type ReactNode, useContext } from 'react';

import { Checkbox } from '../components/checkbox';
import { Field } from '../components/field';
import { NumberInput, TextInput } from '../components/inputs';
import { isRecord, ownValue } from '../guards';
import { ArrayField } from './array-field';
import { classifySchema } from './classify';
import { CollapsedObjectField } from './collapsed-object-field';
import { ExpandedShapesContext } from './context';
import { EnumField } from './enum-field';
import { FieldGroup } from './field-group';
import type { FieldModel } from './field-model';
import { JsonField } from './json-field';
import { MultiSelectField } from './multiselect-field';
import { ObjectFields } from './object-fields';
import { RecordField } from './record-field';
import { scalarLabel } from './resolve';
import { StringField } from './string-field';
import { TemplatedField } from './templated-field';
import type { FieldWords, JsonSchema, SchemaFormErrors } from './types';
import { UnionField } from './union-field';

interface FieldNodeProps {
  readonly schema: JsonSchema;
  readonly root: JsonSchema;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly path: string;
  /** The label to show — a property key, array-item caption, or `undefined` at root. */
  readonly label: string | undefined;
  readonly required: boolean;
  /**
   * Append the design system's required marker (a trailing ` *`, the same
   * convention host forms use on their own labels) to the heading when the
   * field is required. Opt-in per face: the union variant surface sets it so
   * the ACTIVE variant's obligations read at a glance.
   */
  readonly markRequired?: boolean;
  readonly errors: SchemaFormErrors | undefined;
  readonly idPrefix: string;
  /**
   * Per-field words keyed by property name, handed to an OBJECT node so its direct
   * children draw them (an `enum` select's placeholder, a list's words). Carried by the
   * root form only; nested objects receive none.
   */
  readonly fieldWording?: Readonly<Record<string, FieldWords>>;
  /** This field's own picker placeholder, when it draws as an `enum` select. */
  readonly choiceLabel?: string;
  /** This field's own list words, when it draws as a list. */
  readonly listWords?: FieldWords;
}

function labelText(explicit: string | undefined, label: string | undefined): string {
  return explicit ?? label ?? 'Value';
}

/**
 * A single schema node, dispatched on its classified model kind. Wrapped in
 * `memo` so a field whose props are unchanged is skipped: the containers hand
 * each child a referentially-stable `onChange` (see {@link useKeyedCallbacks})
 * and the controlled value keeps unedited branches identity-equal, so editing
 * one field re-renders only that field's subtree, not every sibling.
 */
function FieldNodeImpl(props: FieldNodeProps): ReactNode {
  const { root, value, onChange, path, required, idPrefix, errors } = props;
  const expanded = useContext(ExpandedShapesContext);
  const classified = classifySchema(props.schema, root);
  const base = labelText(classified.title, props.label);
  const heading = props.markRequired === true && required ? `${base} *` : base;
  const { model, description } = classified;
  return renderField({
    model,
    definition: classified.schema,
    expanded,
    nullable: classified.nullable,
    heading,
    description,
    error: ownValue(errors, path),
    root,
    value,
    onChange,
    path,
    required,
    errors,
    idPrefix,
    fieldWording: props.fieldWording,
    choiceLabel: props.choiceLabel,
    listWords: props.listWords,
  });
}

/** The props the per-kind renderer needs, computed once by {@link FieldNodeImpl}. */
interface RenderFieldArgs {
  readonly model: FieldModel;
  /** The ref-resolved schema the model was classified from. */
  readonly definition: JsonSchema;
  /** The object shapes the fields above this one are drawing. */
  readonly expanded: ReadonlySet<object>;
  readonly nullable: boolean;
  readonly heading: string;
  readonly description: string | undefined;
  readonly error: string | undefined;
  readonly root: JsonSchema;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly path: string;
  readonly required: boolean;
  readonly errors: SchemaFormErrors | undefined;
  readonly idPrefix: string;
  readonly fieldWording?: Readonly<Record<string, FieldWords>>;
  readonly choiceLabel?: string;
  readonly listWords?: FieldWords;
}

/** Render the field component matching the classified model kind. */
function renderField(args: RenderFieldArgs): ReactNode {
  const { model, nullable, heading, description, error, value, onChange, path, required } = args;
  switch (model.kind) {
    case 'json':
      return (
        <JsonField
          heading={heading}
          description={description}
          error={error}
          jsonType={model.jsonType}
          nullable={nullable}
          value={value}
          onChange={onChange}
        />
      );
    case 'const':
      return (
        <ConstField
          heading={heading}
          description={description}
          error={error}
          constValue={model.value}
        />
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
          choiceLabel={args.choiceLabel}
        />
      );
    case 'string':
      return (
        <StringField
          heading={heading}
          description={description}
          error={error}
          format={model.format}
          inputMode={model.inputMode}
          multiline={model.multiline}
          maxLength={model.maxLength}
          minLength={model.minLength}
          media={model.media}
          expression={model.expression}
          date={model.date}
          argName={path}
          value={value}
          required={required}
          onChange={onChange}
        />
      );
    case 'number':
      return (
        <NumberField
          heading={heading}
          description={description}
          error={error}
          integer={model.integer}
          value={value}
          onChange={onChange}
        />
      );
    case 'boolean':
      return (
        <BooleanField
          heading={heading}
          description={description}
          error={error}
          value={value}
          onChange={onChange}
        />
      );
    case 'templated-text':
      return (
        <TemplatedField
          heading={heading}
          description={description}
          error={error}
          expression={model.expression}
          argName={path}
          required={required}
          value={value}
          onChange={onChange}
        />
      );
    case 'multiselect':
      return (
        <MultiSelectField
          heading={heading}
          description={description}
          error={error}
          model={model}
          value={value}
          onChange={onChange}
        />
      );
    default:
      return renderCompositeField(args, model);
  }
}

/** The composite (recursing) field kinds: array, object, record, and union. */
function renderCompositeField(
  args: RenderFieldArgs,
  model: Extract<FieldModel, { kind: 'array' | 'object' | 'record' | 'union' }>,
): ReactNode {
  const { heading, description, error, root, value, onChange, path, errors, idPrefix } = args;
  const { fieldWording } = args;
  switch (model.kind) {
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
          words={args.listWords}
        />
      );
    case 'object':
      // A definition nested inside itself draws its fields only for a level the
      // value holds; an absent level is one Add button, so the nesting stops at the data.
      if (args.expanded.has(model.shape) && !isRecord(value)) {
        return (
          <CollapsedObjectField
            heading={heading}
            description={description}
            error={error}
            definition={args.definition}
            shape={model.shape}
            root={root}
            onChange={onChange}
          />
        );
      }
      return (
        <FieldGroup heading={heading} description={description} error={error} atRoot={path === ''}>
          <ObjectFields
            properties={model.properties}
            shape={model.shape}
            requiredKeys={model.required}
            root={root}
            value={value}
            onChange={onChange}
            path={path}
            errors={errors}
            idPrefix={idPrefix}
            skip={undefined}
            fieldWording={fieldWording}
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

export const FieldNode = memo(FieldNodeImpl);

/** The label/description/error chrome every scalar leaf field shares. */
interface ScalarFieldChrome {
  readonly heading: string;
  readonly description: string | undefined;
  readonly error: string | undefined;
}

/** A `const`-pinned value: shown read-only, never editable. */
function ConstField({
  heading,
  description,
  error,
  constValue,
}: ScalarFieldChrome & { constValue: unknown }): ReactNode {
  return (
    <Field label={heading} description={description} error={error}>
      <TextInput value={scalarLabel(constValue)} readOnly disabled />
    </Field>
  );
}

/** A number/integer field; an empty input clears the value to `undefined`. */
function NumberField({
  heading,
  description,
  error,
  integer,
  value,
  onChange,
}: ScalarFieldChrome & {
  integer: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}): ReactNode {
  return (
    <Field label={heading} description={description} error={error}>
      <NumberInput
        step={integer ? '1' : 'any'}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === '' ? undefined : Number(raw));
        }}
      />
    </Field>
  );
}

/** A boolean field rendered as a checkbox. */
function BooleanField({
  heading,
  description,
  error,
  value,
  onChange,
}: ScalarFieldChrome & { value: unknown; onChange: (value: unknown) => void }): ReactNode {
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
}
