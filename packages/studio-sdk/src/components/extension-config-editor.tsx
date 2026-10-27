/**
 * `ExtensionConfigEditor` — the settings form of one drafted extension, driven by
 * the extension's declared `config_schema`.
 *
 * The schema's top-level properties split in two: a property whose node `$ref`s the
 * JSON Schema meta-schema holds a JSON Schema and is authored with a `SchemaEditor`;
 * every other property is authored by one `SchemaForm`. A top-level setting whose
 * seeded value holds an `!ENV` marker is sealed: it renders as a read-only row naming
 * the variables, is emitted exactly as seeded, and counts as valid (the server checks
 * the resolved value). A schema this editor cannot render — a meta-schema `$ref` below
 * the top level, or a `$ref` outside the document — shows an error and reports invalid.
 *
 * It reports `{ config, valid }` through `onChange` on mount and on every edit.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { collectEnvRefs } from '../env-markers';
import { SchemaEditor, type SchemaEditorDraft } from '../schema-editor';
import { defaultValueForSchema } from '../schema-form/default-value';
import { JSON_SCHEMA_META_URI } from '../schema-form/json-schema-meta';
import { SchemaForm } from '../schema-form/SchemaForm';
import type { JsonSchema } from '../schema-form/types';
import { validateAgainstSchema } from '../schema-form/validate';
import { ErrorState } from './primitives';

export interface ExtensionConfigChange {
  readonly config: Record<string, unknown>;
  readonly valid: boolean;
}

export interface ExtensionConfigEditorProps {
  /** The extension's name; it names the settings group. */
  readonly name: string;
  /** The extension's declared `config_schema`. */
  readonly schema: JsonSchema;
  /** The element's stored settings when editing, else `undefined`. Read once, on mount. */
  readonly value: Record<string, unknown> | undefined;
  readonly onChange: (next: ExtensionConfigChange) => void;
  readonly disabled?: boolean;
  readonly idPrefix: string;
}

type SchemaSettings = Readonly<Record<string, SchemaEditorDraft>>;

const isMetaRef = (node: JsonSchema): boolean => node.$ref === JSON_SCHEMA_META_URI;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The sub-schemas of a node, each with its path. */
function childNodes(node: JsonSchema, path: string): [JsonSchema, string][] {
  const children: [JsonSchema, string][] = [];
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    children.push([child, `${path}.${key}`]);
  }
  if (node.items !== undefined) children.push([node.items, `${path}[]`]);
  if (isRecord(node.additionalProperties)) {
    children.push([node.additionalProperties, `${path}.*`]);
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    (node[keyword] ?? []).forEach((child, index) => {
      children.push([child, `${path}.${keyword}[${String(index)}]`]);
    });
  }
  for (const keyword of ['$defs', 'definitions'] as const) {
    for (const [key, child] of Object.entries(node[keyword] ?? {})) {
      children.push([child, `${path}.${keyword}.${key}`]);
    }
  }
  return children;
}

/** Why a (non top-level-setting) node cannot be rendered here, or `null`. */
function nestedReason(node: JsonSchema, path: string): string | null {
  if (isMetaRef(node)) return `a JSON Schema setting is nested at ${path}`;
  if (node.$ref !== undefined && !node.$ref.startsWith('#')) {
    return `the reference ${node.$ref} at ${path} is outside this schema`;
  }
  for (const [child, childPath] of childNodes(node, path)) {
    const reason = nestedReason(child, childPath);
    if (reason !== null) return reason;
  }
  return null;
}

/** Why the declared schema cannot be rendered here, or `null` when it can. A
 *  meta-schema `$ref` is accepted only as a top-level property's own node. */
function unrenderableReason(schema: JsonSchema): string | null {
  if (isMetaRef(schema)) return 'the whole settings value is a JSON Schema';
  if (schema.$ref !== undefined && !schema.$ref.startsWith('#')) {
    return `the reference ${schema.$ref} at $ is outside this schema`;
  }
  const topProperties = schema.properties ?? {};
  for (const [child, childPath] of childNodes(schema, '$')) {
    const key = childPath.slice(2);
    if (topProperties[key] === child && isMetaRef(child)) continue;
    const reason = nestedReason(child, childPath);
    if (reason !== null) return reason;
  }
  return null;
}

interface Split {
  readonly formSchema: JsonSchema;
  readonly schemaKeys: readonly string[];
  readonly sealed: Readonly<Record<string, unknown>>;
}

function splitSchema(schema: JsonSchema, seed: Record<string, unknown> | undefined): Split {
  const properties = schema.properties ?? {};
  const sealed: Record<string, unknown> = {};
  if (seed !== undefined) {
    for (const key of Object.keys(properties)) {
      if (key in seed && collectEnvRefs(seed[key]).size > 0) sealed[key] = seed[key];
    }
  }
  const schemaKeys: string[] = [];
  const rest: Record<string, JsonSchema> = {};
  for (const [key, node] of Object.entries(properties)) {
    if (key in sealed) continue;
    if (isMetaRef(node)) schemaKeys.push(key);
    else rest[key] = node;
  }
  const formSchema: JsonSchema = {
    ...schema,
    properties: rest,
    required: (schema.required ?? []).filter((key) => key in rest),
  };
  return { formSchema, schemaKeys, sealed };
}

function settingLabel(schema: JsonSchema, key: string): string {
  return schema.properties?.[key]?.title ?? key;
}

/** The read-only row of a sealed setting: its label and the env variables it names. */
function SealedRow({ label, value }: { readonly label: string; readonly value: unknown }) {
  const names = [...collectEnvRefs(value)].join(', ');
  return (
    <div className="tai-stack tai-stack-1">
      <span className="tai-field-label">{label}</span>
      <span className="tai-muted">{`Env reference ${names}, kept as written.`}</span>
    </div>
  );
}

function SettingsGroup({
  name,
  disabled,
  children,
}: {
  readonly name: string;
  readonly disabled?: boolean | undefined;
  readonly children: ReactNode;
}) {
  return (
    <fieldset
      className="tai-stack tai-stack-2"
      style={{ border: 'none', margin: 0, padding: 0 }}
      disabled={disabled}
    >
      <legend className="tai-field-label">{`${name} settings`}</legend>
      {children}
    </fieldset>
  );
}

/** Keeps the latest `onChange` so the report effect runs on value changes only. */
function useLatest<T>(current: T): { readonly current: T } {
  const ref = useRef(current);
  useEffect(() => {
    ref.current = current;
  });
  return ref;
}

export function ExtensionConfigEditor({
  name,
  schema,
  value,
  onChange,
  disabled,
  idPrefix,
}: ExtensionConfigEditorProps): ReactNode {
  const [reason] = useState(() => unrenderableReason(schema));
  if (reason !== null) {
    return <UnrenderableSettings name={name} reason={reason} value={value} onChange={onChange} />;
  }
  return (
    <RenderableSettings
      name={name}
      schema={schema}
      value={value}
      onChange={onChange}
      disabled={disabled}
      idPrefix={idPrefix}
    />
  );
}

function UnrenderableSettings({
  name,
  reason,
  value,
  onChange,
}: {
  readonly name: string;
  readonly reason: string;
  readonly value: Record<string, unknown> | undefined;
  readonly onChange: (next: ExtensionConfigChange) => void;
}): ReactNode {
  const latest = useLatest(onChange);
  useEffect(() => {
    latest.current({ config: value ?? {}, valid: false });
  }, [latest, value]);
  return (
    <SettingsGroup name={name}>
      <ErrorState message={`The settings of ${name} cannot be edited here: ${reason}.`} />
    </SettingsGroup>
  );
}

function RenderableSettings({
  name,
  schema,
  value,
  onChange,
  disabled,
  idPrefix,
}: ExtensionConfigEditorProps): ReactNode {
  const [split] = useState(() => splitSchema(schema, value));
  const { formSchema, schemaKeys, sealed } = split;
  const [formValue, setFormValue] = useState<unknown>(() => {
    if (value === undefined) return defaultValueForSchema(formSchema);
    const seeded: Record<string, unknown> = {};
    for (const [key, stored] of Object.entries(value)) {
      if (!schemaKeys.includes(key) && !(key in sealed)) seeded[key] = stored;
    }
    return seeded;
  });
  const [schemaSettings, setSchemaSettings] = useState<SchemaSettings>(() => {
    const seeded: Record<string, SchemaEditorDraft> = {};
    for (const key of schemaKeys) {
      const stored = value?.[key];
      seeded[key] = { schema: isRecord(stored) ? stored : null, valid: true };
    }
    return seeded;
  });

  const formErrors = validateAgainstSchema(formSchema, formValue);
  const required = new Set(schema.required ?? []);
  const valid =
    Object.keys(formErrors).length === 0 &&
    schemaKeys.every((key) => {
      const setting = schemaSettings[key];
      return (
        setting !== undefined && setting.valid && (!required.has(key) || setting.schema !== null)
      );
    });

  const latest = useLatest(onChange);
  useEffect(() => {
    const config: Record<string, unknown> = { ...(isRecord(formValue) ? formValue : {}) };
    for (const key of schemaKeys) {
      const setting = schemaSettings[key]?.schema;
      if (setting !== null && setting !== undefined) config[key] = setting;
    }
    Object.assign(config, sealed);
    latest.current({ config, valid });
  }, [latest, formValue, schemaSettings, schemaKeys, sealed, valid]);

  const hasFormFields = Object.keys(formSchema.properties ?? {}).length > 0;
  return (
    <SettingsGroup name={name} disabled={disabled}>
      {Object.entries(sealed).map(([key, sealedValue]) => (
        <SealedRow key={key} label={settingLabel(schema, key)} value={sealedValue} />
      ))}
      {hasFormFields ? (
        <SchemaForm
          schema={formSchema}
          value={formValue}
          onChange={setFormValue}
          errors={formErrors}
          idPrefix={`${idPrefix}-form`}
        />
      ) : null}
      {schemaKeys.map((key) => {
        const node = schema.properties?.[key];
        return (
          <SchemaEditor
            key={key}
            value={schemaSettings[key]?.schema ?? null}
            onChange={(change) => {
              setSchemaSettings((current) => ({ ...current, [key]: change }));
            }}
            requireTitle={false}
            label={settingLabel(schema, key)}
            description={node?.description}
            disabled={disabled}
            idPrefix={`${idPrefix}-${key}`}
          />
        );
      })}
    </SettingsGroup>
  );
}
